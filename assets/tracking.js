// ---------- Elemen ----------
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.getElementById('filterTabs');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdated = document.getElementById('lastUpdated');
const dashSidebar = document.getElementById('dashSidebar');

let allRows = [];
let lastDataSnapshot = ''; // dipakai untuk deteksi apakah data benar-benar berubah
let currentFilter = 'all';
let currentJenis = 'NC - Aktual'; // dashboard aktif di sidebar kiri, default: NC - Aktual
let isFetching = false; // cegah request numpuk kalau refresh sebelumnya belum selesai

// Jenis Dokumen yang dikenali oleh 3 dashboard sidebar. Baris yang kolom
// "Jenis Dokumen"-nya kosong/tidak sesuai salah satu dari ini TIDAK akan
// muncul di dashboard manapun -- karena itu perlu ditandai lewat peringatan
// di renderUnknownWarning(), supaya tidak "hilang" tanpa disadari.
const KNOWN_JENIS = ['NC - Aktual', 'Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya)', 'LPJ'];

// ---------- Load data ----------
// silent=true dipakai untuk auto-refresh: tidak menampilkan ulang "Memuat data..."
// supaya tabel tidak berkedip/reset posisi scroll setiap beberapa detik.
async function loadData(silent = false) {
  if (isFetching) return; // sedang ada request berjalan, lewati dulu supaya tidak tumpuk
  isFetching = true;
  if (lastUpdated) lastUpdated.textContent = '⏳ memperbarui…';

  if (!silent) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Memuat data…</td></tr>`;
  }

  if (!API_URL || API_URL.includes('PASTE_URL')) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">API_URL belum dikonfigurasi (lihat assets/config.js).</td></tr>`;
    isFetching = false;
    return;
  }

  try {
    const res = await fetch(`${API_URL}?action=list`);
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Gagal memuat data');

    const newSnapshot = JSON.stringify(result.data);
    const dataChanged = newSnapshot !== lastDataSnapshot;
    allRows = result.data;

    // Render ulang tabel HANYA kalau datanya benar-benar berubah (atau ini load pertama kali).
    if (dataChanged || !silent) {
      lastDataSnapshot = newSnapshot;
      renderStats();
      renderTable();
      renderUnknownWarning();
    }

    if (lastUpdated) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      lastUpdated.textContent = `🟢 diperbarui ${hh}:${mm}:${ss}`;
    }
  } catch (err) {
    if (!silent) {
      tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Gagal memuat data: ${err.message}</td></tr>`;
    }
    if (lastUpdated) lastUpdated.textContent = '🔴 gagal memperbarui';
  } finally {
    isFetching = false;
  }
}

// Baris yang termasuk dashboard/jenis dokumen yang sedang aktif di sidebar kiri
function jenisRows() {
  return allRows.filter(r => (r['Jenis Dokumen'] || '') === currentJenis);
}

// Tandai baris yang kolom "Jenis Dokumen"-nya kosong/tidak sesuai salah satu
// dari 3 dashboard -- baris seperti ini TIDAK muncul di dashboard manapun,
// jadi perlu ditampilkan sebagai peringatan supaya tidak "hilang" tanpa
// disadari (mis. karena dikirim dari form versi lama/cache browser PIC).
function renderUnknownWarning() {
  const box = document.getElementById('unknownJenisWarning');
  if (!box) return;
  const unknown = allRows.filter(r => KNOWN_JENIS.indexOf((r['Jenis Dokumen'] || '').trim()) === -1);
  if (unknown.length === 0) {
    box.innerHTML = '';
    return;
  }
  const idList = unknown.map(r => escapeHtml(r['ID'] || '(tanpa ID)')).join(', ');
  box.innerHTML = `
    <div class="warning-banner">
      ⚠️ <strong>${unknown.length} pengajuan tidak muncul di dashboard manapun</strong> karena kolom "Jenis Dokumen"-nya kosong atau tidak sesuai (kemungkinan dikirim dari form versi lama/cache browser PIC). ID pengajuan: ${idList}.
      Perbaiki manual lewat Google Sheets -- isi kolom "Jenis Dokumen" dengan salah satu: <em>NC - Aktual</em>, <em>Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya)</em>, atau <em>LPJ</em>.
    </div>`;
}

function renderStats() {
  const rows = jenisRows();
  document.getElementById('statTotal').textContent = rows.length;
  document.getElementById('statPending').textContent = rows.filter(r => r['Status'] === 'Menunggu Verifikasi').length;
  document.getElementById('statVerified').textContent = rows.filter(r => r['Status'] === 'Terverifikasi').length;
  document.getElementById('statRejected').textContent = rows.filter(r => r['Status'] === 'Ditolak').length;
}

function statusPillClass(status) {
  if (status === 'Terverifikasi') return 'verified';
  if (status === 'Ditolak') return 'rejected';
  return 'pending';
}

function formatDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// Ubah nomor telepon lokal (mis. 08123456789) jadi link wa.me (mis. https://wa.me/628123456789)
function toWaLink(phoneRaw) {
  if (!phoneRaw) return null;
  let digits = String(phoneRaw).replace(/\D/g, ''); // buang semua karakter selain angka
  if (!digits) return null;
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (!digits.startsWith('62')) {
    digits = '62' + digits;
  }
  return `https://wa.me/${digits}`;
}

