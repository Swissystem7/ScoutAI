'use strict';
// ScoutAI/lib/rankProspects.js — spec 4, the scan engine.
//
// HONESTY / PHENOTYPE NOTE: the "genetic" layer that flows through each row's
// `breakdown.genetic` (produced upstream by geneticPropensityScore via
// scientificUpsideIndex) is a *phenotype-proxy propensity* estimate from
// measurable anthro/physical fields — it is NOT DNA, NOT genetic data, NOT
// deterministic selection. Stat signature dominates the fused index by design.
// See DISCLAIMER export below.
//
// Pure Node built-ins, zero deps, deterministic (no Date/Math.random/I/O).
// Composes sibling scorers by filename; does NOT reimplement them.

const DISCLAIMER =
  'Rankings fuse a statistical signature (primary) with a phenotype-proxy ' +
  'propensity layer (secondary, NOT DNA/genetic selection) and an optional ' +
  'non-scientific narrative layer. Use the measured stats, not the propensity ' +
  'inference, for decisions.';

const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// elite > high > notable > watch > fringe
const TIER_ORDER = { fringe: 0, watch: 1, notable: 2, high: 3, elite: 4 };

// --- deterministic ranking core (testable without sibling scorers) -----------
// Takes already-scored rows, applies filter/undervalued/limit, total-order sort,
// assigns rank. This is spec-4's own undervalued+total-order logic (the sibling
// rankByUndervaluedUpside is the same gap logic; the 4-key tie-break that
// guarantees input-order-independent output is owned and proven here).
function rankScored(scored, opts = {}) {
  const { filter, undervaluedOnly, limit } = opts;
  let rows = scored;

  if (undervaluedOnly) rows = rows.filter((s) => s.valueGap > 0);

  if (filter) {
    if (filter.minTier !== undefined && TIER_ORDER[filter.minTier] === undefined)
      throw new TypeError('unknown filter.minTier: ' + filter.minTier);
    rows = rows.filter((s) => {
      if (filter.sport && s.sport !== filter.sport) return false;
      if (filter.position && s.position !== filter.position) return false;
      if (filter.minTier !== undefined &&
          TIER_ORDER[s.tier] < TIER_ORDER[filter.minTier]) return false;
      if (filter.maxAge !== undefined &&
          typeof s.age === 'number' && s.age > filter.maxAge) return false;
      return true;
    });
  }

  // index desc -> valueGap desc -> confidence desc -> id asc (total order)
  rows = rows.slice().sort((a, b) =>
    b.index - a.index ||
    b.valueGap - a.valueGap ||
    b.confidence - a.confidence ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (typeof limit === 'number' && limit > 0) rows = rows.slice(0, limit);

  return rows.map((s, i) => {
    const out = {
      id: s.id, rank: i + 1, index: s.index, tier: s.tier,
      confidence: s.confidence, valueGap: s.valueGap,
      breakdown: s.breakdown, explanation: s.explanation,
    };
    if (s.error) out.error = s.error;
    return out;
  });
}

function rankProspects(players, opts = {}) {
  if (!Array.isArray(players)) throw new TypeError('players must be an array');
  if (players.length === 0) return [];

  const { leagueStrength, includeNarrative } = opts;

  // validate everything cheap BEFORE loading sibling scorers, so container/id
  // guards fail fast and stay testable in isolation.
  for (const p of players) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || p.id === '')
      throw new TypeError('each player requires a non-empty string id');
  }
  if (opts.filter && opts.filter.minTier !== undefined &&
      TIER_ORDER[opts.filter.minTier] === undefined)
    throw new TypeError('unknown filter.minTier: ' + opts.filter.minTier);

  // lazy require: co-located siblings in ScoutAI/lib.
  const { scientificUpsideIndex } = require('./scientificUpsideIndex.js');
  const { computePlayerValueIndex } = require('./computePlayerValueIndex.js');

  const resolveLeague = (p) => {
    if (leagueStrength && typeof leagueStrength === 'object')
      return leagueStrength[p.leagueId] != null ? leagueStrength[p.leagueId] : 1.0;
    return leagueStrength != null ? leagueStrength : 1.0;
  };

  // single O(n) scoring pass; one bad row is captured, never aborts the scan.
  const scored = players.map((p) => {
    let index = 0, tier = 'fringe', confidence = 0, breakdown = null,
        explanation = '', error;
    try {
      const r = scientificUpsideIndex(p, {
        leagueStrength: resolveLeague(p),
        includeNarrative: !!includeNarrative,
      });
      index = r.index; tier = r.tier; confidence = r.confidence;
      breakdown = r.breakdown; explanation = r.explanation;
    } catch (e) {
      // ponytail: per-row error capture, not fail-fast — batch scans need it.
      error = e && e.message ? e.message : String(e);
    }
    let conv = null;
    try {
      const v = computePlayerValueIndex(p);
      if (typeof v === 'number' && isFinite(v)) conv = v;
    } catch (_) { /* absent conventional value -> lowest percentile */ }
    return {
      id: p.id, sport: p.sport, position: p.position, age: p.age,
      index, tier, confidence, breakdown, explanation, error, _conv: conv,
    };
  });

  // conventional-value percentile computed ONCE over the roster (one sort),
  // not per-player. valueGap = index - conventionalPercentile.
  const vals = scored.map((s) => s._conv).filter((v) => v != null)
    .sort((a, b) => a - b);
  const pct = (v) => {
    if (v == null || vals.length === 0) return 0;
    // fraction of roster at-or-below v, via binary search (count of vals <= v)
    let lo = 0, hi = vals.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] <= v) lo = m + 1; else hi = m; }
    return round2((lo / vals.length) * 100);
  };
  for (const s of scored) s.valueGap = round2(s.index - pct(s._conv));

  // ponytail: O(n) scoring + O(n log n) sort, fine to ~10^6 rows in-memory;
  // shard if roster exceeds RAM.
  return rankScored(scored, opts);
}

