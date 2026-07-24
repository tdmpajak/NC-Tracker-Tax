/**
 * DOC TRACKER TAX - VERIFIKASI BERKAS (NC / NON NC / LPJ)
 * Backend Google Apps Script
 *
 * CARA DEPLOY:
 * 1. Buka Google Sheet baru -> Extensions > Apps Script
 * 2. Hapus isi Code.gs default, paste seluruh isi file ini
 * 3. Klik Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy URL Web App yang muncul, tempel ke assets/config.js (API_URL) dan
 *    ke config.js milik NC Verifier (TRACKER_API_URL)
 * 5. Setiap kali edit script, klik Deploy > Manage deployments > Edit > New version
 */

const SHEET_NAME = 'Tracking';
const FOLDER_MASUK_NAME = 'Berkas Masuk - Dokumen';
const FOLDER_VERIFIKASI_NAME = 'Berkas Terverifikasi - Dokumen';

// CATATAN: Penyimpanan/verifikasi berkas TIDAK lagi memakai password otorisasi.
// Menu "ubah/verifikasi" hanya bisa diakses lewat aplikasi NC Verifier (bukan
// dari form cabang/PIC), jadi sudah aman tanpa kode tambahan di langkah ini.

const HEADERS = [
  'ID', 'Timestamp Kirim', 'Cabang', 'Nama PIC', 'No Telpon',
  'Jenis Dokumen', 'No Dokumen', 'File Berkas', 'Status',
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

// Membuat nomor ID tersistem, format: DTT-0007/050726-K3M9
// - "DTT" = kode sistem (Doc Tracker Tax)
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
  return 'DTT-' + seqPadded + '/' + dateStr + '-' + rand;
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
      jenisDokumen: obj['Jenis Dokumen'],
      noDokumen: obj['No Dokumen'],
      status: obj['Status'],
      catatanAdmin: obj['Catatan Admin'],
      adminVerifikator: obj['Admin Verifikator'],
      fileName: file.getName(),
      fileData: base64,
    };
  }
  return { success: false, error: 'ID tidak ditemukan' };
}

// Daftar Jenis Dokumen yang valid -- HARUS sama persis dengan pilihan di
// dropdown index.html. Dipakai untuk menolak submit yang jenisDokumen-nya
// kosong/tidak sesuai (mis. dikirim dari form versi lama/cache browser yang
// belum punya field ini), supaya tidak ada lagi baris "tersembunyi" yang
// tidak muncul di dashboard manapun karena kolom Jenis Dokumen kosong.
const VALID_JENIS_DOKUMEN = [
  'NC - Aktual',
  'Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya)',
  'LPJ'
];

