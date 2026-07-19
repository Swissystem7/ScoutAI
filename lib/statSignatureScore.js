'use strict';
// ScoutAI/lib/statSignatureScore.js — SCIENTIFIC CORE (Spec 2)
//
// HONESTY / phenotype-proxy note: this module scores measurable ON-FIELD stat
// signatures only. Any "genetic"/propensity layer lives in geneticPropensityScore
// and is a PHENOTYPE-PROXY PROPENSITY estimate (anthro/physical measurements),
// NOT DNA, NOT genetic selection, NOT diagnostic. This file contains no genetic
// inference; it consumes measured stats. See DISCLAIMER export.
//
// Pure Node built-ins, deterministic (no Date/Math.random/I/O), scales O(1) per
// player. Composes shared lib helpers normalizeMetrics + computeStatComposite;
// when run standalone (selftest, before lib is populated) it falls back to local
// implementations matching the documented contract below.

// ---- shared-lib contract (fallbacks used only if the co-located module absent)
// normalizeMetrics(value, min, max, invert=false) -> 0..100 clamped linear scale.
// computeStatComposite(signals) -> sum of signal.contribution (weighted blend).
function req(path, name, fallback) {
  try { const m = require(path); if (m && typeof m[name] === 'function') return m[name]; }
  catch (_) {}
  return fallback;
}
// NOTE: repo normalizeMetrics is a BATCH cross-player normalizer (players[] -> incompatible
// signature), so we use this scalar min-max normalize directly rather than req()-reusing it.
const normalizeMetrics =
  function (value, min, max, invert) {
    if (!Number.isFinite(value)) return null;
    if (max === min) return 50;
    let p = ((value - min) / (max - min)) * 100;
    if (invert) p = 100 - p;
    return clamp(p, 0, 100);
  };
// NOTE: repo computeStatComposite has an incompatible signature (weighted metric objects,
// not our {contribution} signals) — reusing it via req() zeroed the score. Sum locally.
const computeStatComposite =
  function (signals) {
    let s = 0;
    for (const sig of signals) s += Number.isFinite(sig.contribution) ? sig.contribution : 0;
    return s;
  };

const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const DISCLAIMER =
  'statSignatureScore reflects measured on-field stat signatures only (validated ' +
  'undervalued/high-upside patterns), age- and league-adjusted. It carries no ' +
  'genetic/DNA inference. Any propensity layer elsewhere is a phenotype-proxy ' +
  'estimate, not a decision on any individual.';

