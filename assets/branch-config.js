// =====================================================================
// KONFIGURASI CABANG
// =====================================================================
// PENTING UNTUK DIKETAHUI:
// Website ini adalah situs statis (GitHub Pages) tanpa server rahasia di baliknya.
// Artinya SEMUA isi file ini BISA DILIHAT oleh siapa pun yang membuka "View Page
// Source" atau tab Network/Sources di DevTools browser (tekan F12).
//
// Cara kerja "password" di sistem ini:
// - ID pengajuan (kolom "ID" tiap baris, format DTT-0001/tanggal) -- dipakai
//   sebagai "kunci" untuk membuka link "Lihat PDF"/"Lihat Hasil" di tabel
//   tracking. Setiap pengajuan sudah otomatis dapat ID unik dari sistem
//   (dibuat oleh Code.gs), tidak perlu diatur manual di sini.
// - Menyimpan hasil verifikasi (approve/reject) TIDAK lagi memakai password --
//   proses itu dilakukan lewat aplikasi NC Verifier yang tidak bisa diakses
//   oleh cabang/PIC, jadi sudah aman tanpa kode tambahan.
// =====================================================================

// Urutan cabang yang muncul di dropdown form kirim berkas
const BRANCH_LIST = [
  'DLR','DLL','DLY','DLP','DMP','DLA','DLQ','DLO','DMR','DLF','DLH','DLB','DLV','DLE','DLJ','DMN',
  'DLS','DLX','DLZ','DLI','DMM','DLK','DLU','DLG','DLW','DLN','DLM','DLT','DLD','DMK','MML','MMM','MMT','HHO','DMX'
];