function submitData(body) {
  const jenisDokumen = String(body.jenisDokumen || '').trim();
  const noDokumen = String(body.noDokumen || '').trim();

  if (VALID_JENIS_DOKUMEN.indexOf(jenisDokumen) === -1) {
    return {
      success: false,
      error: 'Jenis Dokumen tidak valid atau belum dipilih. Coba hard refresh halaman form (Ctrl+Shift+R / buka di jendela Incognito) lalu kirim ulang -- kemungkinan browser Anda masih memakai versi form yang lama.'
    };
  }
  if (!noDokumen) {
    return { success: false, error: 'No. Dokumen wajib diisi.' };
  }

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
    jenisDokumen,
    noDokumen,
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
  // Tidak ada lagi validasi password di sini -- menu verifikasi hanya bisa
  // diakses lewat aplikasi NC Verifier (bukan dari form cabang/PIC), jadi
  // sudah aman tanpa kode tambahan.
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

// =====================================================================
// MIGRASI DATA LAMA (NC Tracker Tax -> Doc Tracker Tax) -- JALANKAN SEKALI SAJA
// =====================================================================
// Struktur sheet lama:
//   ID, Timestamp Kirim, Cabang, Nama PIC, No Telpon,
//   No Payment Request, Link Payment Request, File Berkas, Status,
//   File Hasil Verifikasi, Tanggal Verifikasi, Admin Verifikator, Catatan Admin
//
// Struktur sheet baru (dipakai kode di atas):
//   ID, Timestamp Kirim, Cabang, Nama PIC, No Telpon,
//   Jenis Dokumen, No Dokumen, File Berkas, Status,
//   File Hasil Verifikasi, Tanggal Verifikasi, Admin Verifikator, Catatan Admin
//
// Fungsi ini: (1) menyisipkan kolom baru "Jenis Dokumen" di posisi F (sebelum
// kolom nomor dokumen), (2) mengisi semua baris data yang SUDAH ADA dengan
// "NC - Aktual" (karena sistem lama memang khusus Payment Request/NC),
// (3) mengganti nama header "No Payment Request" -> "No Dokumen", dan
// (4) MENGHAPUS kolom "Link Payment Request" -- field ini sudah tidak dipakai
// lagi di Doc Tracker Tax.
//
// CARA PAKAI:
// 1. Buka Apps Script project yang SEDANG DIPAKAI SEKARANG (yang isinya masih
//    versi lama), tempel/tambahkan fungsi migrateToDocTracker() ini saja
//    dulu ke Code.gs yang lama (jangan timpa semuanya dulu).
// 2. Di toolbar Apps Script, pilih fungsi "migrateToDocTracker" dari dropdown
//    di sebelah tombol Run (ikon play ▶), lalu klik Run.
// 3. Kalau diminta izin, klik Authorize/Izinkan seperti biasa.
// 4. Cek log (View > Logs / Ctrl+Enter) dan cek langsung Google Sheet-nya --
//    pastikan kolom "Jenis Dokumen" sudah muncul dan terisi "NC - Aktual" di
//    semua baris lama, dan kolom "Link Payment Request" sudah terhapus.
// 5. SETELAH migrasi berhasil, baru timpa SELURUH isi Code.gs dengan isi file
//    ini (versi Doc Tracker Tax yang baru, termasuk fungsi migrasi ini juga
//    ikut ter-paste, tidak masalah dibiarkan -- fungsi ini otomatis tidak
//    melakukan apa-apa lagi kalau dijalankan ulang, lihat pengecekan di awal).
// 6. Deploy > Manage deployments > edit (pensil) > Version: New version > Deploy.
// 7. Update file index.html/tracking.html/assets di GitHub ke versi baru juga.
//
// PENTING: kalau kolom "Link Payment Request" lama masih ada isinya yang
// penting, catat/backup dulu isinya (mis. sheet duplikat) sebelum menjalankan
// migrasi ini -- fungsi ini menghapus kolom tersebut secara permanen.
//
// Kalau ada baris yang SEBENARNYA bukan dokumen NC (jarang terjadi karena
// sistem lama memang khusus NC), tinggal edit manual sel "Jenis Dokumen" baris
// tersebut di Google Sheets setelah migrasi, isi dengan salah satu:
// "NC - Aktual", "Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya)", atau "LPJ".
function migrateToDocTracker() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 1 || lastCol < 1) {
    Logger.log('Sheet kosong, tidak ada yang perlu dimigrasi.');
    return;
  }

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Sudah pernah dimigrasi sebelumnya? Jangan dijalankan dua kali.
  if (headerRow.indexOf('Jenis Dokumen') !== -1) {
    Logger.log('Sheet sudah memakai struktur baru (kolom "Jenis Dokumen" sudah ada). Migrasi dilewati.');
    return;
  }

  // Pastikan ini memang struktur lama yang diharapkan sebelum diubah.
  if (headerRow[5] !== 'No Payment Request') {
    throw new Error(
      'Struktur header tidak sesuai dugaan (kolom F seharusnya "No Payment Request", ' +
      'ditemukan: "' + headerRow[5] + '"). Migrasi dibatalkan supaya data tidak rusak -- ' +
      'cek ulang struktur sheet secara manual dulu.'
    );
  }

  // 1) Sisipkan kolom baru "Jenis Dokumen" sebelum kolom F (No Payment Request).
  //    Otomatis menggeser "No Payment Request", "Link Payment Request", dst ke kanan.
  sheet.insertColumnBefore(6);
  sheet.getRange(1, 6).setValue('Jenis Dokumen');

  // 2) Isi kolom "Jenis Dokumen" di semua baris data lama dengan "NC - Aktual".
  const numDataRows = lastRow - 1;
  if (numDataRows > 0) {
    const defaultValues = [];
    for (let i = 0; i < numDataRows; i++) defaultValues.push(['NC - Aktual']);
    sheet.getRange(2, 6, numDataRows, 1).setValues(defaultValues);
  }

  // 3) Ganti nama header "No Payment Request" (kini di kolom G) -> "No Dokumen".
  sheet.getRange(1, 7).setValue('No Dokumen');

  // 4) Hapus kolom "Link Payment Request" (kini di kolom H) -- sudah tidak
  //    dipakai lagi. File Berkas dkk otomatis bergeser satu kolom ke kiri,
  //    pas jadi kolom H seperti struktur baru.
  sheet.deleteColumn(8);

  Logger.log('Migrasi selesai: %s baris data diberi Jenis Dokumen = "NC - Aktual", kolom Link Payment Request dihapus.', numDataRows);
}

// Fungsi tambahan -- HANYA perlu dijalankan kalau Anda sempat memakai versi
// migrasi SEBELUMNYA (yang masih membuat kolom "Link Dokumen"). Aman
// dijalankan kapan saja: kalau kolom "Link Dokumen" tidak ada, fungsi ini
// tidak melakukan apa-apa.
function dropLinkDokumenColumnIfExists() {
  const sheet = getSheet();
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headerRow.indexOf('Link Dokumen'); // 0-based
  if (idx === -1) {
    Logger.log('Kolom "Link Dokumen" tidak ditemukan, tidak ada yang perlu dihapus.');
    return;
  }
  sheet.deleteColumn(idx + 1); // getRange/deleteColumn pakai index 1-based
  Logger.log('Kolom "Link Dokumen" berhasil dihapus.');
}
