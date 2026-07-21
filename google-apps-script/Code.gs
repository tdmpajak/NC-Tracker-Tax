/**
 * LOGBOOK VERIFIKASI PAJAK - PAYMENT REQUEST (NC)
 * Backend Google Apps Script
 *
 * CARA DEPLOY:
 * 1. Buka Google Sheet baru -> Extensions > Apps Script
 * 2. Hapus isi Code.gs default, paste seluruh isi file ini
 * 3. Klik Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy URL Web App yang muncul, tempel ke assets/app.js (API_URL) dan assets/tracking.js
 * 5. Setiap kali edit script, klik Deploy > Manage deployments > Edit > New version
 */

const SHEET_NAME = 'Tracking';
const FOLDER_MASUK_NAME = 'Berkas Masuk - Payment Request';
const FOLDER_VERIFIKASI_NAME = 'Berkas Terverifikasi - Payment Request';

// Password otorisasi admin -- SEKARANG divalidasi di server (bukan cuma di tampilan
// tracking.js/NC Verifier), supaya panggilan langsung ke Apps Script (tanpa lewat
// website sama sekali) tetap wajib menyertakan password yang benar.
// PENTING: ganti nilai ini kalau password di assets/branch-config.js (NC Tracker)
// diubah -- keduanya harus SAMA PERSIS.
const ADMIN_AUTH_PASSWORD = 'pjk123';

const HEADERS = [
  'ID', 'Timestamp Kirim', 'Cabang', 'Nama PIC', 'No Telpon',
  'No Payment Request', 'Link Payment Request', 'File Berkas', 'Status',
  'File Hasil Verifikasi', 'Tanggal Verifikasi', 'Admin Verifikator', 'Catatan Admin'
];

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Dicache pakai Script Properties supaya tidak perlu mencari folder by name
// setiap kali ada pengiriman (pencarian folder di Drive itu salah satu bagian
// yang cukup lambat) -- mempercepat proses kirim berkas secara signifikan.
function getFolder(name) {
  const props = PropertiesService.getScriptProperties();
  const cacheKey = 'FOLDER_ID_' + name;
  const cachedId = props.getProperty(cacheKey);

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (e) {
      // Folder mungkin sudah dihapus manual dari Drive, lanjut cari/buat ulang di bawah.
    }
  }

  const folders = DriveApp.getFoldersByName(name);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
  props.setProperty(cacheKey, folder.getId());
  return folder;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'list') return jsonResponse(listData());
  return jsonResponse({ success: false, error: 'Unknown action' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'submit') return jsonResponse(submitData(body));
    if (action === 'verify') return jsonResponse(verifyData(body));
    if (action === 'list') return jsonResponse(listData());
    if (action === 'getFile') return jsonResponse(getFileData(body));
    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function saveFile(folder, fileName, base64Data, prefix) {
  const parts = base64Data.split(',');
  const contentType = parts[0].match(/:(.*?);/)[1];
  const bytes = Utilities.base64Decode(parts[1]);
  const safeName = (prefix + '_' + fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = Utilities.newBlob(bytes, contentType, safeName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// Membuat nomor ID tersistem, format: NCT-0007/050726-K3M9
// - "NCT" = kode sistem (NC Tracker Tax)
// - "0007" = nomor urut dokumen (urutan ke berapa sejak sistem dipakai, 4 digit)
// - "050726" = tanggal dokumen dikirim, format DDMMYY (5 Juli 2026)
// - "K3M9" = kode acak 4 karakter -- supaya ID ini TIDAK bisa ditebak orang lain
//   hanya dengan menerka nomor urut/tanggal (dipakai sebagai "password" buka PDF di tracking.html)
function pad(num, size) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

// Huruf/angka yang mirip (0/O, 1/I) sengaja dihindari supaya tidak salah baca/ketik
function randomCode(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function generateId(sheet) {
  const seq = sheet.getLastRow(); // baris 1 = header, jadi ini pas jadi nomor urut data ke-berapa
  const seqPadded = pad(seq, 4);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'ddMMyy');
  const rand = randomCode(4);
  return 'NCT-' + seqPadded + '/' + dateStr + '-' + rand;
}

// Mengambil ID file Google Drive dari sebuah URL Drive standar
// (https://drive.google.com/file/d/FILE_ID/view -> FILE_ID)
function extractDriveFileId(url) {
  const match = String(url || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Dipakai oleh NC Verifier: ambil isi berkas PDF (base64) + data pengajuan
// berdasarkan ID, supaya berkas bisa otomatis dimuat tanpa unduh/upload manual.
// Mengutamakan "File Berkas" (berkas asli) kalau masih Menunggu Verifikasi;
// kalau statusnya sudah Terverifikasi/Ditolak dan ada hasil verifikasi, itu
// yang diprioritaskan (dokumen paling akhir/final).
function getFileData(body) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: false, error: 'ID tidak ditemukan' };
  const headers = data[0];
  const idCol = headers.indexOf('ID');
  const fileBerkasCol = headers.indexOf('File Berkas');
  const fileHasilCol = headers.indexOf('File Hasil Verifikasi');
  const statusCol = headers.indexOf('Status');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] !== body.id) continue;

    const row = data[i];
    const useHasil = row[statusCol] !== 'Menunggu Verifikasi' && row[fileHasilCol];
    const sourceUrl = useHasil ? row[fileHasilCol] : row[fileBerkasCol];
    const driveId = extractDriveFileId(sourceUrl);
    if (!driveId) return { success: false, error: 'Berkas tidak ditemukan di Drive' };

    const file = DriveApp.getFileById(driveId);
    const blob = file.getBlob();
    const base64 = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());

    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] instanceof Date ? row[idx].toISOString() : row[idx]; });

    return {
      success: true,
      id: body.id,
      cabang: obj['Cabang'],
      namaPic: obj['Nama PIC'],
      noPaymentRequest: obj['No Payment Request'],
      status: obj['Status'],
      fileName: file.getName(),
      fileData: base64,
    };
  }
  return { success: false, error: 'ID tidak ditemukan' };
}