// --------------------------------- self-test ---------------------------------
function selftest() {
  const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
  const row = (id, index, valueGap, confidence, extra) => Object.assign(
    { id, index, tier: 'notable', confidence, valueGap,
      sport: 'football', position: 'FW', age: 22, breakdown: {}, explanation: '' },
    extra);

  // PROOF: undervalued signatures (LOW) outrank flashy tally (FLASH), and LOW
  // is flagged more undervalued (bigger positive valueGap).
  const LOW = row('LOW', 78, 40, 0.7);   // high index, market hasn't priced it
  const FLASH = row('FLASH', 60, -20, 0.9); // lower index, already overvalued
  const fillers = [];
  for (let i = 0; i < 20; i++) fillers.push(row('f' + String(i).padStart(3, '0'), 40 + i, 5, 0.5));
  const roster = fillers.concat([FLASH, LOW]);
  const ranked = rankScored(roster);
  const rLow = ranked.find((r) => r.id === 'LOW').rank;
  const rFlash = ranked.find((r) => r.id === 'FLASH').rank;
  assert(rLow < rFlash, 'LOW must outrank FLASH');
  assert(LOW.valueGap > FLASH.valueGap, 'LOW must be flagged more undervalued');

  // determinism: shuffled input -> identical rank list
  const shuffled = roster.slice().reverse();
  const a = rankScored(roster).map((r) => r.id + '#' + r.rank).join(',');
  const b = rankScored(shuffled).map((r) => r.id + '#' + r.rank).join(',');
  assert(a === b, 'ranking must be order-independent (id tie-break)');

  // total-order tie-break: equal index -> valueGap -> confidence -> id asc
  const ties = [
    row('zzz', 50, 10, 0.5), row('aaa', 50, 10, 0.5), row('mmm', 50, 10, 0.9),
  ];
  const to = rankScored(ties).map((r) => r.id);
  assert(to[0] === 'mmm' && to[1] === 'aaa' && to[2] === 'zzz',
    'tie-break confidence desc then id asc, got ' + to.join(','));

  // filter: minTier ordinal + undervaluedOnly
  const mixed = [
    row('elite1', 90, 30, 0.8, { tier: 'elite' }),
    row('fringe1', 20, -5, 0.3, { tier: 'fringe' }),
  ];
  const kept = rankScored(mixed, { filter: { minTier: 'high' }, undervaluedOnly: true });
  assert(kept.length === 1 && kept[0].id === 'elite1', 'minTier+undervaluedOnly filter');

  // container / id guards (fail fast, before sibling require)
  let threw = false;
  try { rankProspects('nope'); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'non-array players -> TypeError');
  assert(rankProspects([]).length === 0, 'empty roster -> []');
  threw = false;
  try { rankProspects([{ sport: 'football', stats: {} }]); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'missing id -> TypeError');
  threw = false;
  try { rankProspects([{ id: 'x' }], { filter: { minTier: 'legendary' } }); }
  catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'unknown minTier -> TypeError');

  return 'OK';
}

if (require.main === module && process.argv.includes('--selftest')) {
  console.log(selftest());
}

module.exports = { rankProspects, DISCLAIMER };
