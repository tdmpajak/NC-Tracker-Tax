// =====================================================================
// KONFIGURASI CABANG & PASSWORD
// =====================================================================
// PENTING UNTUK DIKETAHUI:
// Website ini adalah situs statis (GitHub Pages) tanpa server rahasia di baliknya.
// Artinya SEMUA isi file ini -- termasuk SUBMIT_GATE_PASSWORD di bawah -- BISA DILIHAT
// oleh siapa pun yang membuka "View Page Source" atau tab Network/Sources di
// DevTools browser (tekan F12). Ini BUKAN penyimpanan rahasia yang aman, hanya
// penyaring sederhana terhadap orang iseng, bukan pengaman tingkat lanjut.
//
// Cara kerja password/ID di sistem ini:
// 1) Password otorisasi admin (SUBMIT_GATE_PASSWORD) -- wajib diisi admin di
//    tracking.html setiap kali menyimpan hasil verifikasi (approve/reject).
// 2) ID pengajuan (kolom "ID" tiap baris, format NCT-0001/tanggal) -- dipakai
//    sebagai "password" untuk membuka link "Lihat PDF"/"Lihat Hasil" di tabel
//    tracking. Setiap pengajuan sudah otomatis dapat ID unik dari sistem
//    (dibuat oleh Code.gs), tidak perlu diatur manual di sini.
// =====================================================================

// Urutan cabang yang muncul di dropdown form kirim berkas
const BRANCH_LIST = [
  'DLR','DLL','DLY','DLP','DMP','DLA','DLQ','DLO','DMR','DLF','DLH','DLB','DLV','DLE','DLJ','DMN',
  'DLS','DLX','DLZ','DLI','DMM','DLK','DLU','DLG','DLW','DLN','DLM','DLT','DLD','DMK','MML','MMM','MMT','HHO','DMX'
];

// Password otorisasi admin saat menyimpan hasil verifikasi di tracking.html
const SUBMIT_GATE_PASSWORD = 'pjk123';
