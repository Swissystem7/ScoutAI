// faceEnergyProfile.js — ScoutAI narrative layer
//
// HEURISTIC / NARRATIVE LAYER — NOT VALIDATED PREDICTION.
// The chochmat-panim mappings below are folk/modern physiognomy loosely
// derived from Kabbalistic sources (Zohar / Idra Rabba themes). They are a
// storytelling/tuning layer with hand-picked, TUNABLE weights — not a
// validated model of ability or character. sourceTag on each row is honest
// about provenance: "classical" = traceable to Zohar/Idra themes,
// "modern" = contemporary Hebrew popularizations, "folk" = Western
// personology wearing a Kabbalah label. Do not treat any output as science.
//
// Node >=18, zero deps, pure & deterministic (no Date/random/IO).

'use strict';

const DISCLAIMER =
  'HEURISTIC: chochmat-panim narrative layer. Mappings are folk/modern physiognomy loosely derived from Kabbalistic sources; NOT validated science, NOT a prediction of ability or character.';

// Fixed dim order — used for tie-breaking dominant and neutral iteration.
const DIMS = ['drive', 'resilience', 'leadership', 'intensity', 'discipline', 'composure'];

// Each feature: { <dim>: weight, ... , sourceTag }
const WEIGHTS = {
  foreheadHeight:   { drive: 0.35, discipline: 0.10, sourceTag: 'modern' },
  foreheadWidth:    { composure: 0.30, sourceTag: 'modern' },
  foreheadLines:    { discipline: 0.35, sourceTag: 'modern' },
  eyeSize:          { intensity: 0.30, sourceTag: 'modern' },
  eyeSpacing:       { composure: 0.35, sourceTag: 'modern' },
  eyeProtrusion:    { intensity: 0.25, sourceTag: 'modern' },
  browDensity:      { leadership: 0.40, sourceTag: 'folk' },
  browTilt:         { composure: -0.25, sourceTag: 'folk' },
  noseWidth:        { intensity: 0.25, sourceTag: 'modern' },
  noseBridgeConvex: { drive: 0.30, sourceTag: 'modern' },
  noseLength:       { discipline: -0.15, sourceTag: 'modern' },
  lipFullness:      { composure: 0.20, sourceTag: 'classical' },
  jawSquareness:    { resilience: 0.60, sourceTag: 'classical' },
  chinProjection:   { resilience: 0.40, leadership: 0.35, sourceTag: 'classical' },
  faceAspect:       { leadership: 0.25, drive: -0.15, sourceTag: 'modern' },
  earTilt:          { leadership: 0.20, sourceTag: 'folk' },
  hairCurl:         { intensity: 0.20, sourceTag: 'classical' },
};

function isPlainObject(o) {
  return typeof o === 'object' && o !== null && !Array.isArray(o);
}

