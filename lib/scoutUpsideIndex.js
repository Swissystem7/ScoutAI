'use strict';
/*
 * scoutUpsideIndex — ScoutAI "hidden upside" index.
 *
 * HEURISTIC / NARRATIVE LAYER, NOT VALIDATED PREDICTION.
 * The face-energy input (chochmat-panim / physiognomy) that feeds `player.energy`
 * is a narrative layer with tunable weights (WILL_WEIGHTS below). It is folk/modern
 * physiognomy loosely dressed as insight — it is NOT validated science and is NOT a
 * prediction of a player's ability or character. The will-signal weights are knobs to
 * be tuned, not measured constants. Treat the whole index as a scouting heuristic that
 * combines a conventional stat score with an intangibles narrative, nothing more.
 *
 * Pure, deterministic, Node >=18, zero deps. No Date/random/IO.
 */

// Default will-signal weights (work-rate / tenacity heavy). Tunable knobs, not validated.
const WILL_WEIGHTS = Object.freeze({
  drive: 0.25,
  resilience: 0.25,
  discipline: 0.20,
  intensity: 0.15,
  leadership: 0.10,
  composure: 0.05,
});

const ENERGY_DIMS = ['drive', 'resilience', 'leadership', 'intensity', 'discipline', 'composure'];

/**
 * Linear-map a raw per-90 momentum contribution onto 0..100, clamped.
 * @param {number} raw   raw per-90 contribution (e.g. byPlayer[id] scaled to per-90)
 * @param {{lo?:number, hi?:number}} [range]
 * @returns {number} clamped 0..100 (not rounded)
 */
function normalizeMomentum(raw, { lo = 0, hi = 1.0 } = {}) {
  if (!Number.isFinite(raw)) throw new TypeError('normalizeMomentum: raw must be finite');
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) {
    throw new RangeError('normalizeMomentum: lo/hi must be finite and distinct');
  }
  const t = ((raw - lo) / (hi - lo)) * 100;
  return Math.max(0, Math.min(100, t));
}

/**
 * @param {object} player
 * @param {object} [opts]
 * @returns {{index:number, upside:'high'|'medium'|'low', explanation:string}}
 */
function scoutUpsideIndex(player, opts = {}) {
  if (player === null || typeof player !== 'object' || Array.isArray(player)) {
    throw new TypeError('player must be a plain object');
  }
  const {
    willWeights = WILL_WEIGHTS,
    signalMix = { will: 0.55, momentum: 0.45 },
    tierBoostPerLevel = 0.05,
    signalFloor = 40,
    thresholds = { high: 70, medium: 50 },
  } = opts;

  const name = player.name === undefined ? 'player' : String(player.name);

  // --- required fields ---
  if (typeof player.statScore !== 'number' || !Number.isFinite(player.statScore)) {
    throw new TypeError('player.statScore is required and must be a finite number');
  }
  if (player.energy === null || typeof player.energy !== 'object' || Array.isArray(player.energy)) {
    throw new TypeError('player.energy is required and must be an object');
  }
  if (typeof player.momentum !== 'number' || !Number.isFinite(player.momentum)) {
    throw new TypeError('player.momentum is required and must be a finite number');
  }

  // --- range checks ---
  const statScore = player.statScore;
  if (statScore < 0 || statScore > 100) throw new RangeError('statScore out of [0,100]');
  const momentum = player.momentum;
  if (momentum < 0 || momentum > 100) throw new RangeError('momentum out of [0,100]');

  const flags = [];
  const energy = {};
  for (const d of ENERGY_DIMS) {
    const v = player.energy[d];
    if (v === undefined) {
      energy[d] = 50; // missing dim treated as neutral 50, flagged
      flags.push(d);
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`energy.${d} must be a finite number`);
    if (v < 0 || v > 100) throw new RangeError(`energy.${d} out of [0,100]`);
    energy[d] = v;
  }

  const leagueTier = (player.context && player.context.leagueTier !== undefined) ? player.context.leagueTier : 1;
  if (typeof leagueTier !== 'number' || !Number.isFinite(leagueTier) || leagueTier < 1 || leagueTier > 8) {
    throw new RangeError('context.leagueTier out of [1,8]');
  }

  // --- formula ---
  // will: weighted sum of energy dims, 0-100
  let will = 0;
  for (const d of ENERGY_DIMS) will += (willWeights[d] || 0) * energy[d];

  // signal: blend of will and momentum ("the intangible")
  const signal = signalMix.will * will + signalMix.momentum * momentum;

  // underval: room above current stat score, boosted by how low the league tier is (Vardy tier-8)
  const underval = Math.min(100, (100 - statScore) * (1 + tierBoostPerLevel * (leagueTier - 1)));

  // index: geometric mean of signal and underval — needs BOTH to be high
  let index = Math.round(100 * Math.sqrt((signal / 100) * (underval / 100)));

  // weak-will gate: weak stats + weak will = just weak, not upside
  if (signal < signalFloor) index = Math.round(index * signal / signalFloor);

  const upside = index >= thresholds.high ? 'high' : index >= thresholds.medium ? 'medium' : 'low';

  // top2 energy dims, ties broken by fixed dim order
  const ordered = ENERGY_DIMS
    .map((d, i) => ({ d, v: energy[d], i }))
    .sort((a, b) => (b.v - a.v) || (a.i - b.i));
  const top2 = [ordered[0].d, ordered[1].d];

  // verdict must match the actual upside class — a low-upside control player is NOT understated by stats
  const verdict = upside === 'high' ? 'understates them'
    : upside === 'medium' ? 'may understate them'
    : 'already reflects them (no hidden upside signal)';
  let explanation =
    `${name}: conventional stat score ${statScore}/100 (league tier ${leagueTier}) ${verdict} — ` +
    `will-signal ${round1(will)} led by ${top2[0]} and ${top2[1]}, momentum contribution ${momentum}/100 ` +
    `→ upside index ${index} (${upside}). Pattern class: filtered by stats/size/tier, advanced on observed ` +
    `work-rate (Kanté/Vardy/Mahrez/Kane/Robertson archetype). HEURISTIC: face-energy input is a narrative ` +
    `layer, not validated science.`;
  if (flags.length) {
    explanation += ` [missing energy dims defaulted to 50: ${flags.join(', ')}]`;
  }

  return { index, upside, explanation };
}

