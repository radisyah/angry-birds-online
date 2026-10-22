/* Klien online Angry Birds Math — dimuat setelah game utama di index.html.
   Pola sama dengan war-of-kingdom: kode ruangan 5 karakter, token sesi di localStorage, polling /api/room (Vercel + Upstash Redis).
   Fisika berjalan lokal di tiap perangkat; soal, susunan blok & urutan burung sama untuk semua pemain (seed dari server). */
(() => {
'use strict';
const API = '/api/room', SESSION_KEY = 'abm_online_session', NAME_KEY = 'abm_online_name';
const $$ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOTAL_Q = 15;

const style = document.createElement('style');
style.textContent = `
#ol{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0b1433,#2b3c78 60%,#5b3a1c);color:#fff;font:16px system-ui,sans-serif;overflow:auto;-webkit-user-select:none;user-select:none}
#ol.full{align-items:stretch;justify-content:stretch;overflow:hidden}
#ol.hide{display:none}
#ol .card{width:min(92vw,540px);margin:auto;background:#ffffff1a;border:2px solid #ffffff33;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:14px;text-align:center}
#ol .lg{font-size:30px;font-weight:900;line-height:1.1}
#ol .lg small{display:block;font-size:12px;letter-spacing:.25em;color:#ffd54f;margin-top:6px;text-transform:uppercase}
#ol input{font:inherit;padding:12px 14px;border-radius:12px;border:0;background:#fff;color:#2a2118;text-align:center;-webkit-user-select:text;user-select:text;width:100%;box-sizing:border-box}
#ol input.code{text-transform:uppercase;letter-spacing:.3em;font-weight:800}
#ol .b{font:inherit;font-weight:800;border:0;border-radius:12px;padding:12px 18px;color:#fff;background:#d62828;cursor:pointer}
#ol .b:active{filter:brightness(.9)}
#ol .b.gold{background:#c98b1e}#ol .b.gr{background:#2e9e4f}#ol .b.gy{background:#ffffff30}
#ol .b:disabled{opacity:.4;cursor:not-allowed}
#ol .rw{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
#ol .rw>*{flex:1 1 auto}
#ol .er{color:#ff9aa5;min-height:1.2em;font-size:14px}
#ol .sm{font-size:13px;opacity:.8;margin:0;line-height:1.5}
#ol .hr{border:0;border-top:1px solid #ffffff30;margin:2px 0;width:100%}
#ol .codebox{font-size:38px;font-weight:900;letter-spacing:.3em;background:#00000040;border-radius:14px;padding:8px 0 8px .3em;color:#ffd54f;-webkit-user-select:text;user-select:text}
#ol .sl{display:flex;align-items:center;gap:10px;background:#ffffff1c;border-radius:12px;padding:10px 14px;text-align:left}
#ol .sl i{font-style:normal;background:#d62828;border-radius:50%;min-width:30px;height:30px;display:grid;place-items:center;font-weight:800;font-size:13px}
#ol .sl b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ol .sl.me{outline:2px solid #ffd54f}
#ol .sl .rs{font-size:13px;opacity:.9}
#ol .dot{display:inline-block;width:.6em;height:.6em;border-radius:50%;background:#2e9e4f;margin-right:.4em}
#ol .dot.off{background:#888}
#mv{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
#mb{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:8px 14px;background:#0006;font-size:14px;flex-wrap:wrap}
#mg{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:10px;padding:10px;overflow:auto}
.tl{min-height:0;min-width:0;display:flex;flex-direction:column;gap:6px;background:#0009;border-radius:12px;padding:8px 10px;border:2px solid #ffffff30;position:relative}
.tl.fin{border-color:#ffd54f}.tl.off{border-color:#888}
.tl .th{display:flex;justify-content:space-between;gap:8px;font-weight:800;font-size:16px}
.tl .vw{position:relative;flex:1;min-height:0;background:#000;border-radius:8px;overflow:hidden;cursor:zoom-in;display:flex;align-items:center;justify-content:center}
.tl .vw video{width:100%;height:100%;object-fit:contain;background:#000}
.tl .vs{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:10px;font-size:14px;color:#cfd8ff;background:#000a;pointer-events:none}
.tl .vs.ok{display:none}
.tl .fps{position:absolute;right:8px;top:6px;background:#000a;border-radius:8px;padding:2px 9px;font:800 14px ui-monospace,Menlo,monospace;color:#8f8;pointer-events:none}
.tl .fps.mid{color:#ffd54f}.tl .fps.low{color:#ff8a80}.tl .fps.none{color:#aaa}
.tl .sc{position:absolute;left:8px;top:6px;background:#000a;border-radius:8px;padding:2px 10px;font-size:22px;font-weight:900;color:#ffd54f;pointer-events:none}
.tl .pb{height:6px;border-radius:99px;background:#ffffff26;overflow:hidden}.tl .pb>div{height:100%;background:#2e9e4f;transition:width .6s}
.tl .tb{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#cfe;flex-wrap:wrap}
.tl .bd{color:#ffd54f;font-weight:800}
#mg.focus{grid-template-columns:1fr}#mg.focus .tl{display:none}#mg.focus .tl.zm{display:flex}#mg.focus .vw{cursor:zoom-out}
#rk .card{width:min(96vw,720px)}
table.rt{width:100%;border-collapse:collapse;font-size:14px}
.rt th,.rt td{padding:7px 5px;border-bottom:1px solid #ffffff30;text-align:center;white-space:nowrap}
.rt th{color:#7ee8fa;font-size:12px}.rt td.n{text-align:left;font-weight:700}.rt td.s{color:#ffd54f;font-weight:800}
.rt tr.w td{background:#ffd54f22}.rt tr.me td.n{text-decoration:underline}
.tw{overflow:auto}
#olt{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:10000;background:#000d;color:#fff;border-radius:99px;padding:8px 16px;font:14px system-ui,sans-serif;max-width:90vw;display:none}
body.online #pz,body.online #rs,body.online #mn,body.online #om{display:none!important}
@media (max-width:640px){#mg{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

const ol = document.createElement('div'); ol.id = 'ol'; document.body.appendChild(ol);
const tbar = document.createElement('div'); tbar.id = 'olt'; document.body.appendChild(tbar);

/* ---------- state ---------- */
let ON = null;            // { code, token, side }
let V = null;             // tampilan terakhir dari server
let pollTimer = null, statT = 0, failCount = 0, toastTimer = 0, clockOffset = 0;
let playing = false, overSent = false, overBusy = false, shownKey = '', menuForm = { name: '', code: '' }, menuErr = '';

function toast(msg) { tbar.textContent = msg; tbar.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { tbar.style.display = 'none'; }, 4200); }
const getName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
const saveName = n => { try { localStorage.setItem(NAME_KEY, n); } catch (e) { } };
const saveSession = () => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(ON)); } catch (e) { } };
const loadSession = () => { try { const o = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return o && o.code && o.token ? o : null; } catch (e) { return null; } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch (e) { } };
const sfx = () => { try { if (typeof A !== 'undefined' && A.init) A.init(); } catch (e) { } };

async function call(action, extra) {
  const body = Object.assign({ action }, ON ? { code: ON.code, token: ON.token } : {}, extra || {});
  let r, j;
  try {
    r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    j = await r.json();
  } catch (e) { throw Object.assign(new Error('Tidak bisa terhubung ke server. Periksa koneksi internetmu.'), { status: 0 }); }
  if (!j.ok) throw Object.assign(new Error(j.error || 'Terjadi kesalahan.'), { status: r.status });
  return j;
}
function handleErr(e) {
  if (e.status === 401 || e.status === 404) return sessionLost(e.message);
  toast(e.message || 'Terjadi kesalahan.');
}
function sessionLost(msg) {
  stopPolling(); stopStats(); clearSession(); ON = null; V = null;
  if (playing) { location.reload(); return; }
  menuErr = msg || ''; render();
}

/* ---------- polling ---------- */
function stopPolling() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
function pollDelay() {
  if (document.hidden) return 4000;
  if (!V) return 1000;
  if (V.status === 'playing') {
    if (V.side === 'master') return Object.keys(links).length < V.players.filter(p => !p.done && !p.left).length || Object.keys(links).some(k => !links[k].ok) ? 600 : 1500;   // cepat selama video belum tersambung
    return 2000;
  }
  return 1000;
}
function startPolling() {
  stopPolling();
  const loop = async () => {
    if (!ON) return;
    // pemain yang sedang bermain tidak perlu polling: balasan pengiriman statistik memberi tahu bila status berubah
    if (!(playing && V && V.side === 'player' && V.status === 'playing' && !overSent)) await pollOnce();
    if (ON) pollTimer = setTimeout(loop, pollDelay());
  };
  pollTimer = setTimeout(loop, 600);
}
async function pollOnce() {
  if (!ON) return;
  try {
    const qs = { code: ON.code, token: ON.token, v: V ? V.v : 0 };
    if (V && V.side === 'master' && V.status === 'playing') { qs.g = V.gameNo; qs.an = Object.keys(links).map(id => id + ':' + links[id].an).join(','); qs.lc = Object.keys(links).map(id => id + ':' + links[id].n + ':' + links[id].cn).join(','); }
    const r = await fetch(API + '?' + new URLSearchParams(qs), { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) { if (r.status === 404 || r.status === 401) return sessionLost(j.error); throw new Error(j.error); }
    failCount = 0;
    if (j.unchanged) {
      clockOffset = j.serverNow - Date.now();
      if (V && j.online && JSON.stringify(V.__on) !== JSON.stringify(j.online)) { V.__on = j.online; V.players.forEach(p => { p.online = !!j.online[p.id]; }); V.masterOnline = !!j.online.m; render(); }
      return;
    }
    applyView(j.view);
  } catch (e) { if (++failCount === 3) toast('Koneksi tidak stabil… mencoba menyambung kembali'); }
}
function applyView(v) {
  const prev = V; V = v; clockOffset = v.serverNow - Date.now();
  if (v.status === 'abandoned') { const m = v.leftBy === 'master' ? 'Room Master menutup ruangan.' : 'Ruangan ditutup.'; if (!(playing && prev && prev.status === 'finished')) { sessionLost(m); return; } }
  // kembali ke lobi (Main Lagi) setelah bermain: muat ulang agar game bersih
  if (playing && v.status === 'lobby') { location.reload(); return; }
  if (v.side === 'player' && v.status === 'playing' && !playing && v.seed != null) startPlayer(v.seed);
  if (v.status === 'finished') { stopStats(); stopBroadcast(); if (playing) freezeGame(); closeAllLinks(); }
  if (v.side === 'master' && v.status === 'playing' && v.sigs) Object.keys(v.sigs).forEach(id => gotSignal(id, v.sigs[id]));
  render();
}

/* ---------- layar ---------- */
function render() {
  const key = V ? [V.status, V.side, V.gameNo].join('|') : 'menu';
  if (!V) return showMenu();
  if (V.status === 'lobby') return showLobby();
  if (V.status === 'playing') {
    if (V.side === 'master') return showMasterGrid();
    if (!playing) return showWaiting();   // halaman dimuat ulang setelah selesai: tunggu pemain lain
    ol.classList.add('hide');             // layar game tampil
    return;
  }
  if (V.status === 'finished') return showRank();
}

function showMenu() {
  ol.className = ''; shownKey = 'menu';
  if (!menuForm.name) menuForm.name = getName();
  ol.innerHTML = `<div class="card"><div class="lg">🐦 Angry Birds<small>Math Edition · Online</small></div>
  <input id="nm" maxlength="12" placeholder="Nama kamu" value="${esc(menuForm.name)}">
  <div class="rw"><button class="b" id="cp">🎮 Buat Ruangan</button><button class="b gold" id="cm">👑 Jadi Room Master</button></div>
  <hr class="hr">
  <input id="cd" class="code" maxlength="5" placeholder="KODE" value="${esc(menuForm.code)}">
  <button class="b gr" id="jn">Gabung Ruangan</button>
  <div class="er" id="er">${esc(menuErr)}</div>
  <p class="sm">2–4 pemain di perangkat masing-masing mengerjakan <b>soal & susunan blok yang sama</b>. Skor tertinggi menang. Room Master (opsional) memantau skor langsung tanpa ikut bermain.</p></div>`;
  menuErr = '';
  const keep = () => { menuForm.name = $$('nm').value; menuForm.code = $$('cd').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); };
  const nameOk = () => { keep(); if (!menuForm.name.trim()) { $$('er').textContent = 'Isi nama dulu.'; return false; } saveName(menuForm.name.trim()); return true; };
  $$('nm').oninput = $$('cd').oninput = () => { keep(); $$('cd').value = menuForm.code; };
  const create = async role => { if (!nameOk()) return; sfx(); try { const j = await call('create', { name: menuForm.name.trim(), role }); enter(j); } catch (e) { $$('er').textContent = e.message; } };
  $$('cp').onclick = () => create('player');
  $$('cm').onclick = () => create('master');
  $$('jn').onclick = async () => {
    if (!nameOk()) return; if (menuForm.code.length !== 5) { $$('er').textContent = 'Kode ruangan harus 5 karakter.'; return; }
    sfx(); try { const j = await call('join', { code: menuForm.code, name: menuForm.name.trim() }); enter(j); } catch (e) { $$('er').textContent = e.message; }
  };
}
function enter(j) {
  ON = { code: j.code, token: j.token, side: j.side }; saveSession(); V = null; applyView(j.view); startPolling();
  try { history.replaceState(null, '', location.pathname); } catch (e) { }
}

const slotRow = (i, p, me) => p
  ? `<div class="sl${me ? ' me' : ''}"><i>P${i + 1}</i><b>${esc(p.name)}${me ? ' (kamu)' : ''}</b><span class="rs"><span class="dot${p.online ? '' : ' off'}"></span>${p.ready ? '✅ Siap' : '⏳ Belum siap'}</span></div>`
  : `<div class="sl" style="opacity:.5"><i style="background:#ffffff40">P${i + 1}</i><b>Menunggu pemain…</b></div>`;

function showLobby() {
  ol.className = '';
  const v = V, me = v.players.find(p => p.id === v.myId), isM = v.side === 'master';
  const slots = Array.from({ length: v.maxPlayers }, (_, i) => v.players[i]);
  const link = location.origin + location.pathname + '?room=' + v.code;
  const need = v.minPlayers;
  let action;
  if (v.isOwner) action = `<button class="b gr" id="st" ${v.canStart ? '' : 'disabled'}>▶ Mulai Permainan</button><p class="sm">${v.players.length < need ? 'Butuh minimal ' + need + ' pemain.' : (v.canStart ? 'Semua siap!' : 'Menunggu semua pemain siap.')}</p>`;
  else action = `<button class="b ${me && me.ready ? 'gy' : 'gr'}" id="rd">${me && me.ready ? 'Batal siap' : '✔ Saya siap'}</button><p class="sm">Tunggu ${v.hasMaster && !v.masterLeft ? 'Room Master' : 'pemilik ruangan'} menekan Mulai.</p>`;
  if (v.isOwner && !isM && !v.hasMaster) { /* host pemain: otomatis siap */ }
  ol.innerHTML = `<div class="card"><div class="lg">${isM ? '👑 Room Master' : '🎮 Lobi Arena'}<small>${esc(v.myName || '')}</small></div>
  <div class="sm">Kode ruangan</div><div class="codebox" id="cb">${esc(v.code)}</div>
  <div class="rw"><button class="b gy" id="cl">🔗 Salin Tautan</button></div>
  ${slots.map((p, i) => slotRow(i, p, p && p.id === v.myId)).join('')}
  <div class="sm">${v.hasMaster ? '👑 Room Master: ' + esc(v.masterName) + (v.masterLeft ? ' (sudah keluar)' : '') : 'Pemain pertama jadi pemilik ruangan.'}</div>
  ${action}
  <div class="er" id="er"></div>
  <button class="b gy" id="lv">Keluar</button></div>`;
  const rd = $$('rd'); if (rd) rd.onclick = async () => { sfx(); try { applyView((await call('ready', { ready: !(me && me.ready) })).view); } catch (e) { handleErr(e); } };
  const st = $$('st'); if (st) st.onclick = async () => { sfx(); st.disabled = true; try { applyView((await call('start')).view); } catch (e) { handleErr(e); st.disabled = false; } };
  $$('cl').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Tautan disalin'); } catch (e) { prompt('Salin tautan ini:', link); } };
  $$('lv').onclick = leave;
}

async function leave() {
  try { await call('leave'); } catch (e) { }
  stopPolling(); stopStats(); clearSession(); location.reload();
}

function showWaiting() {
  ol.className = '';
  ol.innerHTML = `<div class="card"><div class="lg">⏳ Menunggu pemain lain<small>${V.players.filter(p => p.done).length}/${V.players.length} selesai</small></div>
  ${V.players.map((p, i) => `<div class="sl${p.id === V.myId ? ' me' : ''}"><i>P${i + 1}</i><b>${esc(p.name)}</b><span class="rs">${p.done ? '✅ Selesai' : '🎯 Bermain'}</span></div>`).join('')}
  <button class="b gy" id="lv">Keluar</button></div>`;
  $$('lv').onclick = leave;
}

/* ---------- Room Master: siaran gameplay langsung (WebRTC, video P2P dari canvas tiap pemain) ---------- */
const STUN_ONLY = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }], relay: false };
const VID = { w: 640, h: 360, fps: 24, kbps: 900, jitterMs: 150 };   // siaran DIKUNCI 360p (640×360) 24 fps, resolusi tidak turun otomatis; jitterMs = buffer kecil di Master agar 24 fps stabil
const SCALES = [1];   // resolusi dikunci 360p (tanpa penurunan otomatis)
let adaptLv = 0, adaptT = 0;
const LINK_RETRY_MS = 4500, LINK_MAX_TRIES = 8, LINK_GRACE_MS = 3000;   // tautan yang pernah tersambung & putus: sambung ulang tanpa batas percobaan
let icePromise = null;
/* STUN + TURN dari server (TURN = relay agar video sampai di semua jaringan). Gagal → STUN saja. */
function getIce() {
  if (!icePromise) icePromise = (async () => {
    try {
      const r = await fetch(API + '?' + new URLSearchParams({ action: 'ice', code: ON.code, token: ON.token }), { cache: 'no-store' });
      const j = await r.json();
      if (j.ok && j.iceServers && j.iceServers.length) return { iceServers: j.iceServers, relay: !!j.relay, iceCandidatePoolSize: 2 };
    } catch (e) { }
    icePromise = null;   // coba lagi pada tautan berikutnya
    return STUN_ONLY;
  })();
  return icePromise;
}
let iceRelay = true;
let links = {};          // id -> { pc, n, an (jawaban terakhir yang diproses), t (mulai), ok, stream }
/* Trickle ICE: kandidat dikirim begitu ditemukan (tanpa menunggu semua terkumpul), sebagai daftar kumulatif yang diganti utuh.
   Satu pengiriman berjalan sekaligus agar urutan tidak terbalik; kandidat baru yang muncul saat mengirim ikut dikirim di putaran berikut. */
function makeTrickle(list, send) {
  let t = 0, busy = false, again = false;
  const run = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try { do { again = false; await send(list.slice()); } while (again); }
    catch (e) { if (e.status === 401 || e.status === 404) handleErr(e); }
    busy = false;
  };
  return () => { clearTimeout(t); t = setTimeout(run, 100); };
}
const candStr = c => JSON.stringify(c.toJSON ? c.toJSON() : c);
const MAX_CAND = 40;
/* Tekan latensi sisi penerima (Master): buffer jitter sekecil mungkin */
function lowLatency(recv) {
  // buffer 0 membuat setiap jitter jaringan langsung jadi patah-patah (FPS turun); buffer kecil ±150 ms menjaga 24 fps tetap rata
  try { if ('jitterBufferTarget' in recv) recv.jitterBufferTarget = VID.jitterMs; } catch (e) { }
  try { if ('playoutDelayHint' in recv) recv.playoutDelayHint = VID.jitterMs / 1000; } catch (e) { }
}
function closeLink(id) { const l = links[id]; if (!l) return; try { l.pc.close(); } catch (e) { } delete links[id]; }
function closeAllLinks() { Object.keys(links).forEach(closeLink); clearInterval(fpsT); fpsT = 0; }
async function openLink(id) {
  if (typeof RTCPeerConnection === 'undefined') return;
  const prev = links[id], n = prev ? prev.n + 1 : 1, gNo = V.gameNo;
  if (prev) { try { prev.pc.close(); } catch (e) { } }
  const ice = await getIce(); iceRelay = ice.relay;
  if (!V || V.gameNo !== gNo) return;
  const pc = new RTCPeerConnection(ice), lc = [];
  const l = links[id] = { pc, n, an: prev ? prev.an : 0, t: Date.now(), ok: false, busy: true, everOk: !!(prev && prev.everOk), dropAt: 0,
    tries: prev && !prev.everOk ? prev.tries + 1 : 1, cn: 0, lc, pend: [], rd: false };
  const push = makeTrickle(lc, list => links[id] === l ? call('signal', { kind: 'cand', to: id, n, c: list }) : Promise.resolve());
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.onicecandidate = ev => { if (ev.candidate && lc.length < MAX_CAND) { lc.push(candStr(ev.candidate)); push(); } };
  pc.ontrack = ev => { lowLatency(ev.receiver); const vid = document.querySelector('#vd' + id); if (vid) { vid.srcObject = ev.streams[0] || new MediaStream([ev.track]); vid.play().catch(() => { }); } };
  pc.onconnectionstatechange = () => {
    if (links[id] !== l) return;   // tautan lama yang sudah diganti
    const st = pc.connectionState;
    l.ok = st === 'connected';
    if (l.ok) { l.everOk = true; l.dropAt = 0; }
    else if (st === 'disconnected' && !l.dropAt) l.dropAt = Date.now();
    updateLinkUI(id);
    if ((st === 'failed' || st === 'closed') && V && V.status === 'playing') maintainLinks(V);   // gagal: sambung ulang segera, tanpa menunggu polling
  };
  try {
    await pc.setLocalDescription(await pc.createOffer());   // offer langsung dikirim; kandidat menyusul (trickle)
    if (links[id] !== l || !V || V.gameNo !== gNo) return;
    await call('signal', { kind: 'offer', to: id, n, sdp: pc.localDescription.sdp });
    push();
  } catch (e) { if (e.status === 401 || e.status === 404) handleErr(e); }
  l.busy = false;
}
function flushPend(l) {
  if (!l.rd) return;
  while (l.pend.length) { let c; try { c = JSON.parse(l.pend.shift()); } catch (e) { continue; } l.pc.addIceCandidate(c).catch(() => { }); }
}
/* Jawaban (answer) dan kandidat ICE pemain: e = { a?: {n, sdp}, c?: {n, from, c: [...]} } */
function gotSignal(id, e) {
  const l = links[id]; if (!l || !e) return;
  if (e.a && e.a.n === l.n && l.an !== e.a.n) {
    l.an = e.a.n;
    l.pc.setRemoteDescription({ type: 'answer', sdp: e.a.sdp }).then(() => { l.rd = true; flushPend(l); }).catch(() => { l.an = 0; });
  }
  if (e.c && e.c.n === l.n && e.c.from === l.cn) { l.cn += e.c.c.length; l.pend.push(...e.c.c); flushPend(l); }
}
/* FPS video yang benar-benar tampil di layar Master (dihitung per frame lewat requestVideoFrameCallback; cadangan: getStats) */
let fpsT = 0, fpsN = {}, fpsLast = {};
function startFps(players) {
  clearInterval(fpsT); fpsN = {}; fpsLast = {};
  players.forEach(p => {
    const vid = $$('vd' + p.id); fpsN[p.id] = 0;
    if (vid && vid.requestVideoFrameCallback) { const loop = () => { fpsN[p.id]++; vid.requestVideoFrameCallback(loop); }; vid.requestVideoFrameCallback(loop); }
  });
  fpsT = setInterval(async () => {
    const now = performance.now();
    for (const p of players) {
      const el = $$('fp' + p.id); if (!el) continue;
      const l = links[p.id], vid = $$('vd' + p.id); let fps = null;
      if (l && l.ok) {
        if (vid && vid.requestVideoFrameCallback) { const last = fpsLast[p.id]; if (last) fps = (fpsN[p.id] - last.n) * 1000 / (now - last.t); fpsLast[p.id] = { n: fpsN[p.id], t: now }; }
        else { try { (await l.pc.getStats()).forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'video' && r.framesPerSecond != null) fps = r.framesPerSecond; }); } catch (e) { } }
      } else delete fpsLast[p.id];
      let res = '', tip = '';
      if (l && l.ok) { try { (await l.pc.getStats()).forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'video') {
        if (r.frameHeight) res = ' · ' + r.frameHeight + 'p';
        const pl = r.packetsLost || 0, pr = r.packetsReceived || 0;
        tip = 'Resolusi ' + (r.frameWidth || '?') + '×' + (r.frameHeight || '?') + ' · paket hilang ' + (pl + pr ? (pl * 100 / (pl + pr)).toFixed(1) : 0) + '% · frame dibuang ' + (r.framesDropped || 0) + ' · freeze ' + (r.freezeCount || 0) + ' · jitter ' + Math.round((r.jitter || 0) * 1000) + ' ms';
      } }); } catch (e) { } }
      el.className = 'fps ' + (fps == null ? 'none' : fps >= VID.fps - 3 ? '' : fps >= 15 ? 'mid' : 'low');
      el.textContent = fps == null ? '— FPS' : Math.round(fps) + ' FPS' + res; el.title = tip;
    }
  }, 1000);
}
function updateLinkUI(id) {
  const vs = document.querySelector('#vs' + id), l = links[id]; if (!vs) return;
  const vid = document.querySelector('#vd' + id), ok = (l && l.ok) || (!l && vid && vid.srcObject);   // tanpa tautan tapi ada gambar terakhir: tetap tampil
  vs.className = 'vs' + (ok ? ' ok' : '');
  if (!ok) vs.textContent = !l ? 'Video tidak tersedia' : (l.tries > 2 && !l.everOk ? (iceRelay ? '📡 Video belum tersambung, mencoba lagi… Skor tetap tampil.' : '📡 Video tidak bisa tersambung: server TURN belum diatur (lihat README). Skor tetap tampil.') : (l.everOk ? '📡 Video terputus, menyambung ulang…' : '📡 Menyambungkan video…'));
}
function maintainLinks(v) {
  v.players.forEach(p => {
    const active = !p.done && !p.left && p.online;
    const l = links[p.id];
    if (!active) { if (l && (p.done || p.left)) { closeLink(p.id); updateLinkUI(p.id); } return; }
    if (!l) { openLink(p.id); return; }
    const st = l.pc.connectionState, now = Date.now();
    if (st === 'connected') { l.dropAt = 0; return; }
    const bad = st === 'failed' || st === 'closed' || (st === 'disconnected' && l.dropAt && now - l.dropAt > LINK_GRACE_MS);   // 'disconnected' sering pulih sendiri: beri tenggang
    const stuck = !l.ok && st !== 'disconnected' && now - l.t > Math.min(12000, LINK_RETRY_MS + 2500 * (l.tries - 1));   // makin lama makin sabar (jaringan lambat / relay TURN)
    if (!l.busy && (bad || stuck) && (l.everOk || l.tries < LINK_MAX_TRIES)) openLink(p.id);
  });
}

function showMasterGrid() {
  const v = V;
  if (shownKey !== 'grid' + v.gameNo || !$$('mg')) {
    closeAllLinks();
    ol.className = 'full'; shownKey = 'grid' + v.gameNo; if (window.armFS) window.armFS();
    ol.innerHTML = `<div id="mv"><div id="mb"><b>👑 Room Master · ${esc(v.myName)} · Kode ${esc(v.code)}</b><span id="ms"></span><button class="b" id="sp" style="padding:6px 14px">■ Hentikan permainan</button></div><div id="mg">${v.players.map((p, i) => `<div class="tl" id="tl${p.id}">
      <div class="th"><span>P${i + 1} · ${esc(p.name)}</span><span id="hr${p.id}"></span></div>
      <div class="vw" id="vw${p.id}" title="Klik untuk memperbesar"><video id="vd${p.id}" autoplay muted playsinline></video><div class="vs" id="vs${p.id}">📡 Menyambungkan video…</div><div class="sc" id="sc${p.id}">⭐ 0</div><div class="fps none" id="fp${p.id}">— FPS</div></div>
      <div class="pb"><div id="pg${p.id}" style="width:0"></div></div>
      <div class="tb"><span id="tx${p.id}"></span><span class="bd" id="bd${p.id}"></span></div></div>`).join('')}</div></div>`;
    $$('sp').onclick = async () => { if (!confirm('Hentikan permainan sekarang? Skor saat ini menjadi hasil akhir.')) return; try { applyView((await call('stop')).view); } catch (e) { handleErr(e); } };
    startFps(v.players);
    v.players.forEach(p => { $$('vw' + p.id).onclick = () => { const mg = $$('mg'), t = $$('tl' + p.id), on = !t.classList.contains('zm'); mg.querySelectorAll('.tl').forEach(x => x.classList.remove('zm')); mg.classList.toggle('focus', on); if (on) t.classList.add('zm'); }; });
  }
  const done = v.players.filter(p => p.done).length;
  $$('ms').textContent = done + '/' + v.players.length + ' pemain selesai';
  v.players.forEach((p, i) => {
    const s = p.stats || {}, q = Math.min(TOTAL_Q, s.q || 0);
    let badge = '';
    if (p.left) badge = '🚪 Keluar'; else if (p.done) badge = '✅ Selesai'; else if (!p.online) badge = '🔌 Terputus';
    const t = $$('tl' + p.id); if (!t) return;
    t.className = t.className.replace(/ ?(fin|off)\b/g, '') + (p.done ? ' fin' : '') + (!p.online && !p.done ? ' off' : '');
    $$('hr' + p.id).textContent = '❤️'.repeat(Math.max(0, s.hearts == null ? 3 : s.hearts));
    $$('sc' + p.id).textContent = '⭐ ' + (s.score || 0);
    $$('pg' + p.id).style.width = Math.round(q / TOTAL_Q * 100) + '%';
    $$('tx' + p.id).textContent = 'Soal ' + Math.min(TOTAL_Q, q + (p.done ? 0 : 1)) + '/' + TOTAL_Q + ' · 🔥' + (s.streak || 0) + ' · ✅' + (s.ok || 0);
    $$('bd' + p.id).textContent = badge;
    updateLinkUI(p.id);
  });
  maintainLinks(v);
}

/* ---------- papan skor akhir ---------- */
function showRank() {
  const v = V, r = v.ranking || [];
  const rows = r.map((x, i) => `<tr class="${i ? '' : 'w'}${x.name === v.myName ? ' me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td class="n">${esc(x.name)}${x.win ? '' : (x.forfeit ? ' 🚪' : ' 💔')}</td><td class="s">${x.score}</td><td>${x.ok}/${TOTAL_Q}</td><td>${x.avgShots == null ? '-' : x.avgShots}</td><td>${x.avgTime == null ? '-' : x.avgTime + ' dtk'}</td><td>${x.base}</td><td>${x.bar}</td><td>${x.att}</td><td>${x.spd}</td></tr>`).join('');
  const tie = r[1] && r[1].score === r[0].score;
  ol.className = ''; shownKey = 'rank' + v.gameNo;
  ol.innerHTML = `<div id="rk" style="display:contents"><div class="card" style="width:min(96vw,760px)"><div class="lg">🏆 Papan Skor Akhir</div>
  <div class="tw"><table class="rt"><tr><th>#</th><th>Pemain</th><th>⭐ Skor</th><th>✅ Benar</th><th>Ø Tembakan</th><th>Ø Waktu</th><th>Poin jawab</th><th>🧱 Blok</th><th>🎯 Bonus tembak</th><th>⚡ Bonus cepat</th></tr>${rows}</table></div>
  <div class="sm">${r[0] ? (tie ? '🤝 Seri di puncak: ' + esc(r[0].name) + ' & ' + esc(r[1].name) : '👑 Pemenang: ' + esc(r[0].name) + ' (' + r[0].score + ' poin)') : ''}</div>
  ${v.isOwner ? '<button class="b gr" id="ag">↩ Main lagi (kembali ke lobi)</button>' : '<p class="sm">Menunggu pemilik ruangan untuk main lagi…</p>'}
  <button class="b gy" id="lv">Keluar</button></div></div>`;
  const ag = $$('ag'); if (ag) ag.onclick = async () => { ag.disabled = true; try { applyView((await call('again')).view); } catch (e) { handleErr(e); ag.disabled = false; } };
  $$('lv').onclick = leave;
}

/* ---------- sisi pemain: main & kirim statistik ---------- */
function freezeGame() { try { setP(true); } catch (e) { } }
function startPlayer(seed) {
  if (window.armFS) window.armFS();   // sentuhan pertama di ronde ini masuk layar penuh lagi bila sempat keluar
  if (playing) return;
  playing = true; overSent = false; overBusy = false;
  ol.classList.add('hide');
  document.body.classList.add('online');
  window.openMenu = function () { };            // tanpa menu/pause saat online
  // ---- soal, susunan blok & urutan burung sama untuk semua pemain (seed dari server) ----
  const mb = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  seed = seed | 0; let birdRng = null;
  const oSpawn = spawnRound, oRnd = rndBird, oNew = newRound, oResult = result;
  window.spawnRound = function () {
    const mr = Math.random; Math.random = mb(seed + (qIdx + 1) * 7919);
    try { oSpawn(); } finally { Math.random = mr; }
    birdRng = mb((seed ^ 0x9e3779b9) + (qIdx + 1) * 104729);   // urutan burung tergantung nomor soal
    birds = Array.from({ length: 6 }, rndBird);
  };
  window.rndBird = function () { if (!birdRng) return oRnd(); const k = Object.keys(B); return k[Math.floor(birdRng() * k.length)]; };
  window.newRound = function () { oNew(); if (st === 'ready' || st === 'drag') nextBird(); };
  window.result = function (win) {
    oResult(win);
    const b = $$('ob'); if (b) { b.textContent = 'Menunggu pemain lain…'; b.onclick = null; b.disabled = true; }
    sendOver();
  };
  players = [V.myName]; results = []; pi = 0; started = true;
  beginTurn(); closeMenu();
  sendStats(); statT = setInterval(sendStats, 2000); boostFast(); getIce();
}
const liveStats = () => {
  const r = results[0];
  return { score: r ? r.score : score, q: r ? r.ok : qIdx, hearts, streak, ms: playMs,
    ok: r ? r.ok : PS.ok, wrong: r ? r.wrong : PS.wrong, shots: r ? r.shots : PS.shots, done: !!r, win: r ? r.win : false };
};
async function sendStats() {
  if (!ON || overSent || !playing) return;
  try {
    const j = await call('stats', { stats: liveStats(), sigN: sendN, cN: candN });
    failCount = 0;
    if (j.offer && j.offer.n !== sendN) answerOffer(j.offer);
    if (j.oc) gotMasterCands(j.oc);
    if (V && (j.status !== 'playing' || j.gameNo !== V.gameNo)) pollOnce();
  } catch (e) { if (e.status === 401 || e.status === 404) handleErr(e); }
}
async function sendOver() {
  if (overBusy || overSent || !results[0]) return;
  overBusy = true;
  for (let i = 0; i < 20 && !overSent; i++) {
    try { const j = await call('over', { result: results[0] }); overSent = true; stopStats(); stopBroadcast(); applyView(j.view); }
    catch (e) {
      if (e.status === 409) { overSent = true; stopStats(); stopBroadcast(); pollOnce(); break; }   // permainan sudah dihentikan / selesai
      if (e.status === 401 || e.status === 404) { handleErr(e); break; }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  overBusy = false;
}
function stopStats() { clearInterval(statT); statT = 0; }

/* ---------- sisi pemain: siarkan canvas game ke Room Master (WebRTC, 360p · 24 fps, dikunci) ---------- */
let sendPC = null, sendN = 0, sendBusy = false, feed = null, fastT = 0, fastBudget = 0, candN = 0, remoteRd = false, remotePend = [];
/* Kanvas game 960×540 diperkecil ke 640×360 (360p) dan diambil 24 fps: ringan di HP pemain & tidak membebani Master. */
function makeFeed() {
  if (feed) return feed;
  const src = document.getElementById('c'), cv = document.createElement('canvas'); cv.width = VID.w; cv.height = VID.h;
  const g = cv.getContext('2d', { alpha: false }), period = 1000 / VID.fps; let on = true, timer = 0, next = performance.now();
  // captureStream(0) + requestFrame(): frame hanya dikirim saat kita minta, tepat tiap 33,3 ms (tidak tergantung refresh layar 50/75/144 Hz)
  const manual = typeof CanvasCaptureMediaStreamTrack !== 'undefined' && 'requestFrame' in CanvasCaptureMediaStreamTrack.prototype;
  const stream = cv.captureStream(manual ? 0 : VID.fps), track = stream.getVideoTracks()[0];   // tanpa requestFrame: pakai captureStream(30) biasa
  const grab = () => { if (manual) try { track.requestFrame(); } catch (e) { } };
  const pump = () => {
    if (!on) return;
    const now = performance.now();
    if (now >= next - 1) {
      try { g.drawImage(src, 0, 0, VID.w, VID.h); } catch (e) { }   // bila game lambat, frame terakhir diulang → aliran tetap 24 fps
      grab();
      next += period; if (now - next > period * 3) next = now + period;   // tertinggal jauh: jangan menyusul beruntun
    }
    timer = setTimeout(pump, Math.max(1, next - performance.now()));
  };
  try { g.drawImage(src, 0, 0, VID.w, VID.h); } catch (e) { }
  pump();
  stream.getVideoTracks().forEach(t => { try { t.contentHint = 'motion'; } catch (e) { } });   // 'motion' = maintain-framerate: yang dikorbankan resolusi, bukan FPS
  return feed = { stream, stop() { on = false; clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); } };
}
function tuneSender(pc) {
  pc.getSenders().forEach(sn => { try {
    if (!sn.track) return;
    const pr = sn.getParameters(); pr.encodings = pr.encodings && pr.encodings.length ? pr.encodings : [{}];
    Object.assign(pr.encodings[0], { maxBitrate: VID.kbps * 1000, maxFramerate: VID.fps, scaleResolutionDownBy: SCALES[adaptLv], priority: 'high', networkPriority: 'high' });
    pr.degradationPreference = 'maintain-framerate';   // Firefox/Safari; di Chrome efeknya lewat track.contentHint = 'motion'
    sn.setParameters(pr).catch(() => { });
  } catch (e) { } });
}
/* Pengatur resolusi otomatis (sisi pemain): FPS dikunci 30, yang dikorbankan hanya resolusi.
   Tiap 1 dtk baca statistik pengirim: bila FPS encoder < 27 / paket hilang banyak / bandwidth tak cukup → resolusi turun 1 tingkat;
   naik lagi pelan-pelan (setelah 8 dtk stabil) bila bandwidth cukup. */
function startAdapt(pc) {
  clearInterval(adaptT); let prev = null, good = 0, busy = false;
  adaptT = setInterval(async () => {
    if (busy || sendPC !== pc || pc.connectionState !== 'connected') return; busy = true;
    try {
      let out = null, avail = null, lost = 0;
      (await pc.getStats()).forEach(r => {
        if (r.type === 'outbound-rtp' && r.kind === 'video') out = r;
        else if (r.type === 'candidate-pair' && r.nominated && r.availableOutgoingBitrate) avail = r.availableOutgoingBitrate;
        else if (r.type === 'remote-inbound-rtp' && r.kind === 'video' && r.fractionLost != null) lost = r.fractionLost;
      });
      if (!out) return;
      const cur = { n: out.framesEncoded, t: performance.now() };
      const fps = prev ? (cur.n - prev.n) * 1000 / (cur.t - prev.t) : null; prev = cur;
      if (fps == null) return;
      let want = 0;   // tingkat terkecil yang masih tertopang bandwidth (≥ ±0,09 bit/piksel/frame)
      if (avail) { const bud = Math.min(avail, VID.kbps * 1000) * 0.85; while (want < SCALES.length - 1 && VID.w * VID.h / (SCALES[want] * SCALES[want]) * VID.fps * 0.09 > bud) want++; }
      let lv = adaptLv;
      if (fps < 27 || lost > 0.04) { lv = Math.min(lv + 1, SCALES.length - 1); good = 0; }
      else if (want > lv) { lv = want; good = 0; }
      else if (want < lv && ++good >= 8) { lv--; good = 0; }
      else if (want >= lv) good = 0;
      if (lv !== adaptLv) { adaptLv = lv; prev = null; pc.getSenders().forEach(sn => { try { if (!sn.track) return; const pr = sn.getParameters(); if (!pr.encodings || !pr.encodings.length) return; pr.encodings[0].scaleResolutionDownBy = SCALES[lv]; sn.setParameters(pr).catch(() => { }); } catch (e) { } }); }
    } catch (e) { } finally { busy = false; }
  }, 1000);
}
function stopBroadcast() {
  if (sendPC) { try { sendPC.close(); } catch (e) { } } sendPC = null;
  if (feed) { feed.stop(); feed = null; }
  clearInterval(fastT); fastT = 0; clearInterval(adaptT); adaptT = 0;
}
function flushRemote() {
  if (!sendPC || !remoteRd) return;
  while (remotePend.length) { let c; try { c = JSON.parse(remotePend.shift()); } catch (e) { continue; } sendPC.addIceCandidate(c).catch(() => { }); }
}
/* Kandidat ICE Master (trickle) dari balasan statistik: oc = { n, from, c: [...] } */
function gotMasterCands(oc) {
  if (!oc || oc.n !== sendN || oc.from !== candN) return;
  candN += oc.c.length; remotePend.push(...oc.c); flushRemote();
}
async function answerOffer(offer) {
  if (sendBusy || typeof RTCPeerConnection === 'undefined') return;
  sendBusy = true; sendN = offer.n; candN = 0; remoteRd = false; remotePend = [];
  boostFast();
  try {
    const ice = await getIce();
    if (sendPC) { try { sendPC.close(); } catch (e) { } sendPC = null; }
    const stream = makeFeed().stream, n = offer.n, lc = [];
    const pc = sendPC = new RTCPeerConnection(ice);
    const push = makeTrickle(lc, list => sendPC === pc ? call('signal', { kind: 'cand', n, c: list }) : Promise.resolve());
    pc.onicecandidate = ev => { if (ev.candidate && lc.length < MAX_CAND) { lc.push(candStr(ev.candidate)); push(); } };
    pc.addEventListener('connectionstatechange', () => {
      if (sendPC !== pc) return;
      if (pc.connectionState === 'connected') tuneSender(pc);
      else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) boostFast();   // cepat cek penawaran baru dari Master
    });
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    if (sendPC !== pc) return;
    remoteRd = true; flushRemote();
    tuneSender(pc);
    await pc.setLocalDescription(await pc.createAnswer());
    tuneSender(pc);   // diulang setelah negosiasi: sebelumnya setParameters bisa gagal diam-diam karena encodings belum ada
    if (sendPC !== pc) return;
    await call('signal', { kind: 'answer', n, sdp: pc.localDescription.sdp });   // answer langsung dikirim; kandidat menyusul (trickle)
    push();
  } catch (e) { if (e.status === 401 || e.status === 404) handleErr(e); }
  finally { sendBusy = false; }
}
/* Selama siaran belum tersambung (atau baru putus), pemain mengecek penawaran Master tiap 0,7 dtk (±28 dtk) supaya gambar muncul / pulih cepat.
   Setelah tersambung tidak ada pengecekan tambahan; tanpa Room Master berhenti sendiri sehingga tidak membebani Redis. */
function boostFast() {
  fastBudget = 40;
  if (fastT) return;
  fastT = setInterval(() => {
    if (!playing || overSent) { clearInterval(fastT); fastT = 0; return; }
    if (sendPC && sendPC.connectionState === 'connected') return;
    if (fastBudget-- > 0) sendStats(); else { clearInterval(fastT); fastT = 0; }
  }, 700);
}

/* ---------- awal ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden && ON) pollOnce(); });
(async function init() {
  const q = new URLSearchParams(location.search);
  const roomParam = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const saved = loadSession();
  if (roomParam && !(saved && saved.code === roomParam)) menuForm.code = roomParam;
  if (saved && (!roomParam || roomParam === saved.code)) {
    ON = saved;
    try {
      const r = await fetch(API + '?' + new URLSearchParams({ code: ON.code, token: ON.token, v: 0 }), { cache: 'no-store' });
      const j = await r.json();
      if (j.ok && j.view && j.view.status !== 'abandoned') {
        const v = j.view;
        // permainan sedang berjalan & halaman dimuat ulang di tengah main: skor lokal hilang, jadi pemain dianggap gugur
        if (v.side === 'player' && v.status === 'playing' && !v.players.find(p => p.id === v.myId).done) {
          try { await call('leave'); } catch (e) { }
          clearSession(); ON = null; menuErr = 'Halaman dimuat ulang saat bermain, jadi kamu dianggap keluar dari ronde ini. Gabung lagi di ronde berikutnya.'; render(); return;
        }
        applyView(v); startPolling(); return;
      }
    } catch (e) { /* jatuh ke menu */ }
    clearSession(); ON = null; V = null;
  }
  render();
})();
})();
