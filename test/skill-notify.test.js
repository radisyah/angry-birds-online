/* Notifikasi skill burung → Room Master + kunci 60 FPS / 720p. Menjalankan public/live.js di vm dengan DOM/game tiruan (tanpa browser). */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../public/live.js', 'utf8');
const ctx2d = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => { }), set: (t, k, v) => { t[k] = v; return true; } });
const mkCanvas = () => ({ width: 960, height: 540, getContext: () => ctx2d() });
let rafCbs = [];
const sandbox = {
  console, performance: { now: () => 0 }, Math, JSON, Map, Set, ArrayBuffer, DataView, Date,
  document: { createElement: () => mkCanvas() },
  requestAnimationFrame: cb => { rafCbs.push(cb); return rafCbs.length; }, cancelAnimationFrame() { },
  B: { chuck: { n: 'Chuck', c: '#ffd54f' }, terence: { n: 'Terence', c: '#8e1b3a' } },
  frame: 123, items: [], flock: [], aim: { x: 0, y: 0 }, shake: 0, flashA: 0, score: 0, hearts: 3, streak: 0, cleared: 0, shots: 0, qIdx: 0, qText: '', ans: 0, wrongQ: 0, lvl: 0, night: false, birds: [], cur: null, playMs: 0,
  step() { }, P() { }, tick() { }, drawHUD() { },
};
sandbox.window = sandbox;
sandbox.skill = function (b) { if (!sandbox.B[b.type] || b.used || b.dead) return; b.used = true; };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const Live = sandbox.Live;

// --- konstanta kunci ---
assert.strictEqual(Live.FPS_LOCK, 60); assert.strictEqual(Live.CARD_W, 1280); assert.strictEqual(Live.CARD_H, 720);

// --- pemain: skill terpakai → 1 event 'sk' di kanal andal ---
const sent = [], chEv = { readyState: 'open', send: m => sent.push(JSON.parse(m)) }, chSt = { readyState: 'open', bufferedAmount: 0, send() { } };
Live.emitter.start(chSt, chEv); sent.length = 0;
const bird = { type: 'chuck', used: false, dead: false, position: { x: 100.123, y: 200.5 } };
sandbox.window.skill(bird);
assert.strictEqual(sent.length, 1); assert.deepStrictEqual({ ...sent[0] }, { t: 'sk', n: 123, ty: 'chuck', x: 100.12, y: 200.5, au: 0 });
sandbox.window.skill(bird); assert.strictEqual(sent.length, 1, 'skill kedua pada burung yang sama tidak dikirim lagi');
sandbox.window.skill({ type: 'terence', used: false, dead: false, position: { x: 1, y: 1 } }); assert.strictEqual(sent.length, 1, 'Terence tanpa skill → tanpa notifikasi');
sandbox.window.skill({ type: undefined, used: false, dead: false, position: { x: 1, y: 1 } }); assert.strictEqual(sent.length, 1, 'burung kecil Blues (tanpa tipe) diabaikan');
sandbox.window.skill({ type: 'chuck', used: false, dead: false, auto: true, position: { x: 1, y: 2 } }); assert.strictEqual(sent[1].au, 1, 'skill otomatis (Bomb) ditandai');
Live.emitter.stop();

// --- Master: event diterapkan saat waktu simulasi mencapai langkah n ---
const cv = mkCanvas(), rep = new Live.Replica(cv), got = [];
rep.onSkill = e => got.push(e);
rep.onEv(JSON.stringify({ t: 'sk', n: 50, ty: 'chuck', x: 1, y: 2, au: 0 }));
rep.stepTo(49); assert.strictEqual(got.length, 0, 'belum jatuh tempo');
rep.stepTo(50); assert.strictEqual(got.length, 1); assert.strictEqual(got[0].ty, 'chuck');

// --- loop Master: 144 Hz tidak menggambar >60×/dtk; 60 Hz tetap tiap frame ---
function run(hz) {
  rafCbs = []; let renders = 0;
  const fake = { render() { renders++; } };
  Live.master.start({ a: fake });
  const dt = 1000 / hz; let t = 1000;
  for (let i = 0; i < hz * 5; i++) { t += dt + (i % 2 ? .3 : -.3); const cbs = rafCbs; rafCbs = []; cbs.forEach(cb => cb(t)); }
  Live.master.stop(); return renders / 5;
}
const f144 = run(144), f60 = run(60), f120 = run(120);
assert(f144 > 57 && f144 <= 61, '144 Hz → ' + f144); assert(f120 > 57 && f120 <= 61, '120 Hz → ' + f120); assert(f60 > 58 && f60 <= 61, '60 Hz → ' + f60);
console.log('  ✔ skill → notifikasi Master; render dikunci ≈ 60/dtk (60 Hz:', f60, '· 120 Hz:', f120, '· 144 Hz:', f144 + ')');
console.log('\ntes notifikasi skill & kunci FPS lolos');
