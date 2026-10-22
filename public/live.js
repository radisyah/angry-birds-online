/* Siaran gameplay Room Master berbasis DATA (bukan video).
   Pemain mengirim posisi objek (±100 byte/frame, 60 Hz) lewat WebRTC DataChannel; Room Master menggambar ulang game dengan kode gambar yang sama
   (draw() di index.html) pada resolusi & 60 fps miliknya sendiri. Bandwidth ≈ 0,05–0,15 Mbps per pemain (video 360p60 ≈ 1,2+ Mbps).

   Dua kanal per pemain:
     'st'  tidak andal (ordered:false, maxRetransmits:0): snapshot posisi biner + partikel. Paket hilang tidak ditunggu → tidak patah-patah.
     'ev'  andal (JSON): objek baru/hilang, skor/nyawa/soal (meta), teks melayang. Jarang & kecil.
   Snapshot hanya memuat objek yang bergerak; tiap 1 dtk dikirim snapshot penuh (keyframe) sebagai pengaman bila paket hilang.
   Master mem-buffer ±100 ms dan menginterpolasi antar snapshot, sehingga 60 fps tetap halus walau jaringan bergetar. */
(function (root) {
'use strict';
const STEP = 1000 / 60, TAU = Math.PI * 2, OFF = 1024, SC = 16, HDR = 20, BODY = 9, PART = 15, MAXPKT = 1100;
const STN = ['settle', 'ready', 'drag', 'fly'], STI = { settle: 0, ready: 1, drag: 2, fly: 3 };
const RW = 1280, RH = 720, RS = RW / 960, rawST = typeof CanvasRenderingContext2D !== "undefined" ? CanvasRenderingContext2D.prototype.setTransform : null;   // resolusi kartu gameplay Master = 720p
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const qPos = v => clamp(Math.round((v + OFF) * SC), 0, 65535), dPos = u => u / SC - OFF;
const qAng = a => { a = a % TAU; if (a < 0) a += TAU; return Math.round(a / TAU * 65536) & 65535; }, dAng = u => u / 65536 * TAU;
const wrap = d => { d %= TAU; return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d; };

/* ---------- warna ↔ 24 bit ---------- */
const colCache = new Map();
function colorInt(c) {
  if (typeof c !== 'string') return 0xffffff;
  let v = colCache.get(c); if (v !== undefined) return v;
  let m;
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(c))) { let h = m[1]; if (h.length <= 4) h = h.slice(0, 3).split('').map(x => x + x).join(''); v = parseInt(h.slice(0, 6), 16); }
  else if ((m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c))) v = (clamp(+m[1], 0, 255) << 16) | (clamp(+m[2], 0, 255) << 8) | clamp(+m[3], 0, 255);
  else v = 0xffffff;
  if (colCache.size > 500) colCache.clear();
  colCache.set(c, v); return v;
}
const hexColor = n => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

/* ---------- codec snapshot (paket biner, big-endian) ----------
   header 20 B: type(1)=1 | flags(1: bit0 keyframe) | seq u16 | n u32 (nomor langkah fisika 60 Hz) | playMs u32 | st u8 | aimX u16 (×32) | aimY u16 (×32) | shake u8 (×20) | flash u8 (×255) | nBodies u8
   body 9 B   : id u16 | x u16 | y u16 | sudut u16 | flag u8   (x,y = (v+1024)×16 → resolusi 0,06 px)
   partikel   : nPart u8, lalu 15 B: jenis u8 (0 biasa,1 cincin,2 serpihan) | x u16 | y u16 | vx i8 (×10) | vy i8 (×10) | g u8 (×200) | l u8 | s u8 (×10) | R u16 | rgb 3 B */
