'use strict';
/* Uji codec snapshot siaran gameplay (public/live.js): bolak-balik, batas ukuran paket, dan anggaran bandwidth. */
const assert = require('assert');
const L = require('../public/live.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✔ ' + name); };

ok('bolak-balik: posisi ±0,07 px, sudut ±1e-4 rad, skalar & partikel utuh', () => {
  const bodies = [[1, L.qPos(100.123), L.qPos(300.5), L.qAng(1.5), 3], [65535, L.qPos(-100), L.qPos(700), L.qAng(-2), 31]];
  const parts = [[0, 100.5, 200.25, 1.2, -3.4, .3, 30, 6, 0, 0xff8800], [1, 500, 300, 0, 0, 0, 22, 0, 90, 0x00ff00], [2, 10, 20, -9, -8, .3, 50, 12, 0, 0x123456]];
  const d = L.decodeSnap(L.encodeSnap({ key: 1, seq: 70000, n: 4000000000, playMs: 98765, st: 3, ax: 150.3, ay: 400.7, shake: 2.5, flash: .35, bodies, parts }));
  assert.strictEqual(d.key, true); assert.strictEqual(d.seq, 70000 & 65535); assert.strictEqual(d.n, 4000000000); assert.strictEqual(d.playMs, 98765); assert.strictEqual(d.st, 3);
  assert(Math.abs(d.ax - 150.3) < .04 && Math.abs(d.ay - 400.7) < .04 && Math.abs(d.shake - 2.5) < .03 && Math.abs(d.flash - .35) < .003);
  assert.strictEqual(d.bodies.length, 2); assert.strictEqual(d.bodies[1][0], 65535); assert.strictEqual(d.bodies[1][4], 31);
  assert(Math.abs(d.bodies[0][1] - 100.123) < .07 && Math.abs(d.bodies[0][2] - 300.5) < .07 && Math.abs(d.bodies[0][3] - 1.5) < 1e-4);
  const wrap = x => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  assert(Math.abs(d.bodies[1][3] - wrap(-2)) < 1e-4);
  assert.strictEqual(d.parts.length, 3); assert.strictEqual(d.parts[1].kind, 1); assert.strictEqual(d.parts[1].R, 90); assert.strictEqual(d.parts[2].rgb, 0x123456);
  assert(Math.abs(d.parts[2].vx + 9) < .06 && Math.abs(d.parts[0].g - .3) < .003);
});
ok('paket rusak/terpotong ditolak (null), bukan melempar error', () => {
  const b = L.encodeSnap({ key: 0, seq: 1, n: 5, playMs: 0, st: 0, ax: 170, ay: 372, shake: 0, flash: 0, bodies: [[1, 1, 1, 1, 0], [2, 2, 2, 2, 0]], parts: [] });
  assert.strictEqual(L.decodeSnap(b.slice(0, 25)), null); assert.strictEqual(L.decodeSnap(new ArrayBuffer(3)), null); assert.strictEqual(L.decodeSnap(null), null);
  const x = new Uint8Array(b.slice(0)); x[0] = 9; assert.strictEqual(L.decodeSnap(x.buffer), null);
});
ok('nilai ekstrem dijepit, tidak meluap', () => {
  const d = L.decodeSnap(L.encodeSnap({ key: 0, seq: 0, n: 1, playMs: 1, st: 1, ax: 99999, ay: -5, shake: 999, flash: 5, bodies: [[1, L.qPos(1e6), L.qPos(-1e6), L.qAng(1e9), 0]], parts: [[0, 1e5, -1e5, 999, -999, 9, 999, 999, 1e9, 0xffffff]] }));
  assert(d && d.bodies.length === 1 && d.parts.length === 1 && d.parts[0].l === 255 && d.parts[0].vx === 12.7);
});
ok('warna: #rgb, #rrggbb, rgb(), tak dikenal → putih', () => {
  assert.strictEqual(L.colorInt('#f80'), 0xff8800); assert.strictEqual(L.colorInt('#5b6270'), 0x5b6270); assert.strictEqual(L.colorInt('rgb(10, 20, 30)'), 0x0a141e);
  assert.strictEqual(L.colorInt('merah'), 0xffffff); assert.strictEqual(L.colorInt(undefined), 0xffffff);
});
ok('anggaran bandwidth: 25 objek bergerak tiap frame < 160 kbps/pemain (+overhead SCTP/DTLS ≈ 50 B/paket)', () => {
  const bodies = Array.from({ length: 25 }, (_, i) => [i + 1, 1, 1, 1, 0]);
  const bytes = L.encodeSnap({ key: 0, seq: 0, n: 1, playMs: 1, st: 0, ax: 1, ay: 1, shake: 0, flash: 0, bodies, parts: [] }).byteLength;
  const kbps = (bytes + 50) * 60 * 8 / 1000; console.log('    25 objek: ' + bytes + ' B/paket → ' + kbps.toFixed(0) + ' kbps (kasus terburuk; video 360p60 ≈ 1200+ kbps)');
  assert(bytes <= 1200 && kbps < 160);
});
console.log('\n' + n + ' tes codec lolos');
