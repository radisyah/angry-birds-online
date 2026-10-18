'use strict';
/* Tes integrasi server: node test/api.test.js  (memori, atau Redis REST bila variabel env diset) */
const assert = require('assert');
const core = require('../public/game-core.js');
const { start } = require('../dev-server.js');
const { getStore } = require('../lib/store.js');

let base, pass = 0;
const api = async (method, body, q) => {
  const r = await fetch(base + '/api/room' + (q ? '?' + new URLSearchParams(q) : ''), { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
  return Object.assign({ http: r.status }, await r.json());
};
const post = (action, o) => api('POST', Object.assign({ action }, o));
const state = (c, t, v) => api('GET', null, { code: c, token: t, v: v || 0 });
const T = async (name, fn) => { try { await fn(); pass++; console.log('  ✔', name); } catch (e) { console.log('  ✘', name, '\n     ', e.message); process.exitCode = 1; } };
const fin = (score, extra) => Object.assign({ score, win: true, ok: 15, wrong: 1, shots: 20, ms: 300000, base: 1, bar: 2, att: 3, spd: 4, cleared: 5 }, extra);

(async () => {
  const srv = await start(0); base = 'http://localhost:' + srv.address().port;
  console.log('Tes API pada', base, '(' + getStore().kind + ')');
  let code, H, P1, P2, M;

  await T('buat room (host = pemain 1), lobi tanpa seed', async () => {
    H = await post('create', { name: 'Ayu' });
    assert(H.ok && H.code.length === 5 && H.side === 'player' && H.view.status === 'lobby' && H.view.isOwner && H.view.seed === null);
    code = H.code; assert.strictEqual(H.view.players.length, 1);
  });
  await T('gabung 2 pemain, kursi terisi, nama dibersihkan', async () => {
    P1 = await post('join', { code, name: '<b>Budi</b>' }); assert(P1.ok && P1.side === 'player' && P1.view.players.length === 2);
    assert.strictEqual(P1.view.players[1].name, 'bBudi/b');
    P2 = await post('join', { code, name: 'Cici' }); assert(P2.ok && P2.view.players.length === 3);
  });
  await T('sambung ulang dengan token yang sama (tidak menambah pemain)', async () => {
    const r = await post('join', { code, token: P1.token, name: 'x' }); assert(r.ok && r.view.players.length === 3 && r.view.myId === '1');
  });
  await T('token salah 401, kode salah 404, kode pendek 400', async () => {
    assert.strictEqual((await state(code, 'salah')).http, 401);
    assert.strictEqual((await state('ZZZZZ', H.token)).http, 404);
    assert.strictEqual((await post('ready', { code: 'AB', token: H.token })).http, 400);
  });
  await T('hanya pemilik yang bisa mulai; harus semua siap', async () => {
    assert.strictEqual((await post('start', { code, token: P1.token })).http, 403);
    const r = await post('start', { code, token: H.token }); assert.strictEqual(r.http, 400);    // Budi & Cici belum siap
    await post('ready', { code, token: P1.token, ready: true });
    await post('ready', { code, token: P2.token, ready: true });
    await post('ready', { code, token: P2.token, ready: false });
    assert.strictEqual((await post('start', { code, token: H.token })).http, 400);
    await post('ready', { code, token: P2.token, ready: true });
  });
  await T('mulai: semua pemain mendapat seed yang sama; gabung baru ditolak', async () => {
    const r = await post('start', { code, token: H.token }); assert(r.ok && r.view.status === 'playing' && Number.isInteger(r.view.seed));
    const a = (await state(code, P1.token)).view, b = (await state(code, P2.token)).view;
    assert.strictEqual(a.seed, r.view.seed); assert.strictEqual(b.seed, r.view.seed);
    assert.strictEqual((await post('join', { code, name: 'Dodi' })).http, 409);
    assert.strictEqual((await post('start', { code, token: H.token })).http, 409);
  });
  await T('statistik langsung disaring, tidak ada di tampilan pemain', async () => {
    const r = await post('stats', { code, token: H.token, stats: { score: 999999999, q: 99, hearts: -4, streak: 'x', ok: 3 } }); assert(r.ok && r.status === 'playing');
    const vp = await state(code, P1.token); assert(!JSON.stringify(vp.view).includes('"stats"'));
  });
  await T('hasil akhir: papan skor urut skor lalu tembakan; belum selesai sebelum semua done', async () => {
    let r = await post('over', { code, token: H.token, result: fin(5000, { shots: 18 }) }); assert(r.ok && r.view.status === 'playing');
    r = await post('over', { code, token: P1.token, result: fin(7000, { shots: 25 }) }); assert(r.view.status === 'playing');
    assert.strictEqual((await post('over', { code, token: H.token, result: fin(1) })).view.status, 'playing');   // kirim ulang diabaikan
    r = await post('over', { code, token: P2.token, result: fin(5000, { shots: 12, win: false, ok: 9 }) });
    assert.strictEqual(r.view.status, 'finished');
    const rk = r.view.ranking; assert.deepStrictEqual(rk.map(x => x.name), ['Budi', 'Cici', 'Ayu'].map(n => n === 'Budi' ? 'bBudi/b' : n));
    assert.strictEqual(rk[0].rank, 1); assert.strictEqual(rk[0].avgShots, +(25 / 15).toFixed(1));
    assert.strictEqual(rk.find(x => x.name === 'Ayu').score, 5000);
  });
  await T('skor tidak masuk akal dibatasi', async () => {
    const R = core.cleanFinal({ score: 1e12, ok: 99, ms: -5 }, 'x'); assert(R.score <= core.MAX_SCORE && R.ok === 15 && R.ms === 0);
  });
  await T('main lagi: hanya pemilik; kembali ke lobi dengan semua belum siap kecuali host', async () => {
    assert.strictEqual((await post('again', { code, token: P1.token })).http, 403);
    const r = await post('again', { code, token: H.token }); assert(r.ok && r.view.status === 'lobby' && r.view.ranking === null);
    assert(r.view.players.every((p, i) => p.ready === (i === 0)));
    await post('ready', { code, token: P1.token, ready: true }); await post('ready', { code, token: P2.token, ready: true });
    const s = await post('start', { code, token: H.token }); assert(s.ok && s.view.gameNo === 2);
  });
  await T('statistik game lama tidak bocor ke game baru; Room Master melihat statistik langsung', async () => {
    // game 2 berjalan; Room Master bergabung ke ruangan lain
    M = await post('create', { name: 'Guru', role: 'master' });
    assert(M.ok && M.side === 'master' && M.view.players.length === 0 && M.view.isOwner);
    const A = await post('join', { code: M.code, name: 'A' }), B = await post('join', { code: M.code, name: 'B' });
    assert.strictEqual((await post('ready', { code: M.code, token: M.token })).http, 403);   // master bukan pemain
    assert.strictEqual((await post('start', { code: M.code, token: A.token })).http, 403);   // pemain bukan pemilik
    assert.strictEqual((await post('start', { code: M.code, token: M.token })).http, 400);   // belum siap
    await post('ready', { code: M.code, token: A.token, ready: true }); await post('ready', { code: M.code, token: B.token, ready: true });
    const st = await post('start', { code: M.code, token: M.token }); assert(st.ok && st.view.seed === null);   // master tidak diberi seed
    await post('stats', { code: M.code, token: A.token, stats: { score: 1234, q: 4, hearts: 2, streak: 3, ok: 3 } });
    const v = await state(M.code, M.token, 0); const pa = v.view.players[0];
    assert(pa.stats && pa.stats.score === 1234 && pa.stats.hearts === 2 && pa.online === true);
    assert.strictEqual(v.view.players[1].stats, undefined);                                   // B belum kirim
    const again = await state(M.code, M.token, v.view.v); assert(again.view && again.view.players[0].stats.score === 1234);   // master tetap dapat statistik walau v sama
    Object.assign(globalThis, { MM: M, AA: A, BB: B });
  });
  await T('Room Master menghentikan permainan: sisa pemain dihitung dari statistik terakhir', async () => {
    const r = await post('stop', { code: MM.code, token: MM.token }); assert(r.ok && r.view.status === 'finished');
    const rk = r.view.ranking; assert.strictEqual(rk[0].name, 'A'); assert.strictEqual(rk[0].score, 1234); assert(rk[0].forfeit && !rk[0].win);
    assert.strictEqual(rk[1].score, 0);
    assert.strictEqual((await post('stop', { code: MM.code, token: MM.token })).http, 409);
  });
  await T('pemain keluar saat bermain: dihitung gugur, sisanya bisa menyelesaikan', async () => {
    const x = await post('create', { name: 'X' }), y = await post('join', { code: x.code, name: 'Y' });
    await post('ready', { code: x.code, token: y.token, ready: true }); await post('start', { code: x.code, token: x.token });
    await post('stats', { code: x.code, token: y.token, stats: { score: 400, ok: 1 } });
    const l = await post('leave', { code: x.code, token: y.token }); assert(l.ok);
    const r = await post('over', { code: x.code, token: x.token, result: fin(900) });
    assert.strictEqual(r.view.status, 'finished'); assert.deepStrictEqual(r.view.ranking.map(z => [z.name, z.score]), [['X', 900], ['Y', 400]]);
    assert.strictEqual((await state(x.code, x.token)).view.players.find(p => p.name === 'Y').left, true);
  });
  await T('terputus: pemain tanpa statistik > batas dianggap gugur lewat polling (tenggat malas)', async () => {
    const x = await post('create', { name: 'X2' }), y = await post('join', { code: x.code, name: 'Y2' });
    await post('ready', { code: x.code, token: y.token, ready: true }); await post('start', { code: x.code, token: x.token });
    await post('stats', { code: x.code, token: y.token, stats: { score: 250, ok: 1 } });
    await post('over', { code: x.code, token: x.token, result: fin(100) });
    // majukan waktu: ubah startedAt & stat.t ke masa lalu langsung di store
    const st = getStore(), rk = 'room:' + x.code; const room = JSON.parse(await st.cmd(['GET', rk]));
    room.startedAt -= 120000; await st.cmd(['SET', rk, JSON.stringify(room)]);
    const sk = 'stat:' + x.code + ':1'; const s = JSON.parse(await st.cmd(['GET', sk])); s.t -= 120000; await st.cmd(['SET', sk, JSON.stringify(s)]);
    const v = await state(x.code, x.token, 0); assert.strictEqual(v.view.status, 'finished');
    const row = v.view.ranking.find(z => z.name === 'Y2'); assert(row.forfeit && row.score === 250);
    assert(v.view.players.find(p => p.name === 'Y2').dropped);
  });
  await T('keluar dari lobi mengosongkan kursi; master keluar di lobi menutup ruangan', async () => {
    const a = await post('create', { name: 'A1' }), b = await post('join', { code: a.code, name: 'B1' });
    await post('leave', { code: a.code, token: b.token });
    assert.strictEqual((await state(a.code, a.token)).view.players.length, 1);
    const m = await post('create', { name: 'M1', role: 'master' }); await post('join', { code: m.code, name: 'P' });
    await post('leave', { code: m.code, token: m.token });
    assert.strictEqual((await state(m.code, m.token)).view.status, 'abandoned');
    assert.strictEqual((await post('join', { code: m.code, name: 'Z' })).http, 409);
  });
  await T('balapan: 4 pemain bergabung serentak, tidak ada kursi ganda', async () => {
    const h = await post('create', { name: 'H' });
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => post('join', { code: h.code, name: 'P' + i })));
    const ok = rs.filter(r => r.ok), full = rs.filter(r => r.http === 409);
    assert.strictEqual(ok.length, 3); assert.strictEqual(full.length, 3);
    assert.strictEqual(new Set(ok.map(r => r.view.myId)).size, 3);
    const v = (await state(h.code, h.token)).view; assert.strictEqual(new Set(v.players.map(p => p.id)).size, 4);
  });
  await T('polling tanpa perubahan membalas kecil (unchanged)', async () => {
    const h = await post('create', { name: 'Q' }); const v = await state(h.code, h.token, 0);
    const u = await state(h.code, h.token, v.view.v); assert(u.unchanged && u.v === v.view.v && u.online);
  });

  console.log('\n' + pass + ' tes lolos'); srv.close();
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