function encodeSnap(o) {
  const bs = o.bodies, ps = o.parts, len = HDR + bs.length * BODY + 1 + ps.length * PART;
  const buf = new ArrayBuffer(len), dv = new DataView(buf);
  dv.setUint8(0, 1); dv.setUint8(1, o.key ? 1 : 0); dv.setUint16(2, o.seq & 65535); dv.setUint32(4, o.n >>> 0); dv.setUint32(8, o.playMs >>> 0);
  dv.setUint8(12, o.st & 3); dv.setUint16(13, clamp(Math.round(o.ax * 32), 0, 65535)); dv.setUint16(15, clamp(Math.round(o.ay * 32), 0, 65535));
  dv.setUint8(17, clamp(Math.round(o.shake * 20), 0, 255)); dv.setUint8(18, clamp(Math.round(o.flash * 255), 0, 255)); dv.setUint8(19, bs.length);
  let p = HDR;
  for (const b of bs) { dv.setUint16(p, b[0]); dv.setUint16(p + 2, b[1]); dv.setUint16(p + 4, b[2]); dv.setUint16(p + 6, b[3]); dv.setUint8(p + 8, b[4]); p += BODY; }
  dv.setUint8(p++, ps.length);
  for (const q of ps) {   // q = [jenis,x,y,vx,vy,g,l,s,R,rgb]
    dv.setUint8(p, q[0]); dv.setUint16(p + 1, qPos(q[1])); dv.setUint16(p + 3, qPos(q[2]));
    dv.setInt8(p + 5, clamp(Math.round(q[3] * 10), -127, 127)); dv.setInt8(p + 6, clamp(Math.round(q[4] * 10), -127, 127));
    dv.setUint8(p + 7, clamp(Math.round(q[5] * 200), 0, 255)); dv.setUint8(p + 8, clamp(Math.round(q[6]), 0, 255)); dv.setUint8(p + 9, clamp(Math.round(q[7] * 10), 0, 255));
    dv.setUint16(p + 10, clamp(Math.round(q[8]), 0, 65535)); dv.setUint8(p + 12, q[9] >> 16 & 255); dv.setUint8(p + 13, q[9] >> 8 & 255); dv.setUint8(p + 14, q[9] & 255);
    p += PART;
  }
  return buf;
}
function decodeSnap(buf) {
  if (!buf || buf.byteLength < HDR + 1) return null;
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== 1) return null;
  const nb = dv.getUint8(19);
  if (buf.byteLength < HDR + nb * BODY + 1) return null;
  const o = { key: !!(dv.getUint8(1) & 1), seq: dv.getUint16(2), n: dv.getUint32(4), playMs: dv.getUint32(8), st: dv.getUint8(12) & 3,
    ax: dv.getUint16(13) / 32, ay: dv.getUint16(15) / 32, shake: dv.getUint8(17) / 20, flash: dv.getUint8(18) / 255, bodies: [], parts: [] };
  let p = HDR;
  for (let i = 0; i < nb; i++, p += BODY) o.bodies.push([dv.getUint16(p), dPos(dv.getUint16(p + 2)), dPos(dv.getUint16(p + 4)), dAng(dv.getUint16(p + 6)), dv.getUint8(p + 8)]);
  const np = dv.getUint8(p++);
  if (buf.byteLength < p + np * PART) return null;
  for (let i = 0; i < np; i++, p += PART) o.parts.push({ kind: dv.getUint8(p), x: dPos(dv.getUint16(p + 1)), y: dPos(dv.getUint16(p + 3)), vx: dv.getInt8(p + 5) / 10, vy: dv.getInt8(p + 6) / 10,
    g: dv.getUint8(p + 7) / 200, l: dv.getUint8(p + 8), s: dv.getUint8(p + 9) / 10, R: dv.getUint16(p + 10), rgb: dv.getUint8(p + 12) << 16 | dv.getUint8(p + 13) << 8 | dv.getUint8(p + 14) });
  return o;
}

const api = { encodeSnap, decodeSnap, colorInt, hexColor, qPos, dPos, qAng, dAng, STEP };
if (typeof window === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }

/* =====================================================================================================
   SISI PEMAIN — membaca state game (variabel global index.html) tiap langkah fisika dan mengirimkannya
   ===================================================================================================== */
