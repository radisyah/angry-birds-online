# Angry Birds — Math Edition · Online (2–4 pemain) untuk Vercel

Versi online dari game *Angry Birds Math Edition*, dengan cara kerja yang sama seperti **war-of-kingdom-online**:
kode ruangan 5 karakter, token sesi di `localStorage`, polling ke satu Vercel Function (`/api/room`), dan state di **Upstash Redis**.

Semua pemain mengerjakan **soal, susunan blok, dan urutan burung yang sama** (seed dari server). Fisika berjalan di perangkat
masing-masing; skor tertinggi menang (seri dipecah dengan jumlah tembakan paling sedikit).

```
Browser P1..P4 ─┐                         ┌─ Upstash Redis (room, tanda hadir, statistik langsung, kunci)
Room Master ────┼─ polling ─ /api/room ───┤
                └                         └─ public/game-core.js (penyaringan skor & papan peringkat, dipakai server & klien)
```

## Alur
- **Buat Ruangan** (pembuat = Pemain 1 & pemilik) atau **Jadi Room Master** (hanya memantau, tidak bermain). Teman bergabung dengan kode / tombol *Salin Tautan* (`?room=KODE`).
- 2–4 pemain. Pemain menekan *Saya siap*; pemilik (Room Master bila ada, kalau tidak Pemain 1) menekan *Mulai*.
- Saat bermain, tiap pemain mengirim statistik (skor, nyawa, soal, streak) tiap ±2 detik. **Room Master melihat kartu skor langsung**
  semua pemain (pengganti stream layar versi LAN, yang tidak bisa jalan di Vercel) dan bisa *Hentikan permainan*.
- Setelah semua pemain selesai → papan skor akhir. Pemilik bisa *Main lagi* (kembali ke lobi, seed baru).
- Pemain keluar / terputus > 45 dtk tanpa statistik / dihentikan Master → dihitung gugur dengan skor terakhir. Batas keras satu permainan 30 menit.
- Muat ulang halaman di tengah bermain = dianggap keluar dari ronde itu (skor lokal hilang). Di lobi & papan skor, sesi otomatis tersambung kembali.

## Deploy ke Vercel
1. Taruh folder ini di repositori GitHub, lalu **Add New → Project** di Vercel (preset "Other", tanpa build command). Atau: `npm i -g vercel && vercel`.
2. Dashboard proyek → **Storage / Marketplace** → tambahkan **Upstash Redis** → hubungkan ke proyek. Otomatis terisi
   `KV_REST_API_URL` + `KV_REST_API_TOKEN` (atau `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`); keduanya didukung.
3. **Redeploy** (variabel baru hanya berlaku untuk deployment baru).
4. Buka URL proyek → buat ruangan → bagikan kode.

Bila Redis belum terhubung, API membalas: *"Database belum dikonfigurasi…"*.

## Lokal
```bash
node dev-server.js        # http://localhost:3000 (penyimpanan memori, hanya untuk pengembangan)
npm test                  # 17 tes API: lewat memori DAN lewat jalur Redis REST (server tiruan format Upstash)
python3 test/e2e.py       # 3 browser Chromium: Room Master + 2 pemain (pip install playwright && playwright install chromium)
```
Game memuat `matter-js` dari cdnjs (seperti file aslinya). `test/e2e.py` memakai pengganti tanpa fisika (`test/matter-stub.js`) bila matter-js tidak tersedia.

## Catatan biaya & batasan
- Redis: tiap pemain yang bermain ±1 GET + 1 SET per 2 dtk; Room Master ±4 perintah per polling (1,5 dtk). Satu ronde 4 pemain ±10 menit ≈ 6.000–8.000 perintah.
- **Skor dihitung di perangkat pemain** (fisika tidak bisa dijalankan server), jadi tidak kebal dari kecurangan lewat konsol browser. Server hanya
  membatasi nilai ke rentang wajar (maks. 15 soal, skor ≤ 200.000, dst.). Cocok untuk kelas/teman, bukan turnamen berhadiah.
- Tab yang disembunyikan menghentikan game (browser menghentikan animasi) sehingga statistik berhenti → setelah 45 dtk pemain dianggap gugur.
- Tanpa akun/login: siapa pun yang tahu kode & ruangan belum penuh/berjalan bisa bergabung. Ruangan kedaluwarsa 6 jam setelah aktivitas terakhir.
