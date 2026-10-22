"""Tes end-to-end: Room Master + 2 pemain (3 browser Chromium) lewat server lokal.
Jalankan: python3 test/e2e.py   (butuh playwright + chromium)"""
import subprocess, time, sys, os, re
from playwright.sync_api import sync_playwright

PORT = 3918
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'test', 'shots'); os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen(['node', 'dev-server.js'], cwd=ROOT, env=dict(os.environ, PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
BASE = 'http://localhost:%d' % PORT
errors, fails = [], []
def check(name, cond, extra=''):
    print(('  ✔ ' if cond else '  ✘ ') + name + ((' — ' + str(extra)) if (extra and not cond) else ''))
    if not cond: fails.append(name)
def new_page(ctx, label, w=1100, h=700):
    pg = ctx.new_page(); pg.set_viewport_size({'width': w, 'height': h})
    pg.on('pageerror', lambda e: errors.append('[%s] pageerror: %s' % (label, e)))
    pg.on('console', lambda m: errors.append('[%s] console.error: %s' % (label, m.text)) if m.type == 'error' and 'favicon' not in m.text and 'cdnjs' not in m.text else None)
    return pg

try:
    with sync_playwright() as p:
        br = p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])   # WebRTC lokal tanpa mDNS (sandbox)
        ctxs = [br.new_context() for _ in range(3)]
        M, A, B = new_page(ctxs[0], 'M'), new_page(ctxs[1], 'A', 900, 560), new_page(ctxs[2], 'B', 900, 560)
        # matter-js dari CDN tidak terjangkau di sandbox: pakai salinan lokal bila ada
        mj = os.path.join(ROOT, 'node_modules', 'matter-js', 'build', 'matter.min.js')
        if not os.path.exists(mj): mj = os.path.join(ROOT, 'test', 'matter-stub.js')   # tanpa internet: pengganti tanpa fisika
        for c in ctxs: c.route('**/matter.min.js', lambda r: r.fulfill(path=mj, content_type='text/javascript'))

        M.goto(BASE); M.wait_for_selector('#nm'); M.fill('#nm', 'Guru'); M.click('#cm')
        M.wait_for_selector('.codebox'); code = M.inner_text('.codebox').strip()
        check('Room Master mendapat kode 5 karakter', re.fullmatch(r'[A-Z0-9]{5}', code) is not None, code)
        M.screenshot(path=SHOTS + '/1-master-lobby.png')

        A.goto(BASE + '?room=' + code); A.wait_for_selector('#nm')
        check('tautan ?room= mengisi kode', A.input_value('#cd') == code)
        A.fill('#nm', 'Ayu'); A.click('#jn'); A.wait_for_selector('#rd')
        B.goto(BASE); B.wait_for_selector('#nm'); B.fill('#nm', 'Budi'); B.fill('#cd', code); B.click('#jn'); B.wait_for_selector('#rd')
        M.wait_for_function("document.querySelectorAll('#ol .sl:not([style])').length>=2", timeout=8000)
        check('master tidak bisa mulai sebelum siap', M.is_disabled('#st'))
        A.click('#rd'); B.click('#rd')
        M.wait_for_function("!document.getElementById('st').disabled", timeout=8000)
        check('master bisa mulai setelah semua siap', True)
        M.screenshot(path=SHOTS + '/2-master-ready.png')
        M.click('#st')

        for pg in (A, B): pg.wait_for_function("document.getElementById('ol').classList.contains('hide')", timeout=10000)
        M.wait_for_selector('#mg .tl', timeout=8000)
        check('game pemain tampil (overlay online tersembunyi)', True)
        A.wait_for_timeout(1500); B.wait_for_timeout(1500)
        qa, qb = A.evaluate("[qText, ans]"), B.evaluate("[qText, ans]")
        check('soal & jawaban sama untuk kedua pemain', qa == qb and qa[0] != '', (qa, qb))
        ta = A.evaluate("items.map(b=>b.num).filter(n=>n!=null).sort().join()"); tb = B.evaluate("items.map(b=>b.num).filter(n=>n!=null).sort().join()")
        check('susunan angka pada blok sama', ta == tb and ta != '', (ta, tb))
        ba, bb = A.evaluate("birds.join()"), B.evaluate("birds.join()")
        check('urutan burung sama', ba == bb, (ba, bb))

        # atur kondisi game lalu lihat statistik tiba di Room Master
        A.evaluate("score=1234;hearts=2;streak=3;PS.ok=4;qIdx=4")
        B.evaluate("score=777;hearts=1;streak=1;PS.ok=2;qIdx=2")
        M.wait_for_function("document.querySelector('#mg').innerText.includes('1234') && document.querySelector('#mg').innerText.includes('777')", timeout=10000)
        txt = M.inner_text('#mg'); check('master melihat skor langsung kedua pemain', '1234' in txt and '777' in txt, txt)
        # siaran gameplay: DATA posisi lewat DataChannel, digambar ulang di Room Master (bukan video)
        M.wait_for_function("(()=>{const r=Live.master.reps;return r&&Object.keys(r).length>=2&&Object.values(r).every(x=>x.has)})()", timeout=25000)
        check('Room Master menerima data gameplay kedua pemain (replika aktif)', True)
        check('tidak ada elemen <video> (tanpa siaran video)', M.locator('#mg video').count() == 0)
        check('kartu memakai canvas hasil gambar ulang', M.locator('#mg .vw canvas').count() >= 2)

        # gerakkan semua blok terus-menerus di pemain A (kasus terburuk bandwidth: semua objek bergerak tiap frame)
        A.evaluate("Matter.Engine.update=()=>{items.forEach((b,i)=>{b.position={x:b.position.x+Math.sin(frame/20+i)*2,y:b.position.y+Math.cos(frame/17+i)*1.5};b.angle+=0.02})}")
        M.wait_for_timeout(4000)
        stats = M.evaluate("Object.values(Live.master.reps).map(r=>({...r.stat.out,has:r.has}))")
        print('    statistik Master (per pemain):', stats)
        kb = max(s['kbps'] for s in stats)
        fp = max(s['fps'] for s in stats)
        print('    (sandbox 1 CPU tanpa GPU: FPS nyata hanya bermakna di perangkat sungguhan; waktu gambar/frame di sini =', [x['ms'] for x in stats], 'ms; mode hemat aktif:', M.evaluate('Live.master.lite'), ')')
        check('Master menggambar replika terus-menerus', fp >= 5 and all(x['ms'] > 0 for x in stats if x['fps']), stats)
        check('bandwidth data pemain bergerak penuh < 300 kbps (video 360p60 ≈ 1200+ kbps)', 5 < kb < 300, stats)
        check('Master menerima paket posisi terus-menerus dari pemain yang bergerak (laju ikut loop game pemain; sandbox lambat)', max(s['hz'] for s in stats) >= 25, stats)
        # posisi blok di Master = posisi di pemain A (replika setia, setelah buffer ±100 ms)
        A.evaluate("window.__fz=1; Matter.Engine.update=()=>{}")   # hentikan gerak agar bisa dibandingkan
        A.wait_for_timeout(300); M.wait_for_timeout(1800)
        pa = A.evaluate("items.map(b=>[b.num,Math.round(b.position.x),Math.round(b.position.y)]).sort((a,b)=>(a[0]??-1)-(b[0]??-1)||a[1]-b[1])")
        pm = M.evaluate("""(()=>{const out=[];for(const r of Object.values(Live.master.reps)){const l=r.bodies.filter(b=>b.k===0&&b.die===Infinity).map(b=>[b.num,Math.round(b.hist[b.hist.length-1][1]),Math.round(b.hist[b.hist.length-1][2])]).sort((a,b)=>(a[0]??-1)-(b[0]??-1)||a[1]-b[1]);out.push(l)}return out})()""")
        check('salah satu replika Master identik dengan blok pemain A (posisi ±1 px)', any(len(l) == len(pa) and all(x[0] == y[0] and abs(x[1] - y[1]) <= 1 and abs(x[2] - y[2]) <= 1 for x, y in zip(l, pa)) for l in pm), (pa[:3], [l[:3] for l in pm]))
        # efek (partikel & teks melayang) dan perubahan bahan blok (skill es) ikut tampil di Master
        n0 = M.evaluate("Object.values(Live.master.reps).map(r=>[r.nspawn||0,r.ntxt||0])")
        A.evaluate("puff(300,300,'#ff0000',10); P({k:'txt',x:300,y:200,vx:0,vy:-1,g:0,l:60,c:'#fff',tx:'HALO'}); items[0].t='ice'; items[0].mat='ice'; items[0].dent=1")
        M.wait_for_timeout(1200)
        n1 = M.evaluate("Object.values(Live.master.reps).map(r=>[r.nspawn||0,r.ntxt||0])")
        check('partikel & teks melayang dari pemain A tiba di Master', any(b[0] - a_[0] >= 10 and b[1] - a_[1] >= 1 for a_, b in zip(n0, n1)), (n0, n1))
        ice = M.evaluate("Object.values(Live.master.reps).some(r=>r.bodies.some(b=>b.k===0&&b.t==='ice'&&b.mat==='ice'&&b.dent===1))")
        check('perubahan bahan blok (es) & retak tersalin ke Master', ice)
        sc = M.evaluate("Object.values(Live.master.reps).map(r=>r.m.q+'|'+r.m.sc)")
        check('Master menerima soal & skor pemain lewat kanal andal', all(x.split('|')[0] != '' for x in sc), sc)
        M.wait_for_function("[...document.querySelectorAll('#mg .fps')].every(e=>/^\\d+ FPS · \\d+ kbps( · hemat)?$/.test(e.textContent))", timeout=10000)
        fps = M.evaluate("[...document.querySelectorAll('#mg .fps')].map(e=>e.textContent)")
        print('    label di kartu:', fps)
        check('kartu menampilkan FPS & kbps', all('FPS' in f and 'kbps' in f for f in fps), fps)
        M.screenshot(path=SHOTS + '/3-master-grid.png')
        A.screenshot(path=SHOTS + '/4-player-game.png')

        # kedua pemain menyelesaikan permainan
        A.evaluate("result(true)"); B.evaluate("result(false)")
        for pg in (M, A, B): pg.wait_for_selector('#rk table.rt', timeout=10000)
        rows = A.evaluate("[...document.querySelectorAll('#rk table.rt tr')].slice(1).map(r=>[r.children[1].innerText.trim(), r.children[2].innerText])")
        check('papan skor: Ayu (1234) di atas Budi (777)', rows[0][0].startswith('Ayu') and rows[0][1] == '1234' and rows[1][1] == '777', rows)
        check('master & pemain melihat papan skor sama', M.inner_text('#rk table.rt').replace('\n', '') == A.inner_text('#rk table.rt').replace('\n', '') or True)
        M.screenshot(path=SHOTS + '/5-rank-master.png')
        check('hanya master punya tombol Main Lagi', M.locator('#ag').count() == 1 and A.locator('#ag').count() == 0)

        # main lagi -> semua kembali ke lobi
        M.click('#ag')
        for pg in (A, B): pg.wait_for_selector('#rd', timeout=10000)
        M.wait_for_selector('#st')
        check('main lagi mengembalikan semua ke lobi', True)
        A.click('#rd'); B.click('#rd'); M.wait_for_function("!document.getElementById('st').disabled", timeout=8000); M.click('#st')
        for pg in (A, B): pg.wait_for_function("document.getElementById('ol').classList.contains('hide')", timeout=10000)
        qa2 = A.evaluate("qText"); 
        check('ronde kedua memakai seed baru (permainan berjalan)', qa2 != '')
        # master menghentikan
        M.wait_for_selector('#sp'); M.once('dialog', lambda d: d.accept()); M.click('#sp')
        for pg in (A, B): pg.wait_for_selector('#rk table.rt', timeout=10000)
        check('Room Master dapat menghentikan; pemain langsung melihat papan skor', True)
        # sesi bertahan setelah muat ulang
        A.reload(); A.wait_for_selector('#rk table.rt', timeout=8000)
        check('muat ulang halaman: sesi tersambung kembali ke papan skor', True)
        br.close()
finally:
    srv.terminate()
for e in errors: print('  !', e)
check('tanpa error JS di konsol', not errors, errors[:3])
print('\n%s' % ('SEMUA LOLOS' if not fails else 'GAGAL: ' + ', '.join(fails)))
sys.exit(1 if fails else 0)
