'use strict';
const crypto = require('crypto');
const core = require('../public/game-core.js');
const { getStore } = require('../lib/store.js');
const { getIceServers } = require('../lib/ice.js');

const TTL = 6 * 3600;            // room hilang 6 jam setelah aktivitas terakhir
const PRES_TTL = 20;             // detik; tanda hadir di lobi (diperbarui tiap polling)
const STAT_TTL = 3600;           // detik; statistik langsung pemain
const FRESH_MS = 15000;          // statistik lebih baru dari ini = pemain dianggap online saat bermain
const DROP_MS = 45000;           // tanpa statistik selama ini saat bermain = pemain dianggap keluar
const MAX_GAME_MS = 30 * 60 * 1000;   // batas keras satu permainan
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEATS = ['0', '1', '2', '3'];
const SIG_TTL = 900;             // detik; pesan sinyal WebRTC (offer/answer) untuk siaran gameplay
const MAX_SDP = 24000;

const fail = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = n => crypto.randomBytes(n).toString('hex');
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
const roomKey = c => 'room:' + c, presKey = (c, id) => 'pres:' + c + ':' + id, statKey = (c, id) => 'stat:' + c + ':' + id;
const sigKey = (c, g, id, k) => 'sig:' + c + ':' + g + ':' + id + ':' + k;   // k: 'o' (offer Master) / 'a' (answer pemain)
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

/* ---------- logika room ---------- */
/* Pemilik ruangan (yang boleh menekan Mulai/Hentikan/Main Lagi): Room Master bila ada & masih di ruangan, kalau tidak pemain pertama. */
function ownerSeat(room) {
  if (room.master && !room.masterLeft) return 'master';
  const p = room.players.find(x => !x.left);
  return p ? p.id : null;
}
function startGame(room, now) {
  room.status = 'playing'; room.startedAt = now; room.seed = crypto.randomInt(1, 2147483647);
  room.gameNo = (room.gameNo || 0) + 1; room.ranking = null;
  room.players.forEach(p => { p.done = false; p.final = null; p.ready = true; });
}
function finishGame(room) {
  room.ranking = core.rank(room.players.map(p => p.final));
  room.status = 'finished';
}
/* Selesai bila semua pemain sudah done. */
function maybeFinish(room) {
  if (room.status !== 'playing') return false;
  if (room.players.length && room.players.every(p => p.done)) { finishGame(room); return true; }
  return false;
}
function forfeit(room, p, live) {
  if (p.done) return;
  p.done = true; p.final = core.finalFromLive(live, p.name);
}
/* statistik terakhir yang masih milik permainan ini */
const liveOf = (room, raw) => { const s = parse(raw); return s && s.g === room.gameNo ? s : null; };
async function readStats(code, room) {
  const raws = await getStore().cmd(['MGET'].concat(SEATS.map(i => statKey(code, i))));
  const out = {};
  SEATS.forEach((id, i) => { const s = liveOf(room, raws[i]); if (s) out[id] = s; });
  return out;
}
/* Penanganan tenggat "malas": dijalankan lewat polling karena serverless tidak punya proses latar. */
function needsTick(room, stats, now) {
  if (room.status !== 'playing') return false;
  if (now > room.startedAt + MAX_GAME_MS) return true;
  return room.players.some(p => !p.done && now - Math.max(room.startedAt, (stats[p.id] && stats[p.id].t) || 0) > DROP_MS);
}
function tick(room, stats, now) {
  if (!needsTick(room, stats, now)) return false;
  const hard = now > room.startedAt + MAX_GAME_MS;
  room.players.forEach(p => {
    if (p.done) return;
    if (hard || now - Math.max(room.startedAt, (stats[p.id] && stats[p.id].t) || 0) > DROP_MS) { forfeit(room, p, stats[p.id]); p.dropped = true; }
  });
  maybeFinish(room);
  return true;
}