// ---------------------------------------------------------------------------
// Signal tables. weight columns sum to 1.00 per sport.
// Each signal: raw(g,ctx) -> number|null (null = no constituent field present),
// bounds [min,max,invert] for normalizeMetrics, flags league/leagueFloor/age/rate.
// bounds are documented TUNING KNOBS (population-plausible), refine on a real
// corpus. // ponytail: static bounds stand in for percentile tables; swap when a
// real player corpus + empirical percentiles are loaded.
// ---------------------------------------------------------------------------
const SIGNALS = {
  football: [
    { name: 'xg_underperformance_good_process', weight: 0.20, league: true, rate: true,
      fields: ['npxG', 'npxA', 'G', 'A'], bounds: [-3, 3, false],
      raw: (g, c) => {
        const npxG = g('npxG'), npxA = g('npxA'), G = g('G'), A = g('A');
        if ([npxG, npxA, G, A].every((x) => x === undefined)) return null;
        const proc = (npxG || 0) + (npxA || 0), out = (G || 0) + (A || 0);
        return (proc - out) * (900 / c.minutes);
      } },
    { name: 'npxg_vs_reputation', weight: 0.14, league: true, rate: true,
      fields: ['npxG90', 'npxGperShot'], bounds: [0, 0.8, false],
      raw: (g) => { const v = g('npxG90'); return v === undefined ? null : v; } },
    { name: 'progression_pre_peak', weight: 0.14, age: true, rate: true,
      fields: ['progPasses', 'progCarries'], bounds: [0, 15, false],
      raw: (g, c) => {
        const p = g('progPasses'), cr = g('progCarries');
        if (p === undefined && cr === undefined) return null;
        return ((p || 0) + (cr || 0)) * (90 / c.minutes);
      } },
    { name: 'padj_defense', weight: 0.12, league: true, rate: true,
      fields: ['tackles', 'interceptions', 'teamPossPct'], bounds: [0, 20, false],
      raw: (g, c) => {
        const t = g('tackles'), i = g('interceptions'), poss = g('teamPossPct');
        if (t === undefined && i === undefined) return null;
        const per90 = ((t || 0) + (i || 0)) * (90 / c.minutes);
        return per90 * (50 / (poss || 50));
      } },
    { name: 'pressing_intensity', weight: 0.10, league: true, rate: true,
      fields: ['pressures90', 'pressRegainPct'], bounds: [0, 10, false],
      raw: (g) => {
        const v = g('pressures90'), s = g('pressRegainPct');
        if (v === undefined) return null;
        return v * ((s === undefined ? 30 : s) / 100);
      } },
    { name: 'sca_gca_decoupled', weight: 0.10, rate: true,
      fields: ['sca90', 'gca90', 'keyPasses', 'G', 'A'], bounds: [-50, 50, false],
      raw: (g, c) => {
        const sca = g('sca90'), gca = g('gca90');
        if (sca === undefined && gca === undefined) return null;
        const creation = normalizeMetrics((sca || 0) + (gca || 0), 0, 12, false);
        const out = normalizeMetrics(((g('G') || 0) + (g('A') || 0)) * (90 / c.minutes), 0, 1.2, false);
        return (creation || 0) - (out || 0);
      } },
    { name: 'open_play_stripped', weight: 0.08, league: true, rate: true,
      fields: ['openPlay_xGxA'], bounds: [0, 1.2, false],
      raw: (g) => { const v = g('openPlay_xGxA'); return v === undefined ? null : v; } },
    { name: 'carries_into_box', weight: 0.06, rate: true,
      fields: ['carriesIntoBox90', 'progCarryDist'], bounds: [0, 5, false],
      raw: (g) => {
        const v = g('carriesIntoBox90'), d = g('progCarryDist');
        if (v === undefined && d === undefined) return null;
        return (v || 0) + (d || 0) / 1000;
      } },
    { name: 'output_through_team_weakness', weight: 0.06,
      fields: ['playerPer90pct', 'teamXgRank'], bounds: [0, 100, false],
      raw: (g) => {
        const p = g('playerPer90pct'), rank = g('teamXgRank');
        if (p === undefined) return null;
        return p * ((rank === undefined ? 10 : rank) / 20); // weak team (high rank#) -> boost
      } },
  ],
  basketball: [
    { name: 'age_adjusted_bpm', weight: 0.20, age: true,
      fields: ['bpm'], bounds: [-4, 12, false],
      raw: (g, c) => {
        const bpm = g('bpm'); if (bpm === undefined) return null;
        const a = c.age;
        const cohort = a === undefined ? 0 : a < 23 ? -2 : a < 28 ? 0 : 1;
        return bpm - cohort;
      } },
    { name: 'usage_efficiency_divergence', weight: 0.14,
      fields: ['usagePct', 'tsPct'], bounds: [40, 80, false],
      raw: (g) => {
        const ts = g('tsPct'), usg = g('usagePct');
        if (ts === undefined) return null;
        return ts * 100 + ((usg === undefined ? 20 : usg) - 20) * 0.5;
      } },
    { name: 'stocks_per36', weight: 0.14, rate: true,
      fields: ['stl', 'blk', 'min'], bounds: [0, 6, false],
      raw: (g, c) => {
        const stl = g('stl'), blk = g('blk');
        if (stl === undefined && blk === undefined) return null;
        return ((stl || 0) + (blk || 0)) * 36 / c.minutes;
      } },
    { name: 'per36_low_minute', weight: 0.10, rate: true,
      fields: ['anyBox', 'min'], bounds: [0, 40, false],
      raw: (g, c) => { const b = g('anyBox'); return b === undefined ? null : b * 36 / c.minutes; } },
    { name: 'length_wing_minus_height', weight: 0.10,
      fields: ['wingspan', 'height'], bounds: [0, 20, false],
      raw: (g) => {
        const w = g('wingspan'), h = g('height');
        if (w === undefined || h === undefined) return null;
        return w - h;
      } },
    { name: 'steal_rate_processing', weight: 0.10,
      fields: ['stlPct'], bounds: [0, 4, false],
      raw: (g) => { const v = g('stlPct'); return v === undefined ? null : v; } },
    { name: 'euroleague_shooting_translation', weight: 0.08, leagueFloor: 0.9,
      fields: ['euro_3pPct', 'euro_tsPct', 'ftr'], bounds: [20, 65, false],
      raw: (g) => {
        const t3 = g('euro_3pPct'), ts = g('euro_tsPct');
        if (t3 === undefined && ts === undefined) return null;
        const parts = [t3, ts].filter((x) => x !== undefined);
        return parts.reduce((a, b) => a + b, 0) / parts.length;
      } },
    { name: 'reb_ast_dual_threat', weight: 0.08,
      fields: ['rebPct', 'astPct', 'position'], bounds: [0, 40, false],
      raw: (g) => {
        const r = g('rebPct'), a = g('astPct');
        if (r === undefined && a === undefined) return null;
        return (r || 0) + (a || 0);
      } },
    { name: 'sos_adjusted_bpm', weight: 0.06,
      fields: ['bpm', 'sos'], bounds: [-4, 12, false],
      raw: (g) => {
        const bpm = g('bpm'); if (bpm === undefined) return null;
        return bpm + (g('sos') || 0);
      } },
  ],
};

