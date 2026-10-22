"""Uji kehalusan replika Master dengan jam virtual (tidak tergantung kecepatan mesin):
paket 60 Hz dengan jitter & kehilangan paket → posisi yang digambar Master harus mengikuti lintasan asli.
Jalankan: python3 test/live-smooth.py  (butuh playwright + chromium)"""
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
PORT = 3921
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen(['node', 'dev-server.js'], cwd=ROOT, env=dict(os.environ, PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
JS = """
(opts) => {
  const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rnd = mulberry(7), STEP = 1000 / 60, N = 900;
  const tx = n => 300 + 200 * Math.sin(n / 40), ty = n => 250 + 100 * Math.cos(n / 55), ta = n => n * 0.05;
  const cv = document.createElement('canvas'), r = new Live.Replica(cv); r.hidden = true;
  let vnow = 0; const realNow = performance.now.bind(performance); performance.now = () => vnow;
  r.onEv(JSON.stringify({ t: 'e', n: 0, nb: [{ i: 1, x: tx(0), y: ty(0), a: ta(0), w: 50, h: 50, t: 'wood', s: 0, u: 5, d: 0, f: 0 }], m: { q: '2+3', a: 5 } }));
  // paket: tiap langkah n; jitter 0..opts.jitter ms; hilang opts.loss (kecuali keyframe tiap 60)
  const pk = [];
  for (let n = 1; n <= N; n++) {
    if (rnd() < opts.loss && n % 60) continue;
    const buf = Live.encodeSnap({ key: n % 60 === 0, seq: n, n, playMs: n * STEP | 0, st: 3, ax: 170, ay: 372, shake: 0, flash: 0,
      bodies: [[1, Live.qPos(tx(n)), Live.qPos(ty(n)), Live.qAng(ta(n)), 0]], parts: [] });
    pk.push({ at: n * STEP + 20 + rnd() * opts.jitter, buf });
  }
  pk.sort((a, b) => a.at - b.at);
  let i = 0, maxE = 0, sumE = 0, cnt = 0, maxA = 0, jumps = 0, prevX = null;
  const body = () => r.map.get(1);
  for (vnow = 0; vnow < N * STEP + 400; vnow += STEP) {
    while (i < pk.length && pk[i].at <= vnow) r.onPacket(pk[i++].buf);
    if (r.off === null) continue;
    const T = r.simT(vnow);
    if (T < 120 || T > N - 5) continue;
    r.render(vnow);                       // hidden=true: hanya melangkah & mengurus event
    r.sample(body(), T);
    const b = body(), e = Math.hypot(b.position.x - tx(T), b.position.y - ty(T)); maxE = Math.max(maxE, e); sumE += e; cnt++;
    const da = Math.abs(((b.angle - ta(T)) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); maxA = Math.max(maxA, da);
    if (prevX !== null && Math.abs(b.position.x - prevX) > 8) jumps++;   // lompatan antar frame > 8 px (kecepatan asli maks ≈ 5 px/langkah)
    prevX = b.position.x;
  }
  performance.now = realNow;
  return { maxErrPx: +maxE.toFixed(3), meanErrPx: +(sumE / cnt).toFixed(3), maxAngRad: +maxA.toFixed(4), jumps, frames: cnt, delivered: pk.length };
}
"""
fails = []
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page()
        pg.route('**/matter.min.js', lambda r: r.fulfill(path=os.path.join(ROOT, 'test', 'matter-stub.js'), content_type='text/javascript'))
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d' % PORT); pg.wait_for_selector('#nm')
        for name, o, lim in [('jaringan baik (jitter 10 ms, loss 0%)', dict(jitter=10, loss=0), 0.3),
                             ('wifi sekolah (jitter 60 ms, loss 5%)', dict(jitter=60, loss=.05), 1.0),
                             ('wifi buruk (jitter 80 ms, loss 15%)', dict(jitter=80, loss=.15), 3.0)]:
            r = pg.evaluate(JS, o)
            ok = r['maxErrPx'] <= lim and r['jumps'] == 0
            print(('  ✔ ' if ok else '  ✘ ') + name, r)
            if not ok: fails.append(name)
        if errs: print('  ! error halaman:', errs[:2]); fails.append('error JS')
        br.close()
finally:
    srv.terminate()
print('\n' + ('SEMUA LOLOS' if not fails else 'GAGAL: ' + ', '.join(fails))); sys.exit(1 if fails else 0)
