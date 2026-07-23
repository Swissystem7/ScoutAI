'use strict';

const { normalizeVideoSignal } = require('./videoSignal.js');

function loadBodyDataset(json) {
  const dataset = typeof json === 'string' ? JSON.parse(json) : json;
  if (!dataset || typeof dataset !== 'object' || typeof dataset.sequence !== 'string' || !Array.isArray(dataset.players)) {
    throw new TypeError('body dataset must contain sequence and players[]');
  }
  dataset.players.forEach((p, i) => {
    if (!p || typeof p !== 'object') throw new TypeError('player ' + i + ' must be an object');
    ['trackId', 'framesWithBox', 'framesPoseDetected', 'seconds', 'scanningCount', 'scanningRate', 'uprightness', 'intensityRaw']
      .forEach(k => finite(p[k], 'player ' + i + '.' + k));
    if (p.framesWithBox <= 0 || p.framesPoseDetected < 0 || p.framesPoseDetected > p.framesWithBox) {
      throw new TypeError('player ' + i + ' has invalid frame counts');
    }
  });
  return dataset;
}

/**
 * Min-max normalizes intensityRaw within this sequence. This preserves the
 * measured ordering without claiming cross-match calibration. A tied dataset
 * receives neutral intensity 0.5.
 */
function bodyToVideoSignals(dataset, opts = {}) {
  const valid = loadBodyDataset(dataset);
  const floor = Number.isFinite(opts.confidenceFloor) ? opts.confidenceFloor : 0.6;
  if (floor < 0 || floor > 1) throw new RangeError('confidenceFloor must be in [0,1]');
  const raws = valid.players.map(p => p.intensityRaw);
  const min = Math.min(...raws), max = Math.max(...raws);
  return valid.players.map(p => {
    const confidence = round4(p.framesPoseDetected / p.framesWithBox);
    const intensity = max === min ? 0.5 : round4((p.intensityRaw - min) / (max - min));
    // Reuse the established video contract for its normalized base fields,
    // then attach geometry-only measurements and explicit validation metadata.
    const base = normalizeVideoSignal([{
      durationSec: p.seconds,
      scanCount: p.scanningCount,
      energy: intensity,
      momentumInvolvement: 0,
    }]);
    return {
      trackId: p.trackId,
      sequence: valid.sequence,
      videoSignals: {
        ...base,
        intensity,
        intensityRaw: p.intensityRaw,
        uprightness: clamp(p.uprightness, 0, 1),
        confidence,
        lowConfidence: confidence < floor,
        scanning: { value: p.scanningRate, count: p.scanningCount, unvalidated: true, contribution: 0 },
        provenance: 'measured-geometry',
        facialEmotionMeasured: false,
      },
    };
  });
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label + ' must be finite');
}
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function round4(x) { return Math.round(x * 10000) / 10000; }

module.exports = { loadBodyDataset, bodyToVideoSignals };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const sample = { sequence: 'test', players: [
    { trackId: 1, framesWithBox: 10, framesPoseDetected: 9, seconds: 2, scanningCount: 4, scanningRate: 2, uprightness: 0.9, intensityRaw: 0.2 },
    { trackId: 2, framesWithBox: 10, framesPoseDetected: 5, seconds: 2, scanningCount: 5, scanningRate: 2.5, uprightness: 0.8, intensityRaw: 0.4 },
  ] };
  const out = bodyToVideoSignals(sample);
  assert.strictEqual(out[0].videoSignals.intensity, 0);
  assert.strictEqual(out[1].videoSignals.intensity, 1);
  assert.strictEqual(out[1].videoSignals.lowConfidence, true);
  assert.strictEqual(out[0].videoSignals.scanning.contribution, 0);
  assert.strictEqual(out[0].videoSignals.scanning.unvalidated, true);
  assert.deepStrictEqual(bodyToVideoSignals(sample), out);
  assert.throws(() => loadBodyDataset({}), TypeError);
  console.log('OK min-max intensity; confidence gate=0.6; scanning contribution=0');
}