const r2 = v => Math.round(v * 100) / 100;
const emitter = {
  active: false, hooked: false, chSt: null, chEv: null, known: new Map(), idc: 0, seq: 0, pend: [], txq: [], metaKey: '', scKey: '', forceKey: true, sentBytes: 0,
  install() {
    if (this.hooked) return; this.hooked = true;
    const self = this, oStep = window.step, oP = window.P;
    window.step = function () { oStep.apply(this, arguments); if (self.active) { try { self.onStep(); } catch (e) { console.error('live:', e); } } };
    window.P = function (o) { oP.apply(this, arguments); if (self.active) self.collect(o); };
    // pesan "kehilangan nyawa" (toast 🐤 di layar pemain) ikut dikirim ke Master
    const oLL = window.lifeLost;
    if (typeof oLL === 'function') window.lifeLost = function () {
      const r = oLL.apply(this, arguments);
      if (self.active) { try { const t = document.getElementById('toast'), b = t && t.querySelector('b'), sm = t && t.querySelector('small'); if (b) self.toastQ = { m: b.textContent, s: sm ? sm.textContent : '' }; } catch (e) { } }
      return r;
    };
  },
  start(chSt, chEv) {
    this.install(); this.chSt = chSt; this.chEv = chEv;
    this.known = new Map(); this.pend = []; this.txq = []; this.metaKey = ''; this.scKey = ''; this.forceKey = true;
    this.active = true;
    try { chEv.send(JSON.stringify({ t: 'reset' })); } catch (e) { }   // Master kosongkan dunianya; deskriptor semua objek dikirim ulang di langkah berikutnya
  },
  stop() { this.active = false; this.chSt = this.chEv = null; },
  collect(o) {
    if (o.k === 'txt') { this.txq.push({ x: r2(o.x), y: r2(o.y), vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, l: o.l, c: o.c, tx: o.tx }); return; }
    this.pend.push([o.k === 'ring' ? 1 : o.k === 'dbr' ? 2 : 0, o.x, o.y, o.vx || 0, o.vy || 0, o.g === undefined ? .3 : o.g, o.l, o.s || 0, o.R || 0, colorInt(o.c)]);
    if (this.pend.length > 500) this.pend.splice(0, this.pend.length - 500);
  },
  meta() {
    return { sc: score, h: hearts, sk: streak, cl: cleared, sh: shots, qi: qIdx, q: qText, a: ans, w: wrongQ, lv: lvl, ng: night ? 1 : 0, qs: Math.round(qStart), dn: done ? 1 : 0,
      bq: (birds || []).slice(0, 5), cu: cur && cur.type || null, cr: cur && typeof cur.r === 'number' ? cur.r : 0 };
  },
  newId() { this.idc = (this.idc % 65534) + 1; return this.idc; },
  onStep() {
    const chSt = this.chSt, chEv = this.chEv;
    if (!chSt || chSt.readyState !== 'open' || chEv.readyState !== 'open') return;
    const n = frame, e = {}, cur_ = new Set(), list = [];
    const rm = [], nb = [], nf = [], bu = [];
    for (const b of items) {
      if (b._id === undefined) b._id = this.newId();
      cur_.add(b._id); list.push(b);
      const uk = (b.t || '') + '|' + (b.mat || '') + '|' + (b.dent | 0) + '|' + (b.frozen ? 1 : 0);   // skill es mengubah jenis/bahan blok; benturan menambah retak
      if (!this.known.has(b._id)) { this.known.set(b._id, b); b._uk = uk; nb.push({ i: b._id, x: r2(b.position.x), y: r2(b.position.y), a: r2(b.angle), w: b.w, h: b.h, t: b.t, m: b.mat, s: b.shield ? 1 : 0, u: b.num, d: b.dent | 0, f: b.frozen ? 1 : 0 }); }
      else if (b._uk !== uk) { b._uk = uk; bu.push({ i: b._id, t: b.t, m: b.mat, d: b.dent | 0, f: b.frozen ? 1 : 0 }); }
    }
    for (const b of flock) {
      if (b._id === undefined) b._id = this.newId();
      cur_.add(b._id); list.push(b);
      if (!this.known.has(b._id)) { this.known.set(b._id, b); nf.push({ i: b._id, x: r2(b.position.x), y: r2(b.position.y), a: r2(b.angle), ty: b.type, lb: b.label, rr: b.rr, c: b.col, lk: b.look }); }
    }
    for (const id of this.known.keys()) if (!cur_.has(id)) { rm.push(id); this.known.delete(id); }
    if (rm.length) e.rm = rm; if (nb.length) e.nb = nb; if (nf.length) e.nf = nf; if (bu.length) e.bu = bu;
    const m = this.meta(), mk = JSON.stringify(m); if (mk !== this.metaKey) { this.metaKey = mk; e.m = m; }
    if (this.txq.length) { e.tx = this.txq; this.txq = []; }
    if (this.toastQ) { e.ts = this.toastQ; this.toastQ = null; }
    if (e.rm || e.nb || e.nf || e.bu || e.m || e.tx || e.ts) { e.t = 'e'; e.n = n; try { chEv.send(JSON.stringify(e)); } catch (er) { } }

    // jaringan macet: jangan menumpuk antrean (latensi naik) — buang partikel & kirim ulang snapshot penuh begitu lancar
    if (chSt.bufferedAmount > 32768) { this.forceKey = true; this.pend.length = 0; return; }
    const key = this.forceKey || n % 60 === 0, out = [];
    for (const b of list) {
      const x = qPos(b.position.x), y = qPos(b.position.y), a = qAng(b.angle);
      const fl = b.label === 'blk' ? 0 : (b.used ? 1 : 0) | (b.hitBlk ? 2 : 0) | (b.dead ? 4 : 0) | (b.fadeT ? 8 : 0) | (b.hitT ? 16 : 0);
      if (key || b._qx !== x || b._qy !== y || b._qa !== a || b._qf !== fl) { b._qx = x; b._qy = y; b._qa = a; b._qf = fl; out.push([b._id, x, y, a, fl]); }
    }
    const ax = clamp(Math.round(aim.x * 32), 0, 65535), ay = clamp(Math.round(aim.y * 32), 0, 65535), sk = clamp(Math.round(shake * 20), 0, 255), fq = clamp(Math.round(flashA * 255), 0, 255);
    const sc = (STI[st] || 0) + '|' + ax + '|' + ay + '|' + sk + '|' + fq;
    const scChanged = sc !== this.scKey; this.scKey = sc;
    if (!(out.length || this.pend.length || scChanged || key)) return;
    this.forceKey = false;
    const per = Math.floor((MAXPKT - HDR - 1) / BODY);
    let i = 0;
    do {
      const bs = out.slice(i, i + per); i += per;
      const room = MAXPKT - HDR - 1 - bs.length * BODY, np = Math.max(0, Math.min(this.pend.length, Math.floor(room / PART), 255));
      const buf = encodeSnap({ key, seq: this.seq++, n, playMs, st: STI[st] || 0, ax: ax / 32, ay: ay / 32, shake: sk / 20, flash: fq / 255, bodies: bs, parts: this.pend.splice(0, np) });
      try { chSt.send(buf); this.sentBytes += buf.byteLength; } catch (er) { }
    } while (i < out.length);
  }
};