/* pres: { m, '0'..'3' } boolean; stats: { id: live } */
function viewFor(room, seat, now, pres, stats) {
  pres = pres || {}; stats = stats || {};
  const playing = room.status === 'playing';
  const online = id => playing && stats[id] && !room.players.find(p => p.id === id).done ? now - stats[id].t < FRESH_MS : !!pres[id];
  const isMaster = seat === 'master';
  const owner = ownerSeat(room);
  const me = isMaster ? null : room.players.find(p => p.id === seat);
  return {
    code: room.code, v: room.v, serverNow: now, status: room.status, gameNo: room.gameNo || 0,
    side: isMaster ? 'master' : 'player', myId: isMaster ? null : seat, myName: isMaster ? room.master.name : me && me.name,
    hasMaster: !!room.master, masterName: room.master ? room.master.name : null, masterLeft: !!room.masterLeft, masterOnline: !!pres.m,
    isOwner: owner === seat, maxPlayers: core.MAX_PLAYERS, minPlayers: core.MIN_PLAYERS,
    seed: !isMaster && (playing || room.status === 'finished') ? room.seed : null,
    players: room.players.map(p => Object.assign({
      id: p.id, name: p.name, ready: !!p.ready, left: !!p.left, done: !!p.done, dropped: !!p.dropped, online: !!online(p.id)
    }, isMaster && playing && stats[p.id] ? { stats: core.cleanLive(stats[p.id]) } : {})),
    ranking: room.status === 'finished' ? room.ranking : null,
    leftBy: room.leftBy || null,
    canStart: room.status === 'lobby' && room.players.length >= core.MIN_PLAYERS && room.players.every(p => p.ready || (!room.master && p.id === owner))
  };
}

/* ---------- akses data ---------- */
async function withRoom(code, fn) {
  const store = getStore(), lk = 'lock:' + code, id = rid(6);
  let got = false;
  for (let i = 0; i < 60 && !got; i++) {
    got = (await store.cmd(['SET', lk, id, 'NX', 'PX', 4000])) === 'OK';
    if (!got) await sleep(30 + Math.random() * 40);
  }
  if (!got) throw fail(503, 'Server sedang sibuk. Coba lagi.');
  try {
    const raw = await store.cmd(['GET', roomKey(code)]);
    if (!raw) throw fail(404, 'Ruangan tidak ditemukan atau sudah kedaluwarsa.');
    const room = JSON.parse(raw);
    const out = await fn(room);
    room.v++;
    await store.cmd(['SET', roomKey(code), JSON.stringify(room), 'EX', TTL]);
    return out;
  } finally { await store.cmd(['DEL', lk]).catch(() => { }); }
}
function seatOf(room, token) {
  if (!token) throw fail(401, 'Sesi tidak valid.');
  if (room.master && room.master.token === token) return 'master';
  const p = room.players.find(x => x.token === token);
  if (p) return p.id;
  throw fail(401, 'Sesi tidak valid. Gabung ulang ke ruangan.');
}
const playerOf = (room, token) => {
  const seat = seatOf(room, token);
  if (seat === 'master') throw fail(403, 'Room Master tidak ikut bermain.');
  return room.players.find(p => p.id === seat);
};
const requireOwner = (room, token) => {
  const seat = seatOf(room, token);
  if (ownerSeat(room) !== seat) throw fail(403, 'Hanya pemilik ruangan yang bisa melakukan ini.');
  return seat;
};
const normCode = c => { c = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length !== 5) throw fail(400, 'Kode ruangan harus 5 karakter.'); return c; };
const presOf = async (code) => {
  const raws = await getStore().cmd(['MGET'].concat(['m'].concat(SEATS).map(i => presKey(code, i))));
  const o = { m: !!raws[0] }; SEATS.forEach((id, i) => { o[id] = !!raws[i + 1]; }); return o;
};
const allOnline = () => ({ m: true, '0': true, '1': true, '2': true, '3': true });