function submitData(body) {
  const sheet = getSheet();
  const id = generateId(sheet);
  const folder = getFolder(FOLDER_MASUK_NAME);
  const fileUrl = saveFile(folder, body.fileName, body.fileData, id);

  sheet.appendRow([
    id,
    new Date(),
    body.cabang || '',
    body.namaPic || '',
    body.noTelpon || '',
    body.noPaymentRequest || '',
    body.linkPaymentRequest || '',
    fileUrl,
    'Menunggu Verifikasi',
    '', '', '', ''
  ]);

  return { success: true, id: id };
}

function listData() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: [] };
  const headers = data.shift();
  const rows = data.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i];
    });
    return obj;
  });
  // Terbaru di atas
  rows.reverse();
  return { success: true, data: rows };
}

// Dioptimalkan untuk kecepatan: (1) hanya membaca kolom ID saja untuk mencari baris
// (bukan seluruh kolom -- lebih sedikit data yang perlu ditransfer), dan (2) menulis
// ke 5 kolom sekaligus dalam SATU panggilan setValues() (bukan 5 panggilan terpisah).
function verifyData(body) {
  // PENTING: validasi password di SERVER, bukan cuma di tampilan (tracking.js/NC
  // Verifier) -- supaya panggilan langsung ke Apps Script (lewat luar website)
  // tetap wajib menyertakan password otorisasi yang benar.
  if (body.authPassword !== ADMIN_AUTH_PASSWORD) {
    return { success: false, error: 'Password otorisasi salah.' };
  }

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'ID tidak ditemukan' };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let rowNum = -1;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === body.id) {
      rowNum = i + 2;
      break;
    }
  }
  if (rowNum === -1) return { success: false, error: 'ID tidak ditemukan' };

  let fileUrl = '';
  if (body.fileData) {
    const folder = getFolder(FOLDER_VERIFIKASI_NAME);
    fileUrl = saveFile(folder, body.fileName, body.fileData, body.id);
  }
  // Kalau tidak ada file baru diunggah, pertahankan link yang sudah ada sebelumnya (kalau ada).
  const finalFileUrl = fileUrl || sheet.getRange(rowNum, 10).getValue();

  sheet.getRange(rowNum, 9, 1, 5).setValues([[
    body.status || 'Terverifikasi',   // Status
    finalFileUrl,                      // File Hasil Verifikasi
    new Date(),                        // Tanggal Verifikasi
    body.admin || '',                  // Admin Verifikator
    body.catatan || '',                // Catatan Admin
  ]]);

  return { success: true };
}
