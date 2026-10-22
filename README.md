# BlockShot · Online (2–4 pemain) untuk Vercel

Versi online dari game *BlockShot*, dengan cara kerja yang sama seperti **war-of-kingdom-online**:
kode ruangan 5 karakter, token sesi di `localStorage`, polling ke satu Vercel Function (`/api/room`), dan state di **Upstash Redis**.

Semua pemain mengerjakan **soal, susunan blok, dan urutan burung yang sama** (seed dari server). Fisika berjalan di perangkat
masing-masing; skor tertinggi menang (seri dipecah dengan jumlah tembakan paling sedikit).

```
Browser P1..P4 ─┐                         ┌─ Upstash Redis (room, tanda hadir, statistik langsung, kunci, sinyal WebRTC)
Room Master ────┼─ polling ─ /api/room ───┤
                └                         └─ public/game-core.js (penyaringan skor & papan peringkat, dipakai server & klien)
```

## Alur
- **Buat Ruangan** (pembuat = Pemain 1 & pemilik) atau **Jadi Room Master** (hanya memantau, tidak bermain). Teman bergabung dengan kode / tombol *Salin Tautan* (`?room=KODE`).
- 2–4 pemain. Pemain menekan *Saya siap*; pemilik (Room Master bila ada, kalau tidak Pemain 1) menekan *Mulai*.
- Saat bermain, tiap pemain mengirim statistik (skor, nyawa, soal, streak) tiap ±2 detik. **Room Master melihat gameplay langsung Pemain 1–4**
  (**gameplay digambar ulang di Master dari data posisi, bukan video**; tampil lengkap dengan soal & HUD pada resolusi 640×360 di kartu, 960×540 saat diperbesar, **60 FPS**; FPS & kbps aktual tampil di pojok kanan atas tiap kartu)
  plus skor/nyawa/progres di tiap kartu; klik kartu untuk memperbesar satu pemain (kartu lain berhenti digambar → hemat CPU). Master juga bisa *Hentikan permainan*.
- **Cara siaran (hemat bandwidth, ±10× lebih ringan dari video):** fisika tetap berjalan di perangkat tiap pemain. Pemain mengirim lewat WebRTC DataChannel peer-to-peer
  (a) snapshot biner posisi objek 60 Hz (9 byte/objek, hanya objek yang bergerak; keyframe penuh tiap 1 dtk) lewat kanal *tidak andal* (paket hilang tidak ditunggu → tidak patah-patah) dan
  (b) kejadian penting (blok baru/hilang, skor, nyawa, soal, teks melayang) lewat kanal *andal*. Master mem-buffer ±100 ms, menginterpolasi antar snapshot, lalu menggambar dengan `draw()` game yang sama.
  Bandwidth ≈ 20–80 kbps per pemain biasa, maks. ±140 kbps bila ±25 objek bergerak tiap frame (video 360p60 ≈ 1200+ kbps). Server (Vercel) hanya menukar sinyal offer/answer.
  Buffer menyesuaikan sendiri (100–330 ms) bila jaringan bergetar. Bila laptop Master tak sanggup menggambar semua kartu 60 FPS, **mode hemat** otomatis (tiap kartu bergantian, 30 FPS) dan label kartu menulis "hemat".
  Penyambungan dipercepat: Master & pemain mengecek sinyal tiap ±0,6–0,7 dtk sampai tersambung (biasanya < 3 dtk), lalu kembali normal.
- **Agar Master bisa melihat dari SEMUA jaringan (4G/CGNAT, wifi sekolah/kantor, NAT ketat) wajib mengaktifkan server TURN (relay).**
  STUN saja hanya menembus sebagian jaringan. Pilih salah satu dan isi di Vercel → Settings → Environment Variables, lalu Redeploy:

  | Penyedia | Variabel |
  |---|---|
  | **Cloudflare Realtime TURN** (gratis 1 TB/bln, paling mudah) | `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` |
  | Metered.ca | `METERED_DOMAIN` (mis. `namaapp.metered.live`), `METERED_API_KEY` |
  | coturn sendiri (static-auth-secret) | `TURN_URLS` (pisah koma), `TURN_SECRET` |
  | TURN statis | `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` |

  Kredensial diberikan server hanya ke peserta ruangan (`GET /api/room?action=ice`). Tanpa TURN, kartu gameplay menampilkan
  "server TURN belum diatur" bila jaringan memblokir P2P; skor tetap tampil. Lalu-lintas data gameplay yang lewat relay dihitung ke kuota penyedia
  (≈ 0,8 Mbps × 4 pemain ≈ 1,4 GB per jam bila semua lewat relay).
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
npm test                  # 18 tes API: lewat memori DAN lewat jalur Redis REST (server tiruan format Upstash)
python3 test/e2e.py       # 3 browser Chromium: Room Master + 2 pemain (pip install playwright && playwright install chromium)
```
Game memuat `matter-js` dari cdnjs (seperti file aslinya). `test/e2e.py` memakai pengganti tanpa fisika (`test/matter-stub.js`) bila matter-js tidak tersedia.

## Catatan biaya & batasan
- Redis: tiap pemain yang bermain ±1 GET + 1 SET per 2 dtk; Room Master ±5 perintah per polling (1,5 dtk); +1 GET per kiriman statistik untuk membaca sinyal. Satu ronde 4 pemain ±10 menit ≈ 6.000–8.000 perintah.
- **Skor dihitung di perangkat pemain** (fisika tidak bisa dijalankan server), jadi tidak kebal dari kecurangan lewat konsol browser. Server hanya
  membatasi nilai ke rentang wajar (maks. 15 soal, skor ≤ 200.000, dst.). Cocok untuk kelas/teman, bukan turnamen berhadiah.
- Tab yang disembunyikan menghentikan game (browser menghentikan animasi) sehingga statistik berhenti → setelah 45 dtk pemain dianggap gugur.
- Tanpa akun/login: siapa pun yang tahu kode & ruangan belum penuh/berjalan bisa bergabung. Ruangan kedaluwarsa 6 jam setelah aktivitas terakhir.

## Siaran gameplay: berkas & uji
- `public/live.js` — codec snapshot, pengirim di sisi pemain (membaca state game tiap langkah fisika), replika + renderer di sisi Master.
- `node test/live.test.js` — codec & anggaran bandwidth. `python3 test/live-smooth.py` — kehalusan interpolasi dengan jam virtual (jitter 80 ms, paket hilang 15% → galat < 0,2 px).
- FPS nyata hanya bermakna di perangkat sungguhan; sandbox 1 CPU tanpa GPU tidak bisa mencapai 60 FPS untuk halaman apa pun.
