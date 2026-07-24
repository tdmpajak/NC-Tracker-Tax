# Doc Tracker Tax

Sistem logbook online untuk cabang mengirim berkas PDF (NC, Non NC, atau LPJ) untuk verifikasi pajak, dan admin pusat melacak status per jenis dokumen.

**Fitur utama:**
- Cabang kirim berkas PDF + data pengajuan melalui form online, termasuk memilih **Jenis Dokumen** (NC - Aktual / Non NC - Aktual / LPJ) dan **No. Dokumen** (contoh format nomor otomatis menyesuaikan jenis dokumen yang dipilih)
- Admin memantau semua pengajuan secara real-time (auto-refresh tiap 3 detik) di dashboard tracking, dengan **3 menu di sidebar kiri** sesuai jenis dokumen: NC - Aktual, Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya), dan LPJ
- **ID pengajuan sebagai "password"** untuk membuka link PDF di tabel tracking (setiap pengajuan sudah punya ID unik otomatis)
- Nomor ID pengajuan tersistem: `DTT-0007/050726` (nomor urut + tanggal)
- **Ubah/verifikasi status (Terverifikasi/Ditolak) dilakukan sepenuhnya di aplikasi terpisah, NC Verifier** — bukan lagi di `tracking.html`. Karena NC Verifier tidak bisa diakses cabang/PIC, langkah ini **tidak lagi memakai password otorisasi**.

**Arsitektur:** HTML statis (GitHub Pages) → Google Apps Script (API) → Google Sheets (tracking) + Google Drive (penyimpanan PDF). Backend yang sama dipakai bersama oleh project NC Verifier untuk proses verifikasi.

Tidak perlu server sendiri, tidak ada biaya hosting.

---

## 🔁 Sudah pakai NC Tracker Tax versi lama? Migrasi dulu sebelum ganti Code.gs

Kalau sebelumnya sudah pakai **NC Tracker Tax** dan Google Sheet-nya sudah ada isinya, **jangan langsung timpa `Code.gs` dengan versi baru** -- lakukan migrasi struktur sheet dulu, supaya data lama tidak salah kolom:

1. Buka Apps Script project yang **sedang dipakai sekarang** (yang isinya masih versi lama).
2. Tempelkan fungsi `migrateToDocTracker()` (ada di paling bawah file `google-apps-script/Code.gs` versi baru ini) ke Code.gs yang lama -- cukup fungsi ini saja dulu, jangan timpa semuanya.
3. Di toolbar Apps Script, pilih `migrateToDocTracker` dari dropdown fungsi di sebelah tombol Run (▶), lalu klik **Run**. Izinkan akses kalau diminta.
4. Cek Google Sheet-nya -- pastikan kolom **Jenis Dokumen** sudah muncul dan otomatis terisi **"NC - Aktual"** di semua baris lama (karena sistem lama memang khusus dokumen NC/Payment Request).
5. Setelah migrasi berhasil, baru timpa **seluruh isi** `Code.gs` dengan isi file `google-apps-script/Code.gs` versi baru ini (termasuk fungsi migrasi -- aman dibiarkan, otomatis tidak melakukan apa-apa lagi kalau Anda jalankan ulang).
6. **Deploy → Manage deployments** → ikon pensil ✏️ pada deployment yang sudah ada → **Version: New version** → **Deploy** (supaya URL Web App tetap sama, tidak perlu ubah `config.js`).
7. Update file `index.html`, `tracking.html`, dan folder `assets/` di GitHub repo Anda ke isi paket ini.

> Kalau ada baris data lama yang sebenarnya bukan dokumen NC, tinggal edit manual sel kolom "Jenis Dokumen" baris tersebut di Google Sheets setelah migrasi, isi dengan salah satu: `NC - Aktual`, `Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya)`, atau `LPJ`.

