# NC Tracker Tax

Sistem logbook online untuk cabang mengirim berkas PDF (Payment Request) untuk verifikasi pajak, dan admin pusat melacak status + mengunggah balik berkas yang sudah diverifikasi/ditandatangani.

**Fitur utama:**
- Cabang kirim berkas PDF + data pengajuan melalui form online
- Admin memantau semua pengajuan secara real-time (auto-refresh tiap 3 detik) di dashboard tracking
- Admin upload balik berkas hasil verifikasi
- **ID pengajuan sebagai "password"** untuk membuka link PDF di tabel tracking (setiap pengajuan sudah punya ID unik otomatis)
- **Password otorisasi admin** wajib diisi sebelum menyimpan hasil verifikasi di tracking.html
- Nomor ID pengajuan tersistem: `NCT-0007/050726` (nomor urut + tanggal)

**Arsitektur:** HTML statis (GitHub Pages) → Google Apps Script (API) → Google Sheets (tracking) + Google Drive (penyimpanan PDF).

Tidak perlu server sendiri, tidak ada biaya hosting.

---

## ⚠️ Penting soal password — baca dulu sebelum lanjut

Website ini adalah situs statis (HTML/JS biasa), **bukan aplikasi dengan server rahasia**. Artinya:

- Semua password (password gerbang link PDF per cabang, maupun password akses form `pajak123`) **tersimpan sebagai teks biasa** di file `assets/branch-config.js`, yang bisa dibaca siapa pun yang membuka "View Page Source" atau tab Network/Sources di DevTools browser (tekan F12).
- Ini **BUKAN pengaman tingkat lanjut** terhadap orang yang paham teknis. Fungsinya lebih ke:
  1. **Password gerbang link PDF** — supaya orang yang cuma iseng buka tabel tracking (atau link ke-forward tanpa konteks) tidak bisa langsung klik dan lihat isi PDF-nya. Catatan: PDF itu sendiri **tidak dienkripsi** -- kalau seseorang sudah punya link Google Drive-nya secara langsung (bukan lewat tombol di website), password ini tidak berlaku karena itu di luar kendali website ini.
  2. **Password akses form** — menyaring orang iseng yang kebetulan tahu link website-nya, bukan pengaman serius.
- Kalau ke depannya butuh keamanan yang lebih kuat, password semacam ini idealnya disimpan & diproses di sisi server (Apps Script) yang tidak bisa dilihat publik, bukan di file JS yang dikirim ke browser semua orang. Kabari saja kalau nanti mau ditingkatkan ke arah situ.

---

## Struktur Project

```
logbook-verifikasi/
├── index.html                  # Form pengajuan untuk cabang (dengan gerbang password)
├── tracking.html                # Dashboard tracking & verifikasi untuk admin
├── assets/
│   ├── style.css
│   ├── config.js                 # URL Apps Script (WAJIB diisi manual, lihat langkah 5)
│   ├── branch-config.js          # Daftar kode cabang + password gerbang link PDF + password akses form
│   ├── app.js                    # Logic form cabang
│   └── tracking.js               # Logic dashboard admin
└── google-apps-script/
    └── Code.gs                   # Backend (jalan di Google Apps Script, BUKAN di GitHub)
```

---

## Langkah Setup dari Nol Sampai Live

### 1. Upload project ke GitHub