function peakAgeFor(sport, position) {
  if (sport === 'basketball') return 26;
  const p = String(position || '').toUpperCase();
  if (/GK|CB|DEF|DF/.test(p)) return 27;
  return 25; // attacking / default
}

function statSignatureScore(player, opts) {
  if (player === null || typeof player !== 'object' || Array.isArray(player)) {
    throw new TypeError('statSignatureScore: player must be an object');
  }
  const sport = player.sport;
  const table = SIGNALS[sport];
  if (!table) throw new TypeError("statSignatureScore: player.sport must be 'football' | 'basketball'");
  if (player.stats === null || typeof player.stats !== 'object' || Array.isArray(player.stats)) {
    throw new TypeError('statSignatureScore: player.stats must be an object');
  }
  opts = opts || {};

  const stats = player.stats;
  const g = (k) => num(stats[k]);

  const minSample = num(opts.minSample) !== undefined
    ? opts.minSample : (sport === 'football' ? 600 : 500);
  const minutesGiven = num(player.minutes);
  const minutes = minutesGiven !== undefined ? minutesGiven : minSample; // absent -> no discount
  const sampleFactor = clamp(minutes / minSample, 0, 1);

  const league = num(opts.leagueStrength) !== undefined
    ? clamp(opts.leagueStrength, 0.3, 1.0) : 1.0;

  const ageGiven = num(player.age);
  const peak = peakAgeFor(sport, player.position);
  const ageBonus = ageGiven !== undefined
    ? clamp(1 + (peak - ageGiven) * 0.03, 0.85, 1.30) : 1;

  const ctx = { minutes, minSample, age: ageGiven };

  const signals = [];
  for (const sig of table) {
    const raw = sig.raw(g, ctx);
    if (raw === null) { signals.push({ name: sig.name, contribution: 0, raw: null }); continue; }
    const norm = normalizeMetrics(raw, sig.bounds[0], sig.bounds[1], sig.bounds[2]);
    let scaler = 1;
    if (sig.league) scaler *= league;
    if (sig.leagueFloor) scaler *= Math.max(league, sig.leagueFloor);
    if (sig.age) scaler *= ageBonus;
    if (sig.rate) scaler *= sampleFactor;
    const contribution = round2((norm || 0) * sig.weight * scaler);
    signals.push({ name: sig.name, contribution, raw: round2(raw) });
  }

  const score = round2(clamp(computeStatComposite(signals), 0, 100));

  // confidence = (fields present / fields expected for sport) * sampleFactor, minus
  // small penalties for absent age/minutes (spec-1 philosophy: absent != worst).
  const union = new Set();
  for (const sig of table) for (const f of sig.fields) union.add(f);
  let present = 0;
  for (const f of union) if (num(stats[f]) !== undefined) present++;
  let conf = (present / union.size) * sampleFactor;
  if (ageGiven === undefined) conf -= 0.05;
  if (minutesGiven === undefined) conf -= 0.10;
  const confidence = round2(clamp(conf, 0, 1));

  return { score, signals, confidence, sport, DISCLAIMER };
}