/* =====================================================================================================
   SISI ROOM MASTER — replika permainan satu pemain, digambar dengan draw() game
   ===================================================================================================== */
class Replica {
  constructor(cv) {
    this.cv = cv; cv.width = RW; cv.height = RH; this.cx = cv.getContext('2d', { alpha: false });
    // 720p: kanvas kartu 1280×720; draw() game bekerja di koordinat 960×540, jadi setTransform-nya dikalikan RW/960 (latar & HUD juga digambar beresolusi tinggi)
    this.cx.imageSmoothingQuality = 'high';
    this.cx.setTransform = function (a, b, c, d, e, f) { return rawST.call(this, a * RS, b * RS, c * RS, d * RS, e * RS, f * RS); };
    this.hud = document.createElement('canvas'); this.hud.width = Math.round(960 * RS); this.hud.height = Math.round(100 * RS); this.hcx = this.hud.getContext('2d');
    this.hidden = false; this.big = false; this.D = 6; this.off = null; this.has = false; this.lastSeq = -1;
    this.stat = { bytes: 0, pk: 0, frames: 0, ms: 0, lost: 0, exp: 0, starve: 0, calm: 0, out: { fps: 0, kbps: 0, hz: 0, loss: 0, delay: 100, ms: 0 } };
    this.m = { sc: 0, h: 3, sk: 0, cl: 0, sh: 0, qi: 0, q: '', a: 0, w: 0, lv: 0, ng: 0, qs: 0, dn: 0, bq: [], cu: null, cr: 0 };
    this.s = { st: 0, ax: 170, ay: 372, shake: 0, flash: 0 }; this.last = { n: 0, playMs: 0 }; this.lastPopN = -1; this.newN = 0; this.fdone = 0; this.hudKey = '';
    this.clearWorld();
  }
  clearWorld() { this.toast = null; this.map = new Map(); this.bodies = []; this.parts = []; this.trail = []; this.buf = []; this.evq = []; this.fdone = 0; }
  addBody(d, n, kind) {
    const old = this.map.get(d.i); if (old) this.bodies.splice(this.bodies.indexOf(old), 1);
    const b = { id: d.i, k: kind, birth: n, die: Infinity, seen: false, hist: [[n, d.x, d.y, d.a]], position: { x: d.x, y: d.y }, angle: d.a };
    if (kind === 0) { b.w = d.w; b.h = d.h; b.t = d.t; b.mat = d.m; b.shield = !!d.s; b.num = d.u; b.dent = d.d || 0; b.frozen = !!d.f; b.label = 'blk'; }
    else { b.type = d.ty; b.label = d.lb; b.rr = d.rr; b.col = d.c; b.look = d.lk; b.free = true; }
    this.map.set(d.i, b); this.bodies.push(b);
  }
  onEv(str) {
    let e; try { e = JSON.parse(str); } catch (er) { return; }
    this.stat.bytes += str.length;
    if (e.t === 'reset') { this.clearWorld(); return; }
    if (e.t !== 'e') return;
    if (e.rm) for (const id of e.rm) { const b = this.map.get(id); if (b) b.die = e.n; }
    if (e.nb) for (const d of e.nb) this.addBody(d, e.n, 0);
    if (e.nf) for (const d of e.nf) this.addBody(d, e.n, 1);
    if (e.bu || e.m || e.tx || e.ts) this.evq.push(e);
  }
  onPacket(buf) {
    const p = decodeSnap(buf); if (!p) return;
    const now = performance.now(), S = this.stat;
    S.bytes += buf.byteLength; S.pk++;
    if (this.lastSeq >= 0) { const gap = (p.seq - this.lastSeq) & 65535; if (gap > 0 && gap < 32768) { if (gap < 200) { S.exp += gap; S.lost += gap - 1; } this.lastSeq = p.seq; } } else this.lastSeq = p.seq;
    const s = now - p.n * STEP;   // selisih jam: diambil nilai terkecil (latensi terendah), naik pelan-pelan bila jaringan melambat permanen
    if (this.off === null || s < this.off) this.off = s; else if (s - this.off > 800) this.off = s; else this.off += (s - this.off) * .002;
    this.has = true; if (p.n > this.newN) this.newN = p.n;
    p.fl = [];
    for (const b of p.bodies) {
      const body = this.map.get(b[0]); if (!body) continue;
      const h = body.hist; let i = h.length; while (i > 0 && h[i - 1][0] > p.n) i--;
      const ent = [p.n, b[1], b[2], b[3]];
      if (i > 0 && h[i - 1][0] === p.n) h[i - 1] = ent; else h.splice(i, 0, ent);
      if (h.length > 30) h.shift();
      if (body.k === 1) p.fl.push([body, b[4]]);
    }
    if (p.n <= this.lastPopN) return;   // paket telat: posisinya sudah dipakai interpolasi; skalar/partikelnya basi, jangan menimpa yang lebih baru
    let i = this.buf.length; while (i > 0 && this.buf[i - 1].n > p.n) i--; this.buf.splice(i, 0, p);
    if (this.buf.length > 200) this.buf.splice(0, this.buf.length - 200);
  }
  simT(now) { return (now - this.off) / STEP - this.D; }
  spawn(o) { this.nspawn = (this.nspawn || 0) + 1; if (o.k === 'txt') this.ntxt = (this.ntxt || 0) + 1; o.L = o.l; if (o.g === undefined) o.g = .3; this.parts.push(o); if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600); }
  applyEv(e) {
    if (e.bu) for (const u of e.bu) { const b = this.map.get(u.i); if (b) { if (u.t !== undefined) b.t = u.t; b.mat = u.m; b.dent = u.d; b.frozen = !!u.f; } }
    if (e.m) Object.assign(this.m, e.m);
    if (e.ts) this.toast = { m: String(e.ts.m || '').slice(0, 120), s: String(e.ts.s || '').slice(0, 60), f: e.n };
    if (e.tx) for (const t of e.tx) this.spawn({ k: 'txt', x: t.x, y: t.y, vx: t.vx, vy: t.vy, g: t.g, l: t.l, c: t.c, tx: t.tx });
  }
  applyPkt(p) {
    this.lastPopN = p.n; const s = this.s; s.st = p.st; s.ax = p.ax; s.ay = p.ay; s.shake = p.shake; s.flash = p.flash; this.last = p;
    for (const [b, fl] of p.fl) { b.used = !!(fl & 1); b.hitBlk = !!(fl & 2); b.dead = !!(fl & 4); if (fl & 8 && !b.fadeT) b.fadeT = p.n; if (fl & 16 && !b.hitT) b.hitT = p.n; }
    for (const q of p.parts) this.spawn({ k: q.kind === 1 ? 'ring' : q.kind === 2 ? 'dbr' : undefined, x: q.x, y: q.y, vx: q.vx, vy: q.vy, g: q.g, l: q.l, s: q.s, R: q.R, c: hexColor(q.rgb) });
  }
  sample(b, T) {
    const h = b.hist, L = h.length; let i = L - 1; while (i > 0 && h[i][0] > T) i--;
    let x, y, a; const e = h[i];
    if (e[0] > T) { x = e[1]; y = e[2]; a = e[3]; }
    else if (i === L - 1) {
      x = e[1]; y = e[2]; a = e[3];
      if (L > 1) { const q = h[i - 1], span = e[0] - q[0], dt = T - e[0]; if (span > 0 && span <= 3 && dt > 0 && dt <= 3) { const k = dt / span; x += (e[1] - q[1]) * k; y += (e[2] - q[2]) * k; a += wrap(e[3] - q[3]) * k; } }   // paket terlambat: tebak ≤ 3 langkah ke depan
    } else { const f = h[i + 1], t = (T - e[0]) / ((f[0] - e[0]) || 1); x = e[1] + (f[1] - e[1]) * t; y = e[2] + (f[2] - e[2]) * t; a = e[3] + wrap(f[3] - e[3]) * t; }
    b.position.x = x; b.position.y = y; b.angle = a;
  }
  stepTo(f) {   // satu langkah logika 60 Hz di sisi Master: terapkan kejadian & snapshot yang jatuh tempo, lalu gerakkan partikel
    while (this.evq.length && this.evq[0].n <= f) this.applyEv(this.evq.shift());
    while (this.buf.length && this.buf[0].n <= f) this.applyPkt(this.buf.shift());
    for (const b of this.bodies) if (!b.seen && b.birth <= f) { b.seen = true; if (b.k === 1 && B[b.type]) this.trail = []; }
    const a = this.parts; let n = 0;
    for (let i = 0; i < a.length; i++) { const p = a[i]; p.x += p.vx; p.y += p.vy; p.vy += p.g; if (--p.l > 0) a[n++] = p; } a.length = n;
    if (f % 3 === 0 && this.s.st === 3) for (const b of this.bodies) if (b.k === 1 && b.type && B[b.type] && b.seen && f < b.die) { this.sample(b, f); this.trail.push([b.position.x, b.position.y]); if (this.trail.length > 200) this.trail.shift(); }
    for (let i = this.bodies.length - 1; i >= 0; i--) { const b = this.bodies[i]; if (b.die <= f - 2) { this.bodies.splice(i, 1); this.map.delete(b.id); } }
  }
  render(now, skipDraw) {
    if (this.off === null) return;
    const T = this.simT(now), Tf = Math.floor(T), S = this.stat;
    if (T > this.newN + 2) S.starve++;
    if (!this.fdone || Tf - this.fdone > 10 || Tf < this.fdone - 30) this.fdone = Tf - 1;   // lompat (tab sempat tertidur / jam bergeser)
    while (this.fdone < Tf) this.stepTo(++this.fdone);
    if (this.hidden || !this.has || skipDraw) return;
    const vItems = [], vFlock = [];
    for (const b of this.bodies) {
      if (b.birth > Tf || Tf >= b.die) continue;
      this.sample(b, T); (b.k === 0 ? vItems : vFlock).push(b);
    }
    const m = this.m, s = this.s;
    const playMsNow = m.dn ? this.last.playMs : this.last.playMs + Math.min(1000, Math.max(0, (T - this.last.n) * STEP));
    const t0 = performance.now();
    const svG = g, svHR = HR, sv = [items, flock, parts, trail, birds, cur, aim, st, shake, flashA, paused, night, wrongQ, ans, frame, SQ, hearts, score, qIdx, qText, lvl, streak, cleared, shots, playMs, qStart];
    master.cur = this;
    try {
      g = this.cx; HR = 1; rawST.call(g, RS, 0, 0, RS, 0, 0);
      items = vItems; flock = vFlock; parts = this.parts; trail = this.trail; birds = m.bq; cur = m.cu ? { type: m.cu, r: m.cr || (B[m.cu] ? B[m.cu].r : 12) } : null;
      aim = { x: s.ax, y: s.ay }; st = STN[s.st]; shake = s.shake; flashA = s.flash; paused = false; night = !!m.ng; wrongQ = m.w; ans = m.a; frame = Tf; SQ = [1, 1];
      hearts = m.h; score = m.sc; qIdx = m.qi; qText = m.q; lvl = m.lv; streak = m.sk; cleared = m.cl; shots = m.sh; playMs = playMsNow; qStart = m.qs;
      draw(1);
      if (this.toast) this.drawToast(Tf);
    } finally {
      rawST.call(this.cx, 1, 0, 0, 1, 0, 0); g = svG; HR = svHR;
      [items, flock, parts, trail, birds, cur, aim, st, shake, flashA, paused, night, wrongQ, ans, frame, SQ, hearts, score, qIdx, qText, lvl, streak, cleared, shots, playMs, qStart] = sv;
      master.cur = null;
    }
    S.frames++; S.ms += performance.now() - t0;
  }
  drawToast(Tf) {   // salinan toast CSS #toast (animasi 3,6 dtk = 216 langkah) digambar di kartu Master
    const T = this.toast, p = (Tf - T.f) / 216;
    if (p < 0) return; if (p >= 1) { this.toast = null; return; }
    const a = p < .08 ? p / .08 : p > .88 ? (1 - p) / .12 : 1, sc = p < .08 ? .8 + .27 * p / .08 : p < .14 ? 1.07 - .07 * (p - .08) / .06 : 1, dy = p < .08 ? -14 * (1 - p / .08) : 0;
    const x = this.cx; x.save(); rawST.call(x, RS, 0, 0, RS, 0, 0); x.globalAlpha = Math.max(0, Math.min(1, a));
    x.font = '700 22px system-ui'; const mw = Math.min(x.measureText(T.m).width, 560);
    x.font = '15px system-ui'; const sw = x.measureText(T.s).width;
    const tw = Math.max(mw, sw), w = tw + 56 + 44, h = 76, cx0 = 480, cy0 = 540 * .24 + h / 2 + dy;
    x.translate(cx0, cy0); x.scale(sc, sc);
    const rr = (X, Y, W, H, R) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, W, H, R); else x.rect(X, Y, W, H); };
    x.fillStyle = 'rgba(0,0,0,.27)'; rr(-w / 2, -h / 2 + 5, w, h, 24); x.fill();
    x.fillStyle = '#fff'; rr(-w / 2, -h / 2, w, h, 24); x.fill(); x.lineWidth = 4; x.strokeStyle = '#ff6b9d'; x.stroke();
    x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = '38px system-ui'; x.fillText('🐤', -w / 2 + 20, 2);
    x.fillStyle = '#2a2118'; x.font = '700 22px system-ui'; x.fillText(T.m, -w / 2 + 20 + 56, -12, 560);
    x.globalAlpha *= .8; x.font = '15px system-ui'; x.fillText(T.s, -w / 2 + 20 + 56, 16);
    x.restore(); rawST.call(x, RS, 0, 0, RS, 0, 0);
  }
  tick() {   // dipanggil tiap 1 dtk: ringkasan statistik untuk label di kartu
    const S = this.stat, o = S.out;
    o.fps = S.frames; o.kbps = Math.round(S.bytes * 8 / 1000); o.hz = S.pk; o.loss = S.exp ? Math.round(S.lost * 1000 / S.exp) / 10 : 0; o.delay = Math.round(this.D * STEP); o.ms = S.frames ? Math.round(S.ms / S.frames * 10) / 10 : 0;
    if (S.starve > 8) { this.D = Math.min(this.D + 2, 20); S.calm = 0; }   // sering kehabisan data → perbesar buffer
    else if (S.starve === 0) { if (++S.calm >= 8 && this.D > 6) { this.D--; S.calm = 0; } }   // lancar 8 dtk → perkecil pelan-pelan
    else S.calm = 0;
    S.frames = 0; S.ms = 0; S.bytes = 0; S.pk = 0; S.starve = 0; if (S.exp > 600) { S.exp = 0; S.lost = 0; }
    return o;
  }
}