function round1(x) { return Math.round(x * 10) / 10; }

module.exports = { scoutUpsideIndex, normalizeMomentum, WILL_WEIGHTS };

// --- self-check ---
if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');

  const run = (p) => scoutUpsideIndex(p);

  const vardy = {
    name: 'Vardy', statScore: 15, context: { leagueTier: 8 },
    energy: { drive: 75, resilience: 70, intensity: 70, discipline: 55, leadership: 55, composure: 45 },
    momentum: 60,
  };
  const kante = {
    name: 'Kanté', statScore: 35, context: { leagueTier: 2 },
    // approximate faceEnergyProfile output for a jaw/chin-heavy defensive profile
    energy: { drive: 62, resilience: 78, leadership: 60, intensity: 45, discipline: 55, composure: 50 },
    momentum: 52,
  };
  const control = {
    name: 'Control', statScore: 88, context: { leagueTier: 1 },
    energy: { drive: 55, resilience: 55, leadership: 55, intensity: 55, discipline: 55, composure: 55 },
    momentum: 60,
  };
  const weak = {
    name: 'Weak', statScore: 30, context: { leagueTier: 1 },
    energy: { drive: 30, resilience: 30, leadership: 30, intensity: 30, discipline: 30, composure: 30 },
    momentum: 20,
  };

  const rVardy = run(vardy), rKante = run(kante), rControl = run(control), rWeak = run(weak);

  // PROOF cases
  assert(rVardy.index >= 75 && rVardy.upside === 'high', `Vardy ${rVardy.index}/${rVardy.upside}`);
  assert(rKante.index >= 60, `Kanté ${rKante.index}`);
  assert(rKante.index > rControl.index && rVardy.index > rControl.index, 'upside > control');
  assert(rControl.index <= 35, `Control ${rControl.index}`);
  assert(rWeak.index < 50, `Weak gate ${rWeak.index}`);

  // determinism
  assert.deepStrictEqual(run(vardy), run(vardy));

  // edge: missing energy dim → defaulted to 50 + flag in explanation
  const missing = scoutUpsideIndex({ statScore: 40, energy: { drive: 60 }, momentum: 50 });
  assert(/missing energy dims defaulted to 50/.test(missing.explanation), 'missing-dim flag');

  // edge: normalizeMomentum clamps
  assert.strictEqual(normalizeMomentum(0.52), 52);
  assert.strictEqual(normalizeMomentum(2.0), 100);
  assert.strictEqual(normalizeMomentum(-1), 0);

  // edge: bad input throws
  assert.throws(() => scoutUpsideIndex({ energy: {}, momentum: 50 }), TypeError);
  assert.throws(() => scoutUpsideIndex({ statScore: 200, energy: {}, momentum: 50 }), RangeError);

  console.log('OK');
}
