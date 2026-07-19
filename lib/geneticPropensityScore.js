'use strict';
// ScoutAI/lib/geneticPropensityScore.js
// PHENOTYPE-PROXY PROPENSITY LAYER — NOT DNA, NOT genetic data, NOT diagnostic.
// Maps measurable anthro/physical phenotype proxies -> a probabilistic trait-propensity
// vector. Polygenic, tiny per-variant effects, training/environment-confounded. Always
// prefer the measured stat over this inference for any decision. See DISCLAIMER export.
//
// Pure Node built-ins, zero deps, fully deterministic (no Date/Math.random/IO).
//
// ponytail: normalizeMetrics not on disk yet; the 0-100 linear+invert scaling this spec
// needs is a 3-line local helper, so implemented inline rather than blocking on a require
// of a non-existent module. Swap to require('./normalizeMetrics.js') once it lands and its
// signature is fixed.

const DISCLAIMER =
  'Trait-propensity estimate from measurable phenotype proxies only. NOT genetic data, ' +
  'NOT DNA-based selection, NOT diagnostic for any individual. Polygenic traits, tiny ' +
  'per-variant effects, heavily training/environment-dependent and population-confounded. ' +
  'Use the measured stat, not this inference, for decisions.';

const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// Default normalization bounds. `inv:true` => lower raw is better (higher score).
const NORM = {
  heightCm: { min: 155, max: 205 },
  wingspanCm: { min: 160, max: 220 },
  standingReachCm: { min: 200, max: 290 },
  bodyFatPct: { min: 5, max: 25, inv: true },
  topSpeedKmh: { min: 24, max: 38 },
  accel10mS: { min: 1.5, max: 2.6, inv: true },
  verticalJumpCm: { min: 40, max: 95 },
  laneAgilityS: { min: 10, max: 13, inv: true },
  distanceCoveredKm: { min: 6, max: 14 },
  hrRecovery60s: { min: 10, max: 45 },
  fitnessDeltaPerMonth: { min: 0, max: 4 },
  injuryDaysPerSeason: { min: 0, max: 120, inv: true },
  softTissueIncidentCount: { min: 0, max: 8, inv: true },
};

// trait -> [ [field, evidenceWeight], ... ]  (strong=1.0, moderate=0.6, weak=0.3)
const TRAITS = {
  power: [['verticalJumpCm', 1.0], ['accel10mS', 0.6], ['bodyFatPct', 0.3]],
  speed: [['topSpeedKmh', 0.6], ['accel10mS', 0.6], ['laneAgilityS', 0.3]],
  endurance: [['distanceCoveredKm', 0.6], ['hrRecovery60s', 0.6], ['fitnessDeltaPerMonth', 0.6]],
  stature: [['heightCm', 1.0], ['wingspanCm', 1.0], ['standingReachCm', 0.6]],
  recovery: [['hrRecovery60s', 0.6], ['fitnessDeltaPerMonth', 0.6]],
  durability: [['injuryDaysPerSeason', 0.6], ['softTissueIncidentCount', 0.6]],
};

const TOTAL_POSSIBLE_PROXIES = Object.values(TRAITS)
  .reduce((n, ps) => n + ps.length, 0); // 16

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPlainObject = (o) =>
  o !== null && typeof o === 'object' && !Array.isArray(o);

// Linear scale to 0-100, clamped, inverted for `inv` fields.
function normField(field, raw, override) {
  const base = NORM[field];
  const bounds = override && override[field] ? override[field] : base;
  const min = bounds.min, max = bounds.max, inv = base.inv;
  const span = max - min;
  if (span === 0) return 0;
  const t = clamp((raw - min) / span, 0, 1);
  return round2((inv ? 1 - t : t) * 100);
}