1. Buka [github.com](https://github.com) dan login (buat akun dulu jika belum punya).
2. Klik tombol **+** di pojok kanan atas → pilih **New repository**.
3. Isi **Repository name**, misalnya `logbook-verifikasi`. Pilih **Public**. Klik **Create repository**.
4. Di halaman repo yang masih kosong, klik link tulisan **uploading an existing file**.
5. Extract dulu folder `logbook-verifikasi` hasil unduhan (`.zip`) di komputer Anda kalau belum.
6. Seret (drag & drop) **semua isi** folder tersebut ke area upload — pastikan strukturnya **rata di root repo, BUKAN bertumpuk di dalam folder lagi**:
   - `index.html`, `tracking.html`, `README.md` → langsung di root
   - folder `assets` (isinya `style.css`, `config.js`, `branch-config.js`, `pdf-protect.js`, `app.js`, `tracking.js`) → tetap sebagai folder `assets`
   - folder `google-apps-script` (isinya `Code.gs`) → tetap sebagai folder tersebut
7. Scroll ke bawah, klik tombol hijau **Commit changes**.

> 📌 Kesalahan paling sering: meng-upload folder `logbook-verifikasi` itu sendiri ke dalam repo (jadi bertumpuk dua kali), atau sebaliknya meng-upload isi `assets/` rata ke root tanpa foldernya. Pastikan strukturnya **persis** seperti di atas.

### 2. Buat Google Sheet

1. Buka [sheets.google.com](https://sheets.google.com) → klik **Blank** untuk buat spreadsheet baru.
2. Beri nama, misalnya **"Tracking Verifikasi Pajak"**.
3. Tab/sheet boleh dibiarkan kosong — otomatis dibuatkan tab `Tracking` dengan header saat pertama kali diakses dari form.

### 3. Pasang Kode Backend (Apps Script)

1. Di spreadsheet tadi, klik menu **Extensions** → **Apps Script**. Tab baru terbuka berisi editor kode.
2. Di editor tersebut, klik di dalam kotak kode → **Ctrl+A** (pilih semua) → **Delete** (hapus semua isi contoh bawaan).
3. Buka file `google-apps-script/Code.gs` di repo GitHub Anda (dari langkah 1) → copy semua isinya (Ctrl+A lalu Ctrl+C di halaman GitHub).
4. Kembali ke tab Apps Script → klik di editor yang sudah kosong → paste (Ctrl+V).
5. Klik ikon **disket 💾** (Save).

### 4. Deploy sebagai Web App

1. Klik tombol biru **Deploy** (kanan atas) → **New deployment**.
2. Klik ikon gerigi ⚙️ di sebelah "Select type" → pilih **Web app**.
3. Isi:
   - **Execute as:** `Me (email Anda)`
   - **Who has access:** `Anyone`
4. Klik **Deploy** → kalau diminta izin, klik **Authorize access** → pilih akun Google Anda → **Advanced**/**Lanjutan** (jika ada peringatan) → **Go to (nama project) (unsafe)** → **Allow**/**Izinkan**.
5. Setelah berhasil, muncul kotak **Web app URL** — klik **Salin**. Bentuknya seperti:
   `https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxx/exec`
6. Simpan URL ini sementara (paste ke Notes), dipakai di langkah 5.

> ⚠️ **Setiap kali mengedit ulang `Code.gs` di kemudian hari**, jangan klik "New deployment" lagi (itu bikin URL baru). Klik **Deploy → Manage deployments** → ikon pensil ✏️ pada deployment yang **sudah ada** → dropdown **Version** ganti ke **New version** → klik **Deploy**. Dengan begitu URL tetap sama, tidak perlu update `config.js` lagi.

### 5. Masukkan URL Web App ke config.js

1. Di repo GitHub Anda → buka folder `assets` → klik file `config.js` → klik ikon pensil ✏️ **Edit this file**.
2. Ganti isi `PASTE_URL_WEB_APP_ANDA_DI_SINI` dengan URL dari langkah 4, sehingga jadi:
   ```js
   const API_URL = "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxx/exec";
   ```
3. Scroll ke bawah, klik **Commit changes**.

### 6. Aktifkan GitHub Pages

1. Di halaman utama repo → klik tab **Settings** → menu kiri **Pages**.
2. Bagian **Branch**, pilih **main**, folder `/ (root)`, klik **Save**.
3. Tunggu 1-2 menit, refresh — muncul link seperti:
   `https://USERNAME.github.io/logbook-verifikasi/`

### 7. Selesai — Bagikan Link

- **Cabang** mengakses: `https://USERNAME.github.io/logbook-verifikasi/index.html` (tidak perlu password, langsung isi form)
- **Admin/tim pajak** mengakses: `https://USERNAME.github.io/logbook-verifikasi/tracking.html`
- **Data mentah** selalu bisa dicek langsung di tab `Tracking` pada Google Sheet Anda.

---

## Cara Kerja Gerbang ID Pengajuan (untuk buka link PDF)

1. Di tabel tracking (`tracking.html`), kolom "Pengajuan" dan "Hasil Verifikasi" menampilkan tombol "Lihat PDF"/"Lihat Hasil" (bukan link langsung).
2. Saat tombol itu diklik, muncul kotak minta **ID pengajuan** baris tersebut (format `NCT-0001/tanggal`, sudah otomatis dibuat sistem saat cabang mengirim berkas -- lihat kolom "ID" di Google Sheets, atau pesan "Berhasil dikirim" yang muncul di index.html saat submit).
3. Kalau ID yang dimasukkan cocok dengan ID baris tersebut, berkas PDF terbuka di tab baru. Kalau salah, muncul pesan error dan berkas tidak terbuka.
4. PDF itu sendiri **tidak dienkripsi/dikunci** -- ini murni gerbang di sisi tampilan website.

## Cara Kerja Password Otorisasi Admin

Saat admin klik **Verifikasi** pada suatu baris di `tracking.html`, sebelum bisa klik **Simpan**, admin wajib mengisi kolom **Password Otorisasi Admin**. Password ini sama untuk semua admin (bukan per orang), disimpan di `assets/branch-config.js` sebagai `SUBMIT_GATE_PASSWORD`.

**Mengganti password otorisasi admin:** edit file `assets/branch-config.js` di GitHub, ubah nilai `SUBMIT_GATE_PASSWORD`, lalu Commit changes.

**Mengganti password otorisasi admin (`pajak123`):** ubah nilai `SUBMIT_GATE_PASSWORD` di `assets/branch-config.js`. Password ini wajib dimasukkan admin setiap kali menyimpan hasil verifikasi (approve/reject) di tracking.html.

## Daftar Kode Cabang yang Terdaftar

HHO, DLR, DLY, DLP, DMP, DLA, DLQ, DLO, DMR, DLF, DLH, DLB, DLV, DLE, DLJ, DMN, DLS, DLX, DLZ, DLI, DMM, DLK, DLU, DLG, DLW, DLN, DLM, DLT, DLD, DMK, MML, MMM, MMT

Untuk menambah/menghapus cabang, edit `BRANCH_LIST` di `assets/branch-config.js`.

---

## Alur Kerja

1. **Cabang** buka `index.html` → masukkan password akses → isi kode cabang, PIC, nomor NC, upload PDF → tersimpan ke folder Drive `Berkas Masuk - Payment Request` + tercatat status **Menunggu Verifikasi**.

   > 📁 Folder ini otomatis muncul di **My Drive** akun Google yang dipakai deploy Apps Script.

2. **Admin** buka `tracking.html` → pantau status secara real-time (auto-refresh tiap 3 detik, ada indikator "diperbarui HH:MM:SS").

3. Admin klik **Verifikasi** pada baris terkait → unggah PDF hasil tanda tangan/verifikasi → pilih status **Terverifikasi**/**Ditolak** → tersimpan ke folder Drive `Berkas Terverifikasi - Payment Request`.

   > 📁 Folder ini juga otomatis muncul di **My Drive**, sejajar dengan folder di atas.

4. Cabang/admin klik tombol "Lihat Hasil" di tabel tracking, masukkan password cabang saat diminta, lalu unduh & upload ke website perusahaan sesuai prosedur.

## Kolom di Google Sheets

| Kolom | Keterangan |
|---|---|
| ID | Nomor tersistem, format `NCT-0007/050726` (0007 = urutan dokumen ke-7, 050726 = tanggal 5 Juli 2026) |
| Timestamp Kirim | Waktu cabang mengirim berkas |
| Cabang | Kode cabang (dari daftar tetap) |
| Nama PIC / No Telpon | Pengaju dari cabang (nomor telepon tampil sebagai link WhatsApp di tracking) |
| No Payment Request / Link Payment Request | Nomor & link NC |
| File Berkas | Link Google Drive berkas asli dari cabang (dibuka lewat tombol berpassword di tracking.html) |
| Status | Menunggu Verifikasi / Terverifikasi / Ditolak |
| File Hasil Verifikasi | Link Google Drive berkas hasil verifikasi admin (dibuka lewat tombol berpassword di tracking.html) |
| Tanggal Verifikasi / Admin Verifikator / Catatan Admin | Diisi saat admin memverifikasi |

## Batasan yang Perlu Diketahui

- Akses form & tracking masih bisa dibuka siapa pun yang tahu link (password di sini bukan pengaman level enterprise — lihat bagian "Penting soal password" di atas).
- Bergantung pada 1 akun Google (yang men-deploy Apps Script) — kalau perlu keberlangsungan jangka panjang, sebaiknya pakai akun Google Workspace perusahaan, bukan akun pribadi.
- Ada batas kuota harian Google Apps Script (wajar untuk pemakaian normal beberapa cabang/hari, bisa mentok kalau volume sangat tinggi).
- File PDF besar (>10MB, sudah dibatasi sistem) bisa lambat diproses — makin besar file, makin lama proses enkripsi & upload.

## Pengembangan Lanjutan (Opsional)

- Tambah kolom **deadline** & pengingat otomatis via trigger waktu di Apps Script.
- Kirim notifikasi email ke cabang saat status berubah (`MailApp.sendEmail`).
- Pindahkan password ke penyimpanan sisi server (Apps Script) untuk keamanan lebih baik.