/* ---------- aksi ---------- */
async function actCreate(b) {
  const name = cleanName(b.name); if (!name) throw fail(400, 'Isi nama terlebih dahulu.');
  const store = getStore(), now = Date.now(), token = rid(12), asMaster = b.role === 'master';
  for (let i = 0; i < 12; i++) {
    let code = ''; for (let k = 0; k < 5; k++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
    const room = {
      code, v: 1, createdAt: now, status: 'lobby', gameNo: 0, seed: null, startedAt: null, ranking: null,
      master: asMaster ? { token, name } : null, masterLeft: false,
      players: asMaster ? [] : [{ id: '0', token, name, ready: true, left: false, done: false, final: null }]
    };
    const ok = await store.cmd(['SET', roomKey(code), JSON.stringify(room), 'NX', 'EX', TTL]);
    if (ok === 'OK') {
      const seat = asMaster ? 'master' : '0';
      return { code, token, side: asMaster ? 'master' : 'player', view: viewFor(room, seat, now, allOnline(), {}) };
    }
  }
  throw fail(503, 'Gagal membuat ruangan. Coba lagi.');
}
async function actJoin(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, room => {
    if (b.token) { // sambung ulang
      try { const seat = seatOf(room, b.token); return { code, token: b.token, side: seat === 'master' ? 'master' : 'player', view: viewFor(room, seat, now, allOnline(), {}) }; } catch (e) { /* lanjut sebagai pemain baru */ }
    }
    if (room.status === 'abandoned') throw fail(409, 'Ruangan ini sudah ditutup.');
    if (room.status !== 'lobby') throw fail(409, 'Permainan sedang berjalan. Tunggu ronde selesai.');
    if (room.players.length >= core.MAX_PLAYERS) throw fail(409, 'Ruangan sudah penuh (' + core.MAX_PLAYERS + ' pemain).');
    const name = cleanName(b.name); if (!name) throw fail(400, 'Isi nama terlebih dahulu.');
    const id = SEATS.find(i => !room.players.some(p => p.id === i));
    const token = rid(12);
    room.players.push({ id, token, name, ready: false, left: false, done: false, final: null });
    return { code, token, side: 'player', view: viewFor(room, id, now, allOnline(), {}) };
  });
}
async function actReady(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, room => {
    const p = playerOf(room, b.token);
    if (room.status !== 'lobby') throw fail(409, 'Permainan sudah dimulai.');
    p.ready = !!b.ready;
    return { view: viewFor(room, p.id, now, allOnline(), {}) };
  });
}
async function actStart(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, room => {
    const seat = requireOwner(room, b.token);
    if (room.status !== 'lobby') throw fail(409, 'Permainan tidak bisa dimulai sekarang.');
    if (room.players.length < core.MIN_PLAYERS) throw fail(400, 'Butuh minimal ' + core.MIN_PLAYERS + ' pemain.');
    if (!room.master) { const o = room.players.find(p => p.id === seat); if (o) o.ready = true; }
    if (!room.players.every(p => p.ready)) throw fail(400, 'Semua pemain harus siap.');
    startGame(room, now);
    return { view: viewFor(room, seat, now, allOnline(), {}) };
  });
}
async function actStop(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, async room => {
    const seat = requireOwner(room, b.token);
    if (room.status !== 'playing') throw fail(409, 'Tidak ada permainan yang berjalan.');
    const stats = await readStats(code, room);
    room.players.forEach(p => { if (!p.done) { forfeit(room, p, stats[p.id]); p.stopped = true; } });
    maybeFinish(room);
    return { view: viewFor(room, seat, now, allOnline(), stats) };
  });
}
async function actAgain(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, room => {
    const seat = requireOwner(room, b.token);
    if (room.status !== 'finished') throw fail(409, 'Permainan belum selesai.');
    room.players = room.players.filter(p => !p.left);
    room.players.forEach(p => { p.ready = false; p.done = false; p.final = null; p.dropped = false; p.stopped = false; });
    const o = room.players.find(p => p.id === seat); if (o && !room.master) o.ready = true;
    room.status = 'lobby'; room.ranking = null; room.seed = null; room.leftBy = null;
    return { view: viewFor(room, seat, now, allOnline(), {}) };
  });
}
async function actLeave(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, async room => {
    const seat = seatOf(room, b.token);
    if (seat === 'master') {
      if (room.status === 'lobby' || !room.players.length) { room.status = 'abandoned'; room.leftBy = 'master'; }
      else room.masterLeft = true;          // permainan/hasil tetap berjalan; pemain pertama jadi pemilik
    } else {
      const p = room.players.find(x => x.id === seat);
      if (room.status === 'lobby') {
        room.players = room.players.filter(x => x !== p);
        if (!room.players.length && !room.master) { room.status = 'abandoned'; room.leftBy = 'player'; }
      } else if (room.status === 'playing') {
        const stats = await readStats(code, room);
        p.left = true; forfeit(room, p, stats[p.id]); maybeFinish(room);
      } else p.left = true;
      if (room.status !== 'abandoned' && room.players.every(x => x.left) && (!room.master || room.masterLeft)) { room.status = 'abandoned'; }
    }
    return { view: viewFor(room, seat, now, {}, {}) };
  });
}
/* Statistik langsung: tanpa kunci (1 GET + 1 SET). Balasan memberi tahu klien bila status room berubah. */
async function actStats(b) {
  const code = normCode(b.code), now = Date.now(), store = getStore();
  const room = parse(await store.cmd(['GET', roomKey(code)]));
  if (!room) throw fail(404, 'Ruangan tidak ditemukan atau sudah kedaluwarsa.');
  const p = playerOf(room, b.token);
  const out = { status: room.status, gameNo: room.gameNo, v: room.v, serverNow: now };
  if (room.status === 'playing' && !p.done && !p.left) {
    const live = Object.assign(core.cleanLive(b.stats), { t: now, g: room.gameNo });
    const r = await store.pipeline([
      ['SET', statKey(code, p.id), JSON.stringify(live), 'EX', STAT_TTL],
      ['GET', sigKey(code, room.gameNo, p.id, 'o')]
    ]);
    const offer = parse(r[1]);   // penawaran siaran dari Room Master (dikirim hanya bila belum dikenal pemain)
    if (offer && offer.n !== int0(b.sigN)) out.offer = offer;
  }
  return out;
}
/* Sinyal WebRTC untuk siaran gameplay ke Room Master. Master -> pemain: offer; pemain -> Master: answer. Data gameplay (DataChannel) lewat P2P, bukan server. */
async function actSignal(b) {
  const code = normCode(b.code), store = getStore();
  const room = parse(await store.cmd(['GET', roomKey(code)]));
  if (!room) throw fail(404, 'Ruangan tidak ditemukan atau sudah kedaluwarsa.');
  const seat = seatOf(room, b.token);
  if (room.status !== 'playing') throw fail(409, 'Permainan tidak sedang berjalan.');
  const sdp = String(b.sdp || ''), n = int0(b.n);
  if (!sdp || sdp.length > MAX_SDP) throw fail(400, 'SDP tidak valid.');
  let id, kind;
  if (b.kind === 'offer') {
    if (seat !== 'master') throw fail(403, 'Hanya Room Master yang mengirim penawaran.');
    id = String(b.to); if (!room.players.some(p => p.id === id && !p.done && !p.left)) throw fail(404, 'Pemain tidak ditemukan.');
    kind = 'o';
  } else if (b.kind === 'answer') {
    if (seat === 'master') throw fail(403, 'Room Master tidak menjawab.');
    id = seat; kind = 'a';
  } else throw fail(400, 'Jenis sinyal tidak dikenal.');
  await store.cmd(['SET', sigKey(code, room.gameNo, id, kind), JSON.stringify({ n, sdp }), 'EX', SIG_TTL]);
  return {};
}
const int0 = v => core.int(v, 0, 1e6, 0);
async function actOver(b) {
  const code = normCode(b.code), now = Date.now();
  return withRoom(code, room => {
    const p = playerOf(room, b.token);
    if (room.status !== 'playing') throw fail(409, 'Permainan tidak sedang berjalan.');
    if (!p.done) { p.done = true; p.final = core.cleanFinal(b.result, p.name); maybeFinish(room); }
    return { view: viewFor(room, p.id, now, allOnline(), {}) };
  });
}
/* Polling: satu round-trip (GET room + tanda hadir + statistik), lalu 1 SET tanda hadir. Menulis room hanya bila ada tenggat lewat. */
async function actState(q) {
  const code = normCode(q.code), token = String(q.token || ''), have = Number(q.v) || 0, now = Date.now(), store = getStore();
  const cmds = [
    ['GET', roomKey(code)],
    ['MGET'].concat(['m'].concat(SEATS).map(i => presKey(code, i))),
    ['MGET'].concat(SEATS.map(i => statKey(code, i)))
  ];
  // Room Master yang sedang memantau juga mengambil jawaban siaran (answer) dari pemain; gameNo dari param `g`
  const gNo = int0(q.g), wantSigs = gNo > 0;
  if (wantSigs) cmds.push(['MGET'].concat(SEATS.map(i => sigKey(code, gNo, i, 'a'))));
  const first = await store.pipeline(cmds);
  if (!first[0]) throw fail(404, 'Ruangan tidak ditemukan atau sudah kedaluwarsa.');
  let room = JSON.parse(first[0]);
  const seat = seatOf(room, token);
  await store.cmd(['SET', presKey(code, seat === 'master' ? 'm' : seat), '1', 'EX', PRES_TTL]);
  const pres = { m: !!first[1][0] }; SEATS.forEach((id, i) => { pres[id] = !!first[1][i + 1]; });
  pres[seat === 'master' ? 'm' : seat] = true;
  let stats = {}; SEATS.forEach((id, i) => { const s = liveOf(room, first[2][i]); if (s) stats[id] = s; });
  if (needsTick(room, stats, now)) {
    await withRoom(code, r => { tick(r, stats, now); });
    room = JSON.parse(await store.cmd(['GET', roomKey(code)]));
  }
  if (room.v === have && !(seat === 'master' && room.status === 'playing')) return { unchanged: true, v: room.v, serverNow: now, online: pres };
  const view = viewFor(room, seat, now, pres, stats);
  if (seat === 'master' && room.status === 'playing' && wantSigs && room.gameNo === gNo) {
    // `an` = "id:n,id:n" jawaban yang sudah diproses Master (tidak dikirim ulang)
    const known = {}; String(q.an || '').split(',').forEach(x => { const [i, n] = x.split(':'); if (i) known[i] = Number(n); });
    const sigs = {}; SEATS.forEach((id, i) => { const a = parse(first[3][i]); if (a && known[id] !== a.n) sigs[id] = a; });
    if (Object.keys(sigs).length) view.sigs = sigs;
  }
  return { view };
}