/* Penggerak render Master: satu loop rAF untuk semua replika; loop bawaan game dimatikan & drawHUD diganti (cache HUD per pemain) */
const master = {
  reps: null, on: false, raf: 0, cur: null, lite: false, load: 0, fno: 0, oTick: null, oHUD: null, dead: false, swapped: false,
  start(reps) {
    this.stop(); this.reps = reps; this.on = true;
    if (!this.swapped) {
      this.swapped = true; this.dead = false; this.oTick = window.tick; this.oHUD = window.drawHUD;
      window.tick = function () { };
      requestAnimationFrame(() => requestAnimationFrame(() => { master.dead = true; }));
      const oHUD = this.oHUD;
      window.drawHUD = function () {
        const R = master.cur; if (!R) return oHUD();
        const k = (playMs / 1000 | 0) + '|' + score + '|' + hearts + '|' + lvl + '|' + streak + '|' + cleared + '|' + shots + '|' + qText + '|' + qIdx + '|' + night + '|' + (st === 'fly');
        if (R.hudKey !== k) { R.hudKey = k; hudKey = ''; oHUD(); R.hcx.clearRect(0, 0, R.hud.width, R.hud.height); R.hcx.drawImage(hudC, 0, 0, R.hud.width, R.hud.height); }
        else g.drawImage(R.hud, 0, 0, 960, 100);
      };
    }
    const loop = now => {
      if (!this.on) return; this.raf = requestAnimationFrame(loop);
      const t0 = performance.now(); let k = 0; this.fno++;
      for (const id in this.reps) {
        // mode hemat: perangkat Master tidak sanggup menggambar semua kartu tiap frame → kartu bergantian (tiap kartu 30 FPS); logika & interpolasi tetap jalan
        try { this.reps[id].render(now, this.lite && ((this.fno + k++) & 1)); } catch (e) { console.error('live render:', e); }
      }
      this.load = this.load * .9 + (performance.now() - t0) * .1;
      if (this.fno % 30 === 0) { if (!this.lite && this.load > 13) this.lite = true; else if (this.lite && this.load < 4.5) this.lite = false; }
    };
    this.raf = requestAnimationFrame(loop);
  },
  stop() {
    this.on = false; this.lite = false; this.load = 0; cancelAnimationFrame(this.raf); this.reps = null;
    if (this.swapped) {
      this.swapped = false; window.drawHUD = this.oHUD; window.tick = this.oTick;
      if (this.dead) requestAnimationFrame(this.oTick);   // loop game bawaan sudah berhenti → hidupkan lagi (mis. Master lalu ikut main sebagai pemain)
    }
  }
};

root.Live = Object.assign({ emitter, Replica, master }, api);
})(typeof window !== 'undefined' ? window : globalThis);
