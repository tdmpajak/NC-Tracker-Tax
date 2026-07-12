// ---------- Elemen ----------
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.getElementById('filterTabs');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdated = document.getElementById('lastUpdated');

const modalOverlay = document.getElementById('modalOverlay');
const modalSub = document.getElementById('modalSub');
const modalStatus = document.getElementById('modalStatus');
const modalAdmin = document.getElementById('modalAdmin');
const modalCatatan = document.getElementById('modalCatatan');
const modalDropzone = document.getElementById('modalDropzone');
const modalFileInput = document.getElementById('modalFileInput');
const modalDzText = document.getElementById('modalDzText');
const modalCancel = document.getElementById('modalCancel');
const modalSubmit = document.getElementById('modalSubmit');
const modalMsg = document.getElementById('modalMsg');
const modalAuthPassword = document.getElementById('modalAuthPassword');

let allRows = [];
let lastDataSnapshot = ''; // dipakai untuk deteksi apakah data benar-benar berubah
let currentFilter = 'all';
let activeRow = null;
let modalFile = null;
let isModalOpen = false;
let isFetching = false; // cegah request numpuk kalau refresh sebelumnya belum selesai

// ---------- Load data ----------
// silent=true dipakai untuk auto-refresh: tidak menampilkan ulang "Memuat data..."
// supaya tabel tidak berkedip/reset posisi scroll setiap beberapa detik.
async function loadData(silent = false) {
  if (isFetching) return; // sedang ada request berjalan, lewati dulu supaya tidak tumpuk
  isFetching = true;
  if (lastUpdated) lastUpdated.textContent = '⏳ memperbarui…';

  if (!silent) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Memuat data…</td></tr>`;
  }

  if (!API_URL || API_URL.includes('PASTE_URL')) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">API_URL belum dikonfigurasi (lihat assets/config.js).</td></tr>`;
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
    // Kalau tidak, tombol-tombol yang sedang mau diklik user tidak diganti-ganti tiap 3 detik --
    // itu penyebab bug "harus klik 2x" sebelumnya (tombol lama hilang tepat saat diklik).
    if (dataChanged || !silent) {
      lastDataSnapshot = newSnapshot;
      renderStats();
      renderTable();
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
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Gagal memuat data: ${err.message}</td></tr>`;
    }
    if (lastUpdated) lastUpdated.textContent = '🔴 gagal memperbarui';
    // Kalau silent (auto-refresh) dan gagal, biarkan data lama tetap tampil di layar,
    // tidak perlu mengganggu pengguna yang sedang melihat tabel.
  } finally {
    isFetching = false;
  }
}

function renderStats() {
  document.getElementById('statTotal').textContent = allRows.length;
  document.getElementById('statPending').textContent = allRows.filter(r => r['Status'] === 'Menunggu Verifikasi').length;
  document.getElementById('statVerified').textContent = allRows.filter(r => r['Status'] === 'Terverifikasi').length;
  document.getElementById('statRejected').textContent = allRows.filter(r => r['Status'] === 'Ditolak').length;
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

  let rows = allRows.filter(r => {
    if (currentFilter !== 'all' && r['Status'] !== currentFilter) return false;
    if (!q) return true;
    const haystack = [r['Cabang'], r['Nama PIC'], r['No Payment Request'], r['ID']]
      .join(' ').toLowerCase();
    return haystack.includes(q);
  });

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="em-icon">🗂️</div>Tidak ada data yang cocok.</div></td></tr>`;
    return;
  }

  tableBody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="badge-cabang">${escapeHtml(r['Cabang'] || '-')}</span></td>
      <td class="cell-pic">
        <span class="name">${escapeHtml(r['Nama PIC'] || '-')}</span>
        ${r['No Telpon'] ? `<a class="phone" href="${toWaLink(r['No Telpon'])}" target="_blank" style="color:var(--success); text-decoration:none;">💬 ${escapeHtml(r['No Telpon'])}</a>` : ''}
      </td>
      <td class="cell-nc">${escapeHtml(r['No Payment Request'] || '-')}</td>
      <td class="cell-pic">
        ${r['File Berkas'] ? `<button class="link-inline-btn" data-url="${escapeHtml(r['File Berkas'])}" data-docid="${escapeHtml(r['ID'])}">Lihat PDF</button>` : '<span style="color:var(--ink-soft);">–</span>'}
        <span class="phone">${formatDate(r['Timestamp Kirim'])}</span>
      </td>
      <td><span class="pill ${statusPillClass(r['Status'])}">${escapeHtml(r['Status'] || 'Menunggu Verifikasi')}</span></td>
      <td class="cell-pic">
        ${r['File Hasil Verifikasi'] ? `<button class="link-inline-btn" data-url="${escapeHtml(r['File Hasil Verifikasi'])}" data-docid="${escapeHtml(r['ID'])}">Lihat Hasil</button> · <button class="link-inline-btn" data-download-url="${escapeHtml(r['File Hasil Verifikasi'])}" data-docid="${escapeHtml(r['ID'])}">Unduh</button>` : '<span style="color:var(--ink-soft);">–</span>'}
        ${r['Tanggal Verifikasi'] ? `<span class="phone">${formatDate(r['Tanggal Verifikasi'])}</span>` : ''}
      </td>
      <td>${r['Status'] === 'Menunggu Verifikasi'
          ? `<button class="btn btn-primary btn-sm" data-id="${r['ID']}">Verifikasi</button>`
          : `<button class="btn btn-ghost btn-sm" data-id="${r['ID']}">Ubah</button>`}
      </td>
    </tr>
  `).join('');

  tableBody.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
  });

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

// Minta ID pengajuan (nomor NCT-xxxx/tgl) sebelum membuka link PDF -- PDF-nya sendiri
// tidak dienkripsi, ini murni gerbang di sisi website. Setiap pengajuan punya ID unik
// sendiri, jadi PIC/admin harus tahu nomor ID dokumen tersebut untuk bisa membukanya.
function openProtectedLink(url, correctId) {
  const input = window.prompt('Masukkan ID pengajuan (contoh: NCT-0003/100726) untuk membuka berkas ini:');
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
// (window.open sering diblokir popup blocker browser kalau dipanggil setelah
// dialog seperti prompt()/alert() -- teknik klik elemen <a> ini jauh lebih aman).
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

// ---------- Modal verifikasi ----------
function openModal(id) {
  activeRow = allRows.find(r => r['ID'] === id);
  if (!activeRow) return;
  modalSub.textContent = `Cabang ${activeRow['Cabang']} — PIC ${activeRow['Nama PIC']}`;
  modalStatus.value = activeRow['Status'] === 'Ditolak' ? 'Ditolak' : 'Terverifikasi';
  modalAdmin.value = activeRow['Admin Verifikator'] || '';
  modalCatatan.value = activeRow['Catatan Admin'] || '';
  modalDzText.innerHTML = '<strong>Klik untuk pilih file</strong> (opsional jika hanya menolak)';
  modalFile = null;
  modalAuthPassword.value = '';
  modalMsg.textContent = '';
  modalMsg.className = 'status-msg';
  modalOverlay.classList.add('open');
  isModalOpen = true;
}

function closeModal() {
  modalOverlay.classList.remove('open');
  activeRow = null;
  isModalOpen = false;
}
modalCancel.addEventListener('click', closeModal);
modalAuthPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    modalSubmit.click();
  }
});
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

// Catatan: input file sudah di dalam <label>, klik label otomatis buka dialog file.
// Tidak perlu modalFileInput.click() manual (itu penyebab bug harus klik 2x).
modalFileInput.addEventListener('change', () => {
  if (modalFileInput.files.length) {
    const f = modalFileInput.files[0];
    if (f.type !== 'application/pdf') {
      modalDzText.innerHTML = '<span style="color:#C0392B;font-weight:600;">File harus PDF</span>';
      modalFile = null;
      return;
    }
    modalFile = f;
    modalDzText.innerHTML = `<span class="dz-file">✓ ${f.name}</span>`;
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

modalSubmit.addEventListener('click', async () => {
  if (!activeRow) return;
  modalMsg.textContent = '';
  modalMsg.className = 'status-msg';

  if (modalAuthPassword.value !== SUBMIT_GATE_PASSWORD) {
    modalMsg.textContent = 'Password otorisasi salah.';
    modalMsg.classList.add('err');
    return;
  }

  modalSubmit.disabled = true;
  modalSubmit.textContent = 'Menyimpan…';

  try {
    const payload = {
      action: 'verify',
      id: activeRow['ID'],
      status: modalStatus.value,
      admin: modalAdmin.value.trim(),
      catatan: modalCatatan.value.trim()
    };
    if (modalFile) {
      payload.fileName = modalFile.name;
      payload.fileData = await fileToBase64(modalFile);
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Gagal menyimpan.');

    modalMsg.textContent = 'Berhasil disimpan.';
    modalMsg.classList.add('ok');
    await loadData();
    setTimeout(closeModal, 700);
  } catch (err) {
    modalMsg.textContent = 'Gagal: ' + err.message;
    modalMsg.classList.add('err');
  } finally {
    modalSubmit.disabled = false;
    modalSubmit.textContent = 'Simpan';
  }
});

// ---------- Init ----------
loadData();

// ---------- Auto-refresh ----------
// Setiap 3 detik, ambil data terbaru tanpa perlu klik tombol Muat Ulang.
// Dilewati kalau: modal verifikasi sedang terbuka, ada request lain masih berjalan,
// atau tab browser sedang tidak aktif (hemat kuota saat halaman ditinggal di background).
setInterval(() => {
  if (isModalOpen) return;
  if (document.hidden) return;
  loadData(true);
}, 3000);

// Begitu pengguna kembali ke tab ini setelah pindah tab, langsung refresh sekali
// supaya data yang dilihat tidak basi.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !isModalOpen) loadData(true);
});