> Sempat menjalankan versi migrasi sebelumnya yang masih membuat kolom **"Link Dokumen"**? Jalankan juga fungsi `dropLinkDokumenColumnIfExists()` (ada di `Code.gs`) sekali untuk membersihkannya -- aman dijalankan kapan saja, tidak melakukan apa-apa kalau kolomnya sudah tidak ada.

Kalau ini pemasangan **baru** (belum pernah pakai versi lama sama sekali), langsung lanjut ke langkah setup di bawah tanpa perlu migrasi.

---

## ⚠️ Penting soal password — baca dulu sebelum lanjut

Website ini adalah situs statis (HTML/JS biasa), **bukan aplikasi dengan server rahasia**. Artinya:

- Password akses form cabang (`pajak123`, kalau diaktifkan) **tersimpan sebagai teks biasa** di file, yang bisa dibaca siapa pun yang membuka "View Page Source" atau tab Network/Sources di DevTools browser (tekan F12).
- Ini **BUKAN pengaman tingkat lanjut** terhadap orang yang paham teknis. Fungsinya lebih ke penyaring orang iseng yang kebetulan tahu link website-nya, bukan pengaman serius.
- **Menyimpan hasil verifikasi TIDAK lagi memakai password** — proses itu dipindahkan ke aplikasi NC Verifier yang terpisah dan tidak dibagikan ke cabang/PIC, sehingga sudah aman tanpa kode tambahan di langkah ini.
- ID pengajuan (kolom "ID" di Google Sheets, format `DTT-0001/tanggal`) berfungsi sebagai gerbang untuk membuka link PDF di tabel tracking. PDF itu sendiri **tidak dienkripsi** — kalau seseorang sudah punya link Google Drive-nya secara langsung (bukan lewat tombol di website), gerbang ini tidak berlaku karena itu di luar kendali website ini.
- Kalau ke depannya butuh keamanan yang lebih kuat, sebaiknya diproses di sisi server (Apps Script) yang tidak bisa dilihat publik. Kabari saja kalau nanti mau ditingkatkan ke arah situ.

---

## Struktur Project

```
doc-tracker-tax/
├── index.html                  # Portal masuk (pilih Akses ADH / Akses Tax)
├── kirim.html                   # Form pengajuan untuk cabang (Akses ADH → Kirim Berkas)
├── tracking.html                # Dashboard tracking (Akses ADH → Tracking Doc)
├── assets/
│   ├── style.css
│   ├── config.js                 # URL Apps Script + URL NC Verifier (WAJIB diisi manual, lihat langkah 5)
│   ├── branch-config.js          # Daftar kode cabang
│   ├── app.js                    # Logic form cabang
│   └── tracking.js               # Logic dashboard admin
└── google-apps-script/
    └── Code.gs                   # Backend (jalan di Google Apps Script, BUKAN di GitHub)
```

> **Struktur akses:** `index.html` adalah portal pertama yang dibuka siapa pun. Dari situ ada 2 pintu:
> - **Akses ADH** (terbuka untuk semua) → masuk ke `kirim.html`, yang punya menu **Kirim Berkas** dan **Tracking Doc** (yaitu `tracking.html`, cuma label menunya dipersingkat).
> - **Akses Tax** (perlu kode akses, default `pjk123` — ganti di `index.html` kalau perlu) → langsung diarahkan ke situs **NC Verifier** yang terpisah (URL-nya diatur di `assets/config.js`, konstanta `NC_VERIFIER_URL`).

> Menu ubah/verifikasi status ada di project **NC Verifier** terpisah — lihat repo NC Verifier untuk detail. NC Verifier "menumpang" ke backend Apps Script (`Code.gs`) yang sama dengan project ini, jadi keduanya harus memakai `API_URL`/`TRACKER_API_URL` yang identik.

---

## Langkah Setup dari Nol Sampai Live

### 1. Upload project ke GitHub

