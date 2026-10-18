/* Angry Birds Math Online: aturan bersama (dipakai SERVER untuk menyaring & menghitung papan skor, dan KLIEN untuk tampilan).
   Fisika permainan berjalan di perangkat tiap pemain; server memegang seed soal, status room, dan papan skor akhir. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';
const TOTAL = 15;            // soal per pemain
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const MAX_SCORE = 200000;    // batas kewajaran (maks. teoretis jauh di bawah ini)
const MAX_MS = 60 * 60 * 1000;

const int = (v, a, b, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : (d === undefined ? a : d); };

/* Statistik langsung (dikirim tiap ±2 detik) -> disaring supaya aman disimpan & ditampilkan. */
function cleanLive(s) {
  s = s || {};
  return {
    score: int(s.score, 0, MAX_SCORE), q: int(s.q, 0, TOTAL), hearts: int(s.hearts, 0, 3, 3), streak: int(s.streak, 0, TOTAL),
    ms: int(s.ms, 0, MAX_MS), ok: int(s.ok, 0, TOTAL), wrong: int(s.wrong, 0, 999), shots: int(s.shots, 0, 9999),
    done: !!s.done, win: !!s.win
  };
}
/* Hasil akhir satu pemain (objek `results[0]` dari game). */
function cleanFinal(r, name) {
  r = r || {};
  return {
    name: name, score: int(r.score, 0, MAX_SCORE), win: !!r.win, ok: int(r.ok, 0, TOTAL), wrong: int(r.wrong, 0, 999),
    shots: int(r.shots, 0, 9999), ms: int(r.ms, 0, MAX_MS), base: int(r.base, 0, MAX_SCORE), bar: int(r.bar, 0, MAX_SCORE),
    att: int(r.att, 0, MAX_SCORE), spd: int(r.spd, 0, MAX_SCORE), cleared: int(r.cleared, 0, 9999)
  };
}
/* Hasil dari statistik terakhir (pemain keluar / terputus / dihentikan Room Master). */
function finalFromLive(live, name) {
  live = cleanLive(live);
  return Object.assign(cleanFinal({ score: live.score, win: false, ok: live.ok, wrong: live.wrong, shots: live.shots, ms: live.ms }, name), { forfeit: true });
}
/* Urutan sama seperti papan skor di game: skor tertinggi, lalu tembakan paling sedikit. */
function rank(finals) {
  return finals.slice().sort((a, b) => b.score - a.score || a.shots - b.shots || b.ok - a.ok).map((f, i) => Object.assign({}, f, {
    rank: i + 1,
    avgShots: f.ok ? +(f.shots / f.ok).toFixed(1) : null,
    avgTime: f.ok ? +(f.ms / f.ok / 1000).toFixed(1) : null
  }));
}
return { TOTAL, MAX_PLAYERS, MIN_PLAYERS, MAX_SCORE, MAX_MS, int, cleanLive, cleanFinal, finalFromLive, rank };
});
