'use strict';
// scientificUpsideIndex — Spec 3: fuse three layers with the honesty hierarchy.
// HONESTY: the "genetic" layer is a phenotype-proxy PROPENSITY estimate derived
// from measurable anthro/physical proxies. It is NOT DNA, NOT genetic data, NOT
// deterministic selection. It is capped BELOW the statistical layer by design
// (stat 0.72-0.80 vs genetic 0.18-0.20) and the face-energy narrative is a
// low-weight (<=0.10), explicitly non-scientific layer. Weighting is enforced
// numerically, not just by label (see fuse()). Pure Node built-ins, deterministic.

const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);

const DISCLAIMER =
  'Genetic layer is a trait-PROPENSITY estimate from measurable phenotype proxies ' +
  'only. NOT DNA, NOT genetic selection, NOT diagnostic. Statistical signature is ' +
  'primary and dominates the index by design; face-energy is a non-scientific, ' +
  'low-weight narrative layer. Use measured stats, not inferences, for decisions.';

const BASE_WITH_NARR = { stat: 0.72, genetic: 0.18, narrative: 0.10 };
const BASE_NO_NARR = { stat: 0.80, genetic: 0.20 };

function tierOf(index) {
  if (index >= 80) return 'elite';
  if (index >= 65) return 'high';
  if (index >= 50) return 'notable';
  if (index >= 35) return 'watch';
  return 'fringe';
}

// Pure numeric fusion — the load-bearing honesty logic, tested standalone.
// layers: { stat:{value,confidence}, genetic:{value,confidence}|null, narrative:{value,confidence}|null }
// Effective weight = baseWeight * layerConfidence, then renormalized over present
// layers so a low-confidence genetic/narrative layer cannot drag a strong stat.
function fuse(layers, useNarr) {
  const base = useNarr ? BASE_WITH_NARR : BASE_NO_NARR;
  const present = {};
  for (const k of Object.keys(base)) {
    const L = layers[k];
    const v = L ? num(L.value) : null;
    if (v !== null) present[k] = clamp(L.confidence, 0, 1);
  }
  const statPresent = present.stat !== undefined;
  // honesty: the face-energy narrative is non-scientific — it never acts without the stat primary.
  if (!statPresent) delete present.narrative;

  const weights = {};
  if (statPresent) {
    // stat keeps its FULL base share as a floor -> the scientific layer can NEVER be out-weighted
    // by genetic/narrative, even when stat confidence is low. Secondaries split the remainder.
    let secSum = 0;
    for (const k of Object.keys(present)) if (k !== 'stat') secSum += base[k] * present[k];
    weights.stat = secSum > 0 ? base.stat : 1;
    const remainder = 1 - weights.stat;
    for (const k of Object.keys(present)) if (k !== 'stat') weights[k] = remainder * (base[k] * present[k]) / secSum;
  } else {
    // no stat: fall back to whatever secondary layers exist (genetic only) — inherently low trust
    let sum = 0; const eff = {};
    for (const k of Object.keys(present)) { eff[k] = base[k] * present[k]; sum += eff[k]; }
    for (const k of Object.keys(present)) weights[k] = sum > 0 ? eff[k] / sum : 0;
  }

  let index = 0;
  let conf = 0;
  for (const k of Object.keys(weights)) {
    index += layers[k].value * weights[k];
    conf += clamp(layers[k].confidence, 0, 1) * weights[k];
  }
  // a result with no scientific stat layer is inherently non-primary -> cap its confidence
  if (!statPresent) conf = Math.min(conf, 0.4);
  return { index, confidence: conf, weights };
}

function collapseGenetic(g) {
  if (!g || !g.vector) return { value: null, confidence: 0 };
  let vn = 0;
  let vd = 0;
  for (const t of Object.values(g.vector)) {
    const v = t ? num(t.value) : null;
    if (v !== null) {
      vn += v * clamp(t.confidence || 0, 0, 1);
      vd += clamp(t.confidence || 0, 0, 1);
    }
  }
  return { value: vd > 0 ? vn / vd : null, confidence: clamp(g.overallConfidence || 0, 0, 1) };
}