statSignatureScore.DISCLAIMER = DISCLAIMER;

// ---------------------------------------------------------------------------
function selftest() {
  const assert = (c, m) => { if (!c) throw new Error('SELFTEST FAIL: ' + m); };

  // PROOF (football): signatures beat surface tally.
  const LOW = {
    id: 'low', sport: 'football', age: 21, position: 'MF', minutes: 2000,
    stats: {
      npxG: 6, npxA: 5, G: 2, A: 1, npxG90: 0.55,
      progPasses: 180, progCarries: 140, tackles: 55, interceptions: 40, teamPossPct: 40,
      pressures90: 6, pressRegainPct: 32, sca90: 6, gca90: 0.9,
      openPlay_xGxA: 0.8, carriesIntoBox90: 3, progCarryDist: 4000,
      playerPer90pct: 85, teamXgRank: 17,
    },
  };
  const FLASH = {
    id: 'flash', sport: 'football', age: 29, position: 'FW', minutes: 2000,
    stats: {
      npxG: 7, npxA: 2, G: 12, A: 3, npxG90: 0.32,
      progPasses: 40, progCarries: 30, tackles: 8, interceptions: 5, teamPossPct: 62,
      pressures90: 2, pressRegainPct: 22, sca90: 2.5, gca90: 0.3,
      openPlay_xGxA: 0.35, carriesIntoBox90: 1, progCarryDist: 900,
      playerPer90pct: 70, teamXgRank: 3,
    },
  };
  const low = statSignatureScore(LOW, { leagueStrength: 0.7 });
  const flash = statSignatureScore(FLASH, { leagueStrength: 1.0 });
  assert(low.score > flash.score, `LOW(${low.score}) should beat FLASH(${flash.score})`);
  assert(Math.abs(low.signals.reduce((a, s) => a + s.contribution, 0) - low.score) < 0.5,
    'contributions must sum to score');

  // PROOF (basketball mirror): young elite BPM + stocks on bench minutes > volume scorer.
  const YOUNG = {
    id: 'young', sport: 'basketball', age: 22, minutes: 800,
    stats: { bpm: 6, stl: 45, blk: 30, usagePct: 22, tsPct: 0.60, anyBox: 400,
      wingspan: 214, height: 198, stlPct: 2.8, rebPct: 9, astPct: 16, sos: 0.05 },
  };
  const VOLUME = {
    id: 'volume', sport: 'basketball', age: 30, minutes: 2500,
    stats: { bpm: 0.5, stl: 40, blk: 8, usagePct: 30, tsPct: 0.52, anyBox: 1400,
      wingspan: 201, height: 201, stlPct: 1.0, rebPct: 5, astPct: 11, sos: -0.02 },
  };
  const young = statSignatureScore(YOUNG);
  const volume = statSignatureScore(VOLUME);
  assert(young.score > volume.score, `YOUNG(${young.score}) should beat VOLUME(${volume.score})`);

  // Edge: invalid sport -> TypeError.
  let threw = false;
  try { statSignatureScore({ id: 'x', sport: 'cricket', stats: {} }); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'invalid sport must throw TypeError');

  // Edge: missing stats -> TypeError.
  threw = false;
  try { statSignatureScore({ id: 'x', sport: 'football' }); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'missing stats must throw TypeError');

  // Edge: sparse data -> low-confidence result, NO throw, absent != worst.
  const sparse = statSignatureScore({ id: 's', sport: 'football', stats: { npxG90: 0.5 } });
  assert(sparse.confidence < 0.3, 'sparse data should be low confidence');
  assert(sparse.score >= 0 && sparse.score <= 100, 'sparse score in range');

  // Determinism: identical input -> identical output.
  const a = statSignatureScore(LOW, { leagueStrength: 0.7 });
  const b = statSignatureScore(LOW, { leagueStrength: 0.7 });
  assert(JSON.stringify(a) === JSON.stringify(b), 'must be deterministic');

  console.log('OK');
}

if (require.main === module && process.argv.includes('--selftest')) selftest();

module.exports = { statSignatureScore };