1. Buka [github.com](https://github.com) dan login (buat akun dulu jika belum punya).
2. Klik tombol **+** di pojok kanan atas → pilih **New repository**.
3. Isi **Repository name**, misalnya `doc-tracker-tax`. Pilih **Public**. Klik **Create repository**.
4. Di halaman repo yang masih kosong, klik link tulisan **uploading an existing file**.
5. Extract dulu folder hasil unduhan (`.zip`) di komputer Anda kalau belum.
6. Seret (drag & drop) **semua isi** folder tersebut ke area upload — pastikan strukturnya **rata di root repo, BUKAN bertumpuk di dalam folder lagi**:
   - `index.html`, `kirim.html`, `tracking.html`, `README.md` → langsung di root
   - folder `assets` (isinya `style.css`, `config.js`, `branch-config.js`, `app.js`, `tracking.js`) → tetap sebagai folder `assets`
   - folder `google-apps-script` (isinya `Code.gs`) → tetap sebagai folder tersebut
7. Scroll ke bawah, klik tombol hijau **Commit changes**.

> 📌 Kesalahan paling sering: meng-upload folder project itu sendiri ke dalam repo (jadi bertumpuk dua kali), atau sebaliknya meng-upload isi `assets/` rata ke root tanpa foldernya. Pastikan strukturnya **persis** seperti di atas.

### 2. Buat Google Sheet

1. Buka [sheets.google.com](https://sheets.google.com) → klik **Blank** untuk buat spreadsheet baru.
2. Beri nama, misalnya **"Tracking Verifikasi Dokumen"**.
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
6. Simpan URL ini sementara (paste ke Notes), dipakai di langkah 5 — dan juga dipakai di `config.js` project **NC Verifier** (harus sama persis).

> ⚠️ **Setiap kali mengedit ulang `Code.gs` di kemudian hari**, jangan klik "New deployment" lagi (itu bikin URL baru). Klik **Deploy → Manage deployments** → ikon pensil ✏️ pada deployment yang **sudah ada** → dropdown **Version** ganti ke **New version** → klik **Deploy**. Dengan begitu URL tetap sama, tidak perlu update `config.js` lagi.

### 5. Masukkan URL Web App ke config.js

1. Di repo GitHub Anda → buka folder `assets` → klik file `config.js` → klik ikon pensil ✏️ **Edit this file**.
2. Ganti isi `PASTE_URL_WEB_APP_ANDA_DI_SINI` dengan URL dari langkah 4, sehingga jadi:
   ```js
   const API_URL = "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxx/exec";
   ```
3. Di file yang sama, cek juga baris `NC_VERIFIER_URL` — pastikan sudah sesuai dengan URL GitHub Pages project **NC Verifier** Anda yang sebenarnya (cek di Settings → Pages project NC Verifier). Ini dipakai portal (`index.html`) untuk mengarahkan "Akses Tax".
4. Scroll ke bawah, klik **Commit changes**.
5. Lakukan hal yang sama di `config.js` project **NC Verifier** (`TRACKER_API_URL`) dengan URL Apps Script yang **sama persis** seperti `API_URL` di atas.

### 6. Aktifkan GitHub Pages

1. Di halaman utama repo → klik tab **Settings** → menu kiri **Pages**.
2. Bagian **Branch**, pilih **main**, folder `/ (root)`, klik **Save**.
3. Tunggu 1-2 menit, refresh — muncul link seperti:
   `https://USERNAME.github.io/doc-tracker-tax/`

### 7. Selesai — Bagikan Link

- **Siapa saja** (cabang maupun tim pajak) cukup dibagikan **satu link portal**: `https://USERNAME.github.io/doc-tracker-tax/`
  - Klik **Akses ADH** → masuk ke Kirim Berkas / Tracking Doc (terbuka untuk semua, tanpa kode).
  - Klik **Akses Tax** → diminta kode akses (default `pjk123`, bisa diganti di `index.html`) → kalau benar, otomatis diarahkan ke **NC Verifier**.
- **Data mentah** selalu bisa dicek langsung di tab `Tracking` pada Google Sheet Anda.

---

## Alur Kerja

1. **Cabang** buka portal `index.html` → klik **Akses ADH** → **Kirim Berkas** (`kirim.html`) → isi kode cabang, PIC, pilih **Jenis Dokumen** (NC - Aktual / Non NC - Aktual / LPJ), isi **No. Dokumen** (contoh format menyesuaikan jenis dokumen yang dipilih), upload PDF → tersimpan ke folder Drive `Berkas Masuk - Dokumen` + tercatat status **Menunggu Verifikasi**.

   > 📁 Folder ini otomatis muncul di **My Drive** akun Google yang dipakai deploy Apps Script.

2. **Admin** buka **Akses ADH → Tracking Doc** (`tracking.html`) → pilih salah satu dari 3 menu di sidebar kiri (NC - Aktual / Non NC - Aktual / LPJ) → pantau status secara real-time (auto-refresh tiap 3 detik, ada indikator "diperbarui HH:MM:SS").

3. Untuk memverifikasi atau menolak suatu pengajuan, admin membuka **Akses Tax** dari portal (masukkan kode akses) untuk masuk ke **NC Verifier** (bukan `tracking.html`), memuat dokumen dari daftar "Dari Doc Tracker Tax", membubuhkan stempel (untuk yang diverifikasi), lalu mengirim hasilnya langsung dari NC Verifier — otomatis tersimpan ke folder Drive `Berkas Terverifikasi - Dokumen` dan status di `tracking.html` ikut berubah.

4. Cabang/admin klik tombol "Lihat Hasil" di tabel tracking, masukkan ID pengajuan saat diminta, lalu unduh & upload ke website perusahaan sesuai prosedur.

## Kolom di Google Sheets

| Kolom | Keterangan |
|---|---|
| ID | Nomor tersistem, format `DTT-0007/050726` (0007 = urutan dokumen ke-7, 050726 = tanggal 5 Juli 2026) |
| Timestamp Kirim | Waktu cabang mengirim berkas |
| Cabang | Kode cabang (dari daftar tetap) |
| Nama PIC / No Telpon | Pengaju dari cabang (nomor telepon tampil sebagai link WhatsApp di tracking) |
| Jenis Dokumen | NC - Aktual / Non NC - Aktual (PO, KPB, DN, Dokumen Lainnya) / LPJ |
| No Dokumen | Nomor dokumen (NC/PO/DN/AVP/dsb, sesuai Jenis Dokumen) |
| File Berkas | Link Google Drive berkas asli dari cabang (dibuka lewat tombol berpassword di tracking.html) |
| Status | Menunggu Verifikasi / Terverifikasi / Ditolak |
| File Hasil Verifikasi | Link Google Drive berkas hasil verifikasi dari NC Verifier |
| Tanggal Verifikasi / Admin Verifikator / Catatan Admin | Diisi otomatis saat admin memverifikasi/menolak lewat NC Verifier |

## Daftar Kode Cabang yang Terdaftar

Untuk menambah/menghapus cabang, edit `BRANCH_LIST` di `assets/branch-config.js`.

## Batasan yang Perlu Diketahui

- Akses form & tracking masih bisa dibuka siapa pun yang tahu link.
- Bergantung pada 1 akun Google (yang men-deploy Apps Script) — kalau perlu keberlangsungan jangka panjang, sebaiknya pakai akun Google Workspace perusahaan, bukan akun pribadi.
- Ada batas kuota harian Google Apps Script (wajar untuk pemakaian normal beberapa cabang/hari, bisa mentok kalau volume sangat tinggi).
- File PDF besar (>10MB, sudah dibatasi sistem) bisa lambat diproses — makin besar file, makin lama proses upload.

## Pengembangan Lanjutan (Opsional)

- Tambah kolom **deadline** & pengingat otomatis via trigger waktu di Apps Script.
- Kirim notifikasi email ke cabang saat status berubah (`MailApp.sendEmail`).
