"""Tes: chip nyawa & skill di kartu Master, Bubbles menggembung di Master, layar SELESAI. Jalankan: python3 test/master-notify.py"""
import subprocess, time, sys, os, re
from playwright.sync_api import sync_playwright
PORT = 3919
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
    return pg
try:
    with sync_playwright() as p:
        br = p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])
        ctxs = [br.new_context() for _ in range(3)]
        M, A, B = new_page(ctxs[0], 'M'), new_page(ctxs[1], 'A', 900, 560), new_page(ctxs[2], 'B', 900, 560)
        mj = os.path.join(ROOT, 'node_modules', 'matter-js', 'build', 'matter.min.js')
        if not os.path.exists(mj): mj = os.path.join(ROOT, 'test', 'matter-stub.js')
        for c in ctxs: c.route('**/matter.min.js', lambda r: r.fulfill(path=mj, content_type='text/javascript'))
        M.goto(BASE); M.wait_for_selector('#nm'); M.fill('#nm', 'Guru'); M.click('#cm'); M.wait_for_selector('.codebox'); code = M.inner_text('.codebox').strip()
        A.goto(BASE + '?room=' + code); A.wait_for_selector('#nm'); A.fill('#nm', 'Ayu'); A.click('#jn'); A.wait_for_selector('#rd')
        B.goto(BASE); B.wait_for_selector('#nm'); B.fill('#nm', 'Budi'); B.fill('#cd', code); B.click('#jn'); B.wait_for_selector('#rd')
        M.wait_for_function("document.querySelectorAll('#ol .sl:not([style])').length>=2", timeout=8000)
        A.click('#rd'); B.click('#rd'); M.wait_for_function("!document.getElementById('st').disabled", timeout=8000); M.click('#st')
        for pg in (A, B): pg.wait_for_function("document.getElementById('ol').classList.contains('hide')", timeout=10000)
        M.wait_for_selector('#mg .tl', timeout=8000)
        M.wait_for_function("(()=>{const r=Live.master.reps;return r&&Object.keys(r).length>=2&&Object.values(r).every(x=>x.has)})()", timeout=25000)
        check('Master tersambung ke kedua pemain', True)

        # 1) nyawa berkurang -> chip merah di kartu
        A.evaluate("hearts=3"); A.wait_for_timeout(400); A.evaluate("hearts=2")
        M.wait_for_selector('#mg .chp.lf', timeout=6000)
        t = M.inner_text('#mg .chp.lf'); check('chip nyawa muncul di kartu Master', 'Nyawa' in t and '2' in t, t)
        M.screenshot(path=SHOTS + '/6-chip-nyawa.png')

        # 2+3) skill Bubbles: chip + burung membesar di Master
        A.evaluate("""(()=>{const bd=Bodies.circle(300,300,13,{label:'bird'});bd.w=0;bd.type='bubbles';bd.used=false;bd.free=true;bd.mx=300;bd.my=300;bd.born=frame;flock=[bd];cur=bd;st='fly';window.__bd=bd;rest=-9999})()""")
        A.wait_for_timeout(1200)
        small = M.evaluate("Object.values(Live.master.reps).map(r=>r.bodies.filter(b=>b.k===1&&b.type==='bubbles').map(b=>b.rr))")
        check('burung Bubbles tampil di Master (ukuran normal sebelum skill)', any(len(s) and all(x in (None, 13) for x in s) for s in small), small)
        A.evaluate("window.skill(window.__bd)")
        M.wait_for_selector('#mg .chp.sk', timeout=6000)
        t = M.inner_text('#mg .chp.sk'); check('chip skill muncul (Bubbles)', 'Bubbles' in t and 'menggembung' in t, t)
        M.screenshot(path=SHOTS + '/7-chip-skill.png')
        M.wait_for_timeout(500)
        big = M.evaluate("Object.values(Live.master.reps).map(r=>r.bodies.filter(b=>b.k===1&&b.type==='bubbles').map(b=>b.rr))")
        check('Bubbles menggembung di Master (radius x2,4)', any(abs(x - 13 * 2.4) < .01 for s in big for x in s), big)

        # skill tidak dikirim dua kali & Terence tidak memicu chip
        n0 = M.locator('#mg .chp.sk').count()
        A.evaluate("window.skill(window.__bd)"); M.wait_for_timeout(600)
        check('skill yang sama tidak memunculkan chip ganda', M.locator('#mg .chp.sk').count() <= n0)

        # 4) pemain kalah -> layar hitam SELESAI + skor
        A.evaluate("score=1234;hearts=0"); A.wait_for_timeout(2300)
        A.evaluate("result(false)")
        M.wait_for_selector('#mg .fo.on', timeout=10000)
        txt = M.inner_text('#mg .fo.on'); check('layar SELESAI + skor + keterangan kalah', 'SELESAI' in txt and '1234' in txt and 'Kalah' in txt, txt)
        bg = M.evaluate("getComputedStyle(document.querySelector('#mg .fo.on')).backgroundColor"); check('latar layar selesai hitam', bg in ('rgb(0, 0, 0)',), bg)
        M.wait_for_function("[...document.querySelectorAll('#mg .fps')].some(e=>e.textContent.includes('selesai'))", timeout=4000)
        lab = M.evaluate("[...document.querySelectorAll('#mg .fps')].map(e=>e.textContent)")
        check('label FPS kartu selesai berubah & kartu tidak digambar lagi', any('selesai' in x for x in lab), lab)
        check('kartu pemain lain (B) tidak ikut hitam', M.locator('#mg .fo.on').count() == 1)
        M.screenshot(path=SHOTS + '/8-selesai.png')
        br.close()
finally:
    srv.terminate()
for e in errors: print('  !', e)
check('tanpa error JS', not errors, errors[:3])
print('\n%s' % ('SEMUA LOLOS' if not fails else 'GAGAL: ' + ', '.join(fails)))
sys.exit(1 if fails else 0)
