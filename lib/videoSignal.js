'use strict';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Normalize an eventual Gemini-Vision clip response into PlayerSignal.videoSignals. */
function normalizeVideoSignal(rawClipScores) {
  if (!Array.isArray(rawClipScores)) throw new TypeError('rawClipScores must be an array');
  let scans = 0, seconds = 0, energySum = 0, involvementSum = 0;
  for (const clip of rawClipScores) {
    if (!clip || typeof clip !== 'object') throw new TypeError('each clip score must be an object');
    const durationSec = finite(clip.durationSec, 'durationSec', 0);
    const scanCount = finite(clip.scanCount, 'scanCount', 0);
    const energy = finite(clip.energy, 'energy', 0);
    const momentumInvolvement = finite(clip.momentumInvolvement, 'momentumInvolvement', 0);
    seconds += Math.max(0, durationSec);
    scans += Math.max(0, Math.round(scanCount));
    energySum += clamp(energy, 0, 1);
    involvementSum += clamp(momentumInvolvement, 0, 1);
  }
  const count = rawClipScores.length;
  return {
    scanningCount: scans,
    scanningRate: seconds ? round4(scans / seconds) : 0,
    energy: count ? round4(energySum / count) : 0,
    momentumInvolvement: count ? round4(involvementSum / count) : 0,
    clips: count,
    provenance: 'AI-inferred',
  };
}

function finite(value, label, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label + ' must be finite');
  return value;
}
function round4(value) { return Math.round(value * 10000) / 10000; }

module.exports = { normalizeVideoSignal };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const input = [
    { durationSec: 10, scanCount: 4, energy: 1.4, momentumInvolvement: -1 },
    { durationSec: 20, scanCount: 5.6, energy: 0.4, momentumInvolvement: 0.8 },
  ];
  const result = normalizeVideoSignal(input);
  assert.deepStrictEqual(result, { scanningCount: 10, scanningRate: 0.3333, energy: 0.7, momentumInvolvement: 0.4, clips: 2, provenance: 'AI-inferred' });
  assert.deepStrictEqual(normalizeVideoSignal(input), result);
  assert.throws(() => normalizeVideoSignal({}), TypeError);
  assert.throws(() => normalizeVideoSignal([{ energy: NaN }]), TypeError);
  console.log('OK');
}
