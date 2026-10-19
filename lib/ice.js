'use strict';
/* Daftar ICE (STUN + TURN) untuk siaran gameplay Room Master.
   STUN saja hanya tembus sebagian jaringan. Agar video bisa sampai ke Master di SEMUA jaringan (4G/CGNAT, wifi sekolah/kantor,
   NAT simetris) harus ada relay TURN. Pilih SALAH SATU penyedia lewat variabel lingkungan (urutan prioritas):
     1. Cloudflare Realtime TURN : CF_TURN_KEY_ID + CF_TURN_API_TOKEN              (gratis 1 TB/bulan)
     2. Metered.ca               : METERED_DOMAIN (mis. app.metered.live) + METERED_API_KEY
     3. coturn sendiri (rahasia bersama) : TURN_URLS (pisah koma) + TURN_SECRET
     4. TURN statis              : TURN_URLS (pisah koma) + TURN_USERNAME + TURN_CREDENTIAL
   Tanpa salah satunya → hanya STUN (relay: false) dan klien memberi tahu bahwa TURN belum diatur. */
const crypto = require('crypto');

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const TTL_S = 86400;              // masa berlaku kredensial TURN
const CACHE_MS = 30 * 60 * 1000;  // kredensial dipakai ulang agar tidak memanggil penyedia tiap permintaan
const FAIL_CACHE_MS = 20 * 1000;
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
let cache = null;

function hasRelay(servers) {
  return servers.some(s => [].concat(s.urls || []).some(u => /^turns?:/i.test(u)));
}

async function fromProvider(env, fetchFn) {
  if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) {
    const r = await fetchFn('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(env.CF_TURN_KEY_ID) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.CF_TURN_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_S })
    });
    if (!r.ok) throw new Error('Cloudflare TURN ' + r.status);
    const j = await r.json();
    // port 53 tidak bisa dipakai browser dan memperlambat pengumpulan kandidat
    return (j.iceServers || []).map(s => Object.assign({}, s, { urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
  }
  if (env.METERED_DOMAIN && env.METERED_API_KEY) {
    const r = await fetchFn('https://' + env.METERED_DOMAIN.replace(/^https?:\/\//, '') + '/api/v1/turn/credentials?apiKey=' + encodeURIComponent(env.METERED_API_KEY));
    if (!r.ok) throw new Error('Metered TURN ' + r.status);
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  }
  const urls = list(env.TURN_URLS);
  if (urls.length && env.TURN_SECRET) {
    const username = (Math.floor(Date.now() / 1000) + TTL_S) + ':abm';
    const credential = crypto.createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    return [{ urls, username, credential }];
  }
  if (urls.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) return [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
  return [];
}

async function getIceServers(env = process.env, fetchFn = globalThis.fetch) {
  if (cache && cache.until > Date.now()) return cache.value;
  let turn = [], ttl = CACHE_MS;
  try { turn = await fromProvider(env, fetchFn); }
  catch (e) { console.error('ICE:', e.message); ttl = FAIL_CACHE_MS; }
  const iceServers = [STUN].concat(turn);
  const value = { iceServers, relay: hasRelay(iceServers) };
  cache = { value, until: Date.now() + ttl };
  return value;
}
function _resetForTests() { cache = null; }
module.exports = { getIceServers, hasRelay, _resetForTests };