/* Daftar STUN/TURN untuk WebRTC. Hanya untuk sesi yang sah di ruangan (kredensial TURN tidak dibagikan ke sembarang orang). */
async function actIce(q) {
  const code = normCode(q.code), store = getStore();
  const room = parse(await store.cmd(['GET', roomKey(code)]));
  if (!room) throw fail(404, 'Ruangan tidak ditemukan atau sudah kedaluwarsa.');
  seatOf(room, String(q.token || ''));
  return getIceServers();
}

/* ---------- handler HTTP (Vercel) ---------- */
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { throw fail(400, 'Body tidak valid.'); } }
  return {};
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let out;
    if (req.method === 'GET') out = (req.query && req.query.action === 'ice') ? await actIce(req.query) : await actState(req.query || {});
    else if (req.method === 'POST') {
      const b = readBody(req);
      const acts = { create: actCreate, join: actJoin, ready: actReady, start: actStart, stop: actStop, again: actAgain, leave: actLeave, stats: actStats, over: actOver, signal: actSignal };
      if (!acts[b.action]) throw fail(400, 'Aksi tidak dikenal.');
      out = await acts[b.action](b);
    } else throw fail(405, 'Metode tidak didukung.');
    res.status(200).json(Object.assign({ ok: true }, out));
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ ok: false, error: status >= 500 && !e.status ? 'Terjadi kesalahan di server.' : e.message });
  }
};
module.exports._internal = { needsTick, tick, viewFor };