function scientificUpsideIndex(player, opts = {}) {
  if (player === null || typeof player !== 'object' || Array.isArray(player)) {
    throw new TypeError('scientificUpsideIndex: player must be an object');
  }
  // Lazy sibling requires: co-located in ScoutAI/lib. Loaded on the real path only
  // so --selftest can exercise fuse() before the siblings exist on disk.
  const { statSignatureScore } = require('./statSignatureScore.js');
  const { geneticPropensityScore } = require('./geneticPropensityScore.js');

  const includeNarrative = opts.includeNarrative === true;

  // 1. Statistical signature — PRIMARY (propagates TypeError on bad sport/stats).
  const statRes = statSignatureScore(player, { leagueStrength: opts.leagueStrength });
  const statLayer = { value: num(statRes.score), confidence: clamp(statRes.confidence || 0, 0, 1) };

  // 2. Genetic propensity — SECONDARY, phenotype-proxy only.
  const genRes = geneticPropensityScore(player.subject || {});
  const genLayer = collapseGenetic(genRes);

  // 3. Optional face-energy narrative — never present unless asked AND face given.
  let narrLayer = null;
  let useNarr = false;
  if (includeNarrative && player.face != null) {
    // ponytail: faceEnergyProfile shape unspecified — read score||value, default conf 0.5.
    const { faceEnergyProfile } = require('./faceEnergyProfile.js');
    const nr = faceEnergyProfile(player.face) || {};
    const nv = num(nr.value != null ? nr.value : nr.score);
    if (nv !== null) {
      narrLayer = { value: nv, confidence: clamp(nr.confidence != null ? nr.confidence : 0.5, 0, 1) };
      useNarr = true;
    }
  }

  const fused = fuse({ stat: statLayer, genetic: genLayer, narrative: narrLayer }, useNarr);

  const breakdown = {
    stat: { value: statLayer.value === null ? null : round2(statLayer.value), weight: round2(fused.weights.stat || 0), confidence: round2(statLayer.confidence) },
    genetic: { value: genLayer.value === null ? null : round2(genLayer.value), weight: round2(fused.weights.genetic || 0), confidence: round2(genLayer.confidence) },
    narrative: narrLayer ? { value: round2(narrLayer.value), weight: round2(fused.weights.narrative || 0), confidence: round2(narrLayer.confidence) } : null,
  };

  const index = round2(clamp(fused.index, 0, 100));
  const confidence = round2(clamp(fused.confidence, 0, 1));

  // Explanation: name top-2 stat signals; flag genetic as propensity-only + narrative non-scientific.
  const topSignals = Array.isArray(statRes.signals)
    ? statRes.signals.slice().sort((a, b) => (b.contribution || 0) - (a.contribution || 0)).slice(0, 2).map((s) => s.name)
    : [];
  let explanation;
  if (fused.weights.stat === undefined && fused.weights.genetic === undefined) {
    explanation = 'Insufficient data: no scoreable layer present; index defaults low.';
  } else {
    const parts = [];
    parts.push(topSignals.length
      ? `Primary statistical signature driven by ${topSignals.join(' and ')} (weight ${round2(fused.weights.stat || 0)}).`
      : `Primary statistical signature (weight ${round2(fused.weights.stat || 0)}).`);
    if (breakdown.genetic.value !== null && (fused.weights.genetic || 0) > 0) {
      parts.push(`Genetic layer is phenotype-proxy propensity only (weight ${breakdown.genetic.weight}); see DISCLAIMER.`);
    }
    if (narrLayer) {
      parts.push(`Face-energy is a non-scientific narrative layer (weight ${breakdown.narrative.weight}).`);
    }
    explanation = parts.join(' ');
  }

  return { index, tier: tierOf(index), confidence, breakdown, explanation };
}

// ---- self-check ---------------------------------------------------------
// Tests the honesty hierarchy + fusion invariants via fuse() directly, so it
// runs before sibling lib modules exist. Real-path integration is covered by
// ScoutAI/lib/test_scoutai.js once siblings land.
function selftest() {
  const assert = require('assert');

  // PROOF: stat favors LOW; genetic + narrative favor FLASH. LOW must still win —
  // stat weight (0.72) swamps genetic (0.18) + narrative (0.10).
  const LOW = fuse({ stat: { value: 78, confidence: 0.9 }, genetic: { value: 45, confidence: 1 }, narrative: { value: 45, confidence: 1 } }, true);
  const FLASH = fuse({ stat: { value: 52, confidence: 0.9 }, genetic: { value: 90, confidence: 1 }, narrative: { value: 90, confidence: 1 } }, true);
  assert(LOW.index > FLASH.index, `PROOF failed: LOW ${LOW.index} !> FLASH ${FLASH.index}`);

  // Genetic can never out-weigh stat, even at full genetic confidence + low stat confidence.
  const w = fuse({ stat: { value: 50, confidence: 0.3 }, genetic: { value: 50, confidence: 1 }, narrative: null }, false).weights;
  assert(w.stat > w.genetic, `stat weight ${w.stat} must exceed genetic ${w.genetic}`);

  // Missing genetic → weight renormalizes away; index rides on stat only.
  const g0 = fuse({ stat: { value: 60, confidence: 0.8 }, genetic: { value: null, confidence: 0 }, narrative: null }, false);
  assert(Math.abs(g0.index - 60) < 1e-9 && g0.weights.genetic === undefined, 'absent genetic must renormalize away');

  // All layers empty → index 0, confidence 0, tier fringe.
  const empty = fuse({ stat: { value: null, confidence: 0 }, genetic: { value: null, confidence: 0 }, narrative: null }, false);
  assert(empty.index === 0 && empty.confidence === 0 && tierOf(empty.index) === 'fringe', 'empty must be 0/fringe');

  // Tier boundaries.
  assert(tierOf(80) === 'elite' && tierOf(65) === 'high' && tierOf(50) === 'notable' && tierOf(35) === 'watch' && tierOf(34.99) === 'fringe', 'tier boundaries');

  // Confidence is a weighted mean of present layer confidences (in [0,1]).
  assert(g0.confidence >= 0 && g0.confidence <= 1 && Math.abs(g0.confidence - 0.8) < 1e-9, 'confidence weighted mean');

  console.log('OK');
}

if (require.main === module && process.argv.includes('--selftest')) selftest();

module.exports = { scientificUpsideIndex, DISCLAIMER, _fuse: fuse, _tierOf: tierOf };