// Deep-merge opts.weights over defaults, one level of feature -> {dim/sourceTag}.
function mergeWeights(override) {
  if (override === undefined) return WEIGHTS;
  if (!isPlainObject(override)) throw new TypeError('opts.weights must be a plain object');
  const merged = {};
  for (const f of Object.keys(WEIGHTS)) merged[f] = { ...WEIGHTS[f] };
  for (const f of Object.keys(override)) {
    const row = override[f];
    if (!isPlainObject(row)) throw new TypeError(`opts.weights.${f} must be a plain object`);
    merged[f] = { ...(merged[f] || {}), ...row };
    // Validate numeric dim weights in the (possibly new) row.
    for (const k of Object.keys(row)) {
      if (k === 'sourceTag') continue;
      if (typeof row[k] !== 'number' || !Number.isFinite(row[k])) {
        throw new RangeError(`opts.weights.${f}.${k} must be a finite number`);
      }
    }
  }
  return merged;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function faceEnergyProfile(features, opts = {}) {
  if (!isPlainObject(features)) throw new TypeError('features must be a plain object');
  if (!isPlainObject(opts)) throw new TypeError('opts must be a plain object');

  const weights = mergeWeights(opts.weights);

  // Validate present, known features.
  for (const k of Object.keys(features)) {
    if (!(k in weights)) continue; // unknown keys ignored silently
    const v = features[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new RangeError(`feature ${k} out of [0,1]`);
    }
  }

  const energy = {};
  const notes = [DISCLAIMER];

  // Accumulate per-dim weighted sums over present features only.
  const num = {}; // Σ(w*s)
  const den = {}; // Σ|w|
  for (const d of DIMS) { num[d] = 0; den[d] = 0; }

  const usedFeatures = [];
  for (const k of Object.keys(weights)) {
    if (!(k in features)) continue;
    usedFeatures.push(k);
    const f = features[k];
    const s = 2 * f - 1;
    const row = weights[k];
    for (const d of Object.keys(row)) {
      if (d === 'sourceTag') continue;
      const w = row[d];
      if (!(d in num)) continue; // ignore unknown dims from overrides
      num[d] += w * s;
      den[d] += Math.abs(w);
    }
  }

  const neutralNotes = [];
  for (const d of DIMS) {
    if (den[d] === 0) {
      energy[d] = 50;
      neutralNotes.push(`${d}: no input features, neutral 50`);
      continue;
    }
    let score = 50 + 50 * (num[d] / den[d]);
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    energy[d] = round1(score);
  }

  // Provenance notes for used non-classical features (in fixed feature order).
  for (const k of Object.keys(weights)) {
    if (!usedFeatures.includes(k)) continue;
    if (weights[k].sourceTag === 'classical') continue;
    notes.push(`${k}: modern/folk mapping, not classical text`);
  }
  for (const n of neutralNotes) notes.push(n);

  // Dominant: highest score, tie -> first in DIMS order.
  let dominant = null;
  if (usedFeatures.length > 0 && den && DIMS.some((d) => den[d] > 0)) {
    let best = -Infinity;
    for (const d of DIMS) {
      if (energy[d] > best) { best = energy[d]; dominant = d; }
    }
  }

  return { energy, dominant, notes, disclaimer: DISCLAIMER };
}

module.exports = { faceEnergyProfile, WEIGHTS, DISCLAIMER };

// ---- self-check ----
if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');

  // PROOF: jawSquareness=1 alone -> resilience > 90.
  const r1 = faceEnergyProfile({ jawSquareness: 1 });
  assert(r1.energy.resilience > 90, `resilience should be >90, got ${r1.energy.resilience}`);
  assert.strictEqual(r1.dominant, 'resilience');

  // jawSquareness=0 -> resilience < 10.
  const r2 = faceEnergyProfile({ jawSquareness: 0 });
  assert(r2.energy.resilience < 10, `resilience should be <10, got ${r2.energy.resilience}`);

  // empty -> all 50, dominant null.
  const r3 = faceEnergyProfile({});
  for (const d of DIMS) assert.strictEqual(r3.energy[d], 50);
  assert.strictEqual(r3.dominant, null);
  assert.strictEqual(r3.notes[0], DISCLAIMER);

  // out-of-range -> RangeError.
  assert.throws(() => faceEnergyProfile({ eyeSize: 1.5 }), RangeError);

  // non-object -> TypeError; unknown keys ignored.
  assert.throws(() => faceEnergyProfile(null), TypeError);
  const r4 = faceEnergyProfile({ bogusKey: 0.9, jawSquareness: 0.75 });
  assert.strictEqual(r4.dominant, 'resilience');

  // Determinism: byte-identical output.
  const inp = { jawSquareness: 0.75, chinProjection: 0.7, foreheadHeight: 0.65 };
  assert.strictEqual(JSON.stringify(faceEnergyProfile(inp)), JSON.stringify(faceEnergyProfile(inp)));

  console.log('OK');
}