function geneticPropensityScore(subject, opts) {
  if (!isPlainObject(subject)) {
    throw new TypeError('geneticPropensityScore: subject must be a plain object');
  }
  const options = isPlainObject(opts) ? opts : {};
  const override = isPlainObject(options.norm) ? options.norm : null;

  const anthro = isPlainObject(subject.anthro) ? subject.anthro : {};
  const phys = isPlainObject(subject.phys) ? subject.phys : {};
  const flat = Object.assign({}, anthro, phys); // phys wins if overlap (none in spec)

  const vector = {};
  let proxiesUsed = 0;
  const confs = [];

  for (const trait of Object.keys(TRAITS)) {
    let wSum = 0;   // Σ weight of present proxies
    let wAll = 0;   // Σ weight of all defined proxies for trait
    let acc = 0;    // Σ (norm · weight) of present proxies
    for (const [field, w] of TRAITS[trait]) {
      wAll += w;
      const raw = flat[field];
      if (!isNum(raw)) continue; // NaN/Infinity/absent => absent, not 0
      const norm = normField(field, raw, override);
      acc += norm * w;
      wSum += w;
      proxiesUsed += 1;
    }
    if (wSum === 0) {
      vector[trait] = { value: null, confidence: 0 };
    } else {
      const confidence = clamp(wSum / wAll, 0, 1);
      vector[trait] = { value: round2(acc / wSum), confidence: round2(confidence) };
      confs.push(confidence);
    }
  }

  // overallConfidence = mean of non-zero trait confidences, scaled by coverage.
  const meanConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  const overallConfidence = round2(meanConf * (proxiesUsed / TOTAL_POSSIBLE_PROXIES));

  return { vector, overallConfidence, proxiesUsed, DISCLAIMER };
}

geneticPropensityScore.DISCLAIMER = DISCLAIMER;

// ---- self-test -------------------------------------------------------------
function selftest() {
  const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };

  // 1) PROOF: value and confidence move INDEPENDENTLY.
  const A = geneticPropensityScore({
    anthro: { heightCm: 198, wingspanCm: 212 },
    phys: { verticalJumpCm: 88 },
  });
  // strong single-proxy stature -> high value, partial confidence (2 of 3 proxies)
  assert(A.vector.stature.value > 80, 'A.stature.value high');
  assert(A.vector.stature.confidence < 1, 'A.stature.confidence partial');
  // single strong power proxy -> high value BUT low confidence (1 of 3)
  assert(A.vector.power.value > 80, 'A.power.value high on lone strong proxy');
  assert(A.vector.power.confidence < 1, 'A.power.confidence < 1 (only 1/3 proxies)');
  assert(A.vector.stature.confidence > A.vector.power.confidence,
    'more-covered trait has higher confidence');

  // subject B: all 3 power proxies present at mid values -> full confidence, mid value
  const B = geneticPropensityScore({
    phys: { verticalJumpCm: 67, accel10mS: 2.05, bodyFatPct: 15 },
  });
  assert(B.vector.power.confidence === 1, 'B.power.confidence == 1 (all proxies present)');
  assert(B.vector.power.value < A.vector.power.value,
    'mid full-confidence value < elite partial-confidence value (independence)');

  // 2) empty subject -> all null, zero confidence, still returns DISCLAIMER
  const E = geneticPropensityScore({});
  assert(E.proxiesUsed === 0 && E.overallConfidence === 0, 'empty -> zero coverage');
  assert(E.vector.speed.value === null && E.vector.speed.confidence === 0, 'empty trait null');
  assert(E.DISCLAIMER === DISCLAIMER, 'empty still carries DISCLAIMER');

  // 3) NaN / Infinity treated as absent
  const N = geneticPropensityScore({ anthro: { heightCm: NaN, wingspanCm: Infinity, standingReachCm: 245 } });
  assert(N.vector.stature.value !== null, 'valid proxy survives');
  assert(N.vector.stature.confidence === 0.23,
    'only standingReach(0.6)/2.6 counts, NaN+Inf absent'); // round2(0.6/2.6)

  // 4) out-of-range clamped by normalization, not rejected
  const C = geneticPropensityScore({ anthro: { heightCm: 300 } }); // > max
  assert(C.vector.stature.value === 100, 'over-max height clamps to 100');

  // 5) opts.norm override changes scaling
  const O = geneticPropensityScore(
    { anthro: { heightCm: 180 } },
    { norm: { heightCm: { min: 175, max: 185 } } },
  );
  assert(O.vector.stature.value === 50, 'override bounds map 180 -> 50');

  // 6) TypeError on non-object subject
  let threw = false;
  try { geneticPropensityScore(null); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'non-object subject throws TypeError');

  console.log('OK');
}

if (require.main === module && process.argv.includes('--selftest')) selftest();

module.exports = { geneticPropensityScore, DISCLAIMER };
