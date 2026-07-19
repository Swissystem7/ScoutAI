'use strict';
// NEW STATISTIC — Impact Score (מדד ההשפעה): quantifies a player's game-changing impact BEYOND the box score.
// One 0-100 number from transparent components. v1 computes from event-derived BEHAVIOR (real, no CV):
//   Grit (effort/defensive work), Involvement (progressive volume), Clutch (high-leverage contribution).
//   Energy (body-language) is an OPTIONAL v2 layer (CV upstream) — default off, weight 0 until data exists.
// This is the product's headline metric — the thing competitors' xG-radars don't measure.
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const r1 = (x) => Math.round(x * 10) / 10;
// scale a per-90 value to 0-100 vs a soft cap (documented, tunable per role)
const sc = (v, cap) => clamp((Number(v) || 0) / cap, 0, 1) * 100;

const WEIGHTS = { grit: 0.34, involvement: 0.33, clutch: 0.33, energy: 0 }; // energy off until CV exists

function impactScore(p, opts = {}) {
  if (!p || typeof p !== 'object') throw new TypeError('impactScore: player object required');
  const s = p.stats || {};
  const w = { ...WEIGHTS, ...(opts.weights || {}) };
  // Grit: defensive effort per 90
  const grit = r1((sc(s.pressures90, 12) * 0.5) + (sc((s.tackles + s.interceptions) / (p.minutes || 90) * 90, 4) * 0.5));
  // Involvement: progressive + creative volume per 90
  const prog90 = ((s.progPasses + s.progCarries) / (p.minutes || 90)) * 90;
  const involvement = r1((sc(prog90, 12) * 0.6) + (sc(s.sca90, 6) * 0.4));
  // Clutch: high-leverage output (carries into box + goal-creating) — proxy for changing games
  const clutch = r1((sc(s.carriesIntoBox90, 4) * 0.5) + (sc(s.gca90 * 10, 6) * 0.3) + (sc(s.npxG90 * 100, 60) * 0.2));
  // Energy: body-language (optional; only if provided). 50 = neutral so it never helps/hurts at weight 0.
  const energy = Number.isFinite(opts.energy) ? clamp(opts.energy, 0, 100) : 50;

  const score = r1(clamp(grit * w.grit + involvement * w.involvement + clutch * w.clutch + energy * w.energy, 0, 100));
  return { score, components: { grit, involvement, clutch, energy }, note: w.energy === 0 ? 'energy layer off (no CV data yet)' : 'energy layer active' };
}
module.exports = { impactScore, WEIGHTS };

if (require.main === module && process.argv.includes('--selftest')) {
  const a = require('assert');
  const worker = { minutes: 900, stats: { pressures90: 10, tackles: 30, interceptions: 20, progPasses: 100, progCarries: 60, sca90: 5, carriesIntoBox90: 3, gca90: 0.5, npxG90: 0.3 } };
  const passenger = { minutes: 900, stats: { pressures90: 1, tackles: 2, interceptions: 1, progPasses: 5, progCarries: 3, sca90: 0.5, carriesIntoBox90: 0.2, gca90: 0.05, npxG90: 0.05 } };
  a.ok(impactScore(worker).score > impactScore(passenger).score, 'worker must beat passenger');
  a.ok(impactScore(worker).score >= 0 && impactScore(worker).score <= 100);
  a.throws(() => impactScore(null));
  console.log('OK', impactScore(worker).score, 'vs', impactScore(passenger).score);
}