function renderTable() {
  const q = searchInput.value.trim().toLowerCase();

  let rows = jenisRows().filter(r => {
    if (currentFilter !== 'all' && r['Status'] !== currentFilter) return false;
    if (!q) return true;
    const haystack = [r['Cabang'], r['Nama PIC'], r['No Dokumen'], r['ID']]
      .join(' ').toLowerCase();
    return haystack.includes(q);
  });

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="em-icon">🗂️</div>Tidak ada data yang cocok.</div></td></tr>`;
    return;
  }

  tableBody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="badge-cabang">${escapeHtml(r['Cabang'] || '-')}</span></td>
      <td>
        <div class="cell-pic">
          ${r['No Telpon']
            ? `<a class="name name-truncate" href="${toWaLink(r['No Telpon'])}" target="_blank" title="${escapeHtml(r['Nama PIC'] || '')}" style="color:var(--success); text-decoration:none;">💬 ${escapeHtml(r['Nama PIC'] || '-')}</a>`
            : `<span class="name name-truncate" title="${escapeHtml(r['Nama PIC'] || '')}">${escapeHtml(r['Nama PIC'] || '-')}</span>`}
        </div>
      </td>
      <td class="cell-nc" title="${escapeHtml((r['No Dokumen'] || '').replace(/\n/g, ', '))}">${escapeHtml((r['No Dokumen'] || '-').split('\n')[0])}${r['No Dokumen'] && r['No Dokumen'].includes('\n') ? ' …' : ''}</td>
      <td>
        <div class="cell-pic">
          ${r['File Berkas'] ? `<button class="link-inline-btn" data-url="${escapeHtml(r['File Berkas'])}" data-docid="${escapeHtml(r['ID'])}">Lihat PDF</button>` : '<span style="color:var(--ink-soft);">–</span>'}
          <span class="phone">${formatDate(r['Timestamp Kirim'])}</span>
        </div>
      </td>
      <td><span class="pill ${statusPillClass(r['Status'])}">${escapeHtml(r['Status'] || 'Menunggu Verifikasi')}</span></td>
      <td>
        <div class="cell-pic">
          ${r['File Hasil Verifikasi'] ? `<div style="display:flex; align-items:center; gap:6px;"><button class="link-inline-btn" data-url="${escapeHtml(r['File Hasil Verifikasi'])}" data-docid="${escapeHtml(r['ID'])}">Lihat Hasil</button><span style="color:var(--ink-soft);">·</span><button class="link-inline-btn" data-download-url="${escapeHtml(r['File Hasil Verifikasi'])}" data-docid="${escapeHtml(r['ID'])}">Unduh</button></div>` : (r['Catatan Admin'] ? '' : '<span style="color:var(--ink-soft);">–</span>')}
          ${r['Catatan Admin'] ? `<div style="display:flex; gap:5px; align-items:flex-start; font-size:12px; color:var(--ink-soft); line-height:1.4;"><span>📝</span><span>${escapeHtml(r['Catatan Admin'])}</span></div>` : ''}
          ${r['Tanggal Verifikasi'] ? `<span class="phone">${formatDate(r['Tanggal Verifikasi'])}</span>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  tableBody.querySelectorAll('button.link-inline-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.downloadUrl) {
        openProtectedLink(toDriveDownloadLink(btn.dataset.downloadUrl), btn.dataset.docid);
      } else {
        openProtectedLink(btn.dataset.url, btn.dataset.docid);
      }
    });
  });
}

// Minta ID pengajuan (nomor DTT-xxxx/tgl) sebelum membuka link PDF -- PDF-nya sendiri
// tidak dienkripsi, ini murni gerbang di sisi website. Setiap pengajuan punya ID unik
// sendiri, jadi PIC/admin harus tahu nomor ID dokumen tersebut untuk bisa membukanya.
function openProtectedLink(url, correctId) {
  const input = window.prompt('Masukkan ID pengajuan (contoh: DTT-0001/100726-K3M9) untuk membuka berkas ini:');
  if (input === null) return; // dibatalkan
  if (input.trim().toUpperCase() === String(correctId).trim().toUpperCase()) {
    navigateTo(url);
  } else {
    alert('ID pengajuan salah.');
  }
}

// Ubah link "lihat" Google Drive biasa jadi link download langsung
// (drive.google.com/file/d/ID/view -> drive.google.com/uc?export=download&id=ID).
// Kalau pola link-nya tidak dikenali, pakai link asli saja sebagai fallback.
function toDriveDownloadLink(url) {
  const match = String(url).match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

// Membuka link di tab baru dengan cara yang lebih andal daripada window.open()
function navigateTo(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ---------- Sidebar: 3 dashboard per Jenis Dokumen ----------
dashSidebar.querySelectorAll('.dash-menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    dashSidebar.querySelectorAll('.dash-menu-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentJenis = btn.dataset.jenis;
    renderStats();
    renderTable();
  });
});

// ---------- Filter & search ----------
filterTabs.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    filterTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable();
  });
});
searchInput.addEventListener('input', renderTable);
refreshBtn.addEventListener('click', loadData);

// ---------- Init ----------
loadData();

// ---------- Auto-refresh ----------
// Setiap 3 detik, ambil data terbaru tanpa perlu klik tombol Muat Ulang.
setInterval(() => {
  if (document.hidden) return;
  loadData(true);
}, 3000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadData(true);
});
