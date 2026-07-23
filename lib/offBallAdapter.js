'use strict';

function loadOffBallDataset(json) {
  const dataset = typeof json === 'string' ? JSON.parse(json) : json;
  if (!dataset || typeof dataset !== 'object' || !dataset.report || !Array.isArray(dataset.players)) {
    throw new TypeError('off-ball dataset must contain report and players[]');
  }
  dataset.players.forEach((p, i) => {
    if (!p || typeof p !== 'object') throw new TypeError('player ' + i + ' must be an object');
    ['trackId', 'frames', 'seconds', 'offBallWorkRate', 'closingRate', 'persistence']
      .forEach(k => finite(p[k], 'player ' + i + '.' + k));
    ['sequence', 'action', 'provenance'].forEach(k => {
      if (typeof p[k] !== 'string' || !p[k]) throw new TypeError('player ' + i + '.' + k + ' must be a non-empty string');
    });
    if (p.frames < 0 || p.seconds < 0) throw new TypeError('player ' + i + ' has invalid duration');
  });
  return dataset;
}

/**
 * Population z-scores are calculated separately inside each sequence. Raw
 * values remain display-only because action context confounds cross-clip scale.
 */
function offBallToSignals(dataset) {
  const valid = loadOffBallDataset(dataset);
  const groups = new Map();
  valid.players.forEach(p => {
    if (!groups.has(p.sequence)) groups.set(p.sequence, []);
    groups.get(p.sequence).push(p);
  });
  return valid.players.map(p => {
    const peers = groups.get(p.sequence);
    const lowConfidence = peers.length < 8;
    const offBallZ = zscore(p.offBallWorkRate, peers.map(x => x.offBallWorkRate));
    const closingZ = zscore(p.closingRate, peers.map(x => x.closingRate));
    return {
      trackId: p.trackId,
      team: p.team,
      jersey: p.jersey,
      sequence: p.sequence,
      action: p.action,
      offBallSignals: {
        offBallZ,
        closingZ,
        raw: {
          offBallWorkRate: p.offBallWorkRate,
          closingRate: p.closingRate,
          ballDistanceMean: p.ballDistanceMean,
          offBallRatio: p.offBallRatio,
        },
        comparisonGroupSize: peers.length,
        lowConfidence,
        persistence: { value: p.persistence, unvalidated: true, contribution: 0 },
        provenance: 'measured-geometry',
        identityLinked: false,
      },
    };
  });
}

function zscore(value, values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : (value - mean) / sd;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label + ' must be finite');
}

module.exports = { loadOffBallDataset, offBallToSignals };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const players = Array.from({ length: 8 }, (_, i) => ({
    trackId: i, frames: 30, seconds: 1.2, offBallWorkRate: i + 1,
    closingRate: (i + 1) / 100, persistence: i / 10, sequence: 'S1',
    action: 'Shot', provenance: 'measured-geometry',
  }));
  const out = offBallToSignals({ report: {}, players });
  const mean = key => out.reduce((s, p) => s + p.offBallSignals[key], 0) / out.length;
  const sd = key => Math.sqrt(out.reduce((s, p) => s + (p.offBallSignals[key] - mean(key)) ** 2, 0) / out.length);
  assert(Math.abs(mean('offBallZ')) < 1e-12);
  assert(Math.abs(sd('offBallZ') - 1) < 1e-12);
  assert.strictEqual(out[0].offBallSignals.persistence.contribution, 0);
  assert.strictEqual(out[0].offBallSignals.lowConfidence, false);
  assert.deepStrictEqual(offBallToSignals({ report: {}, players }), out);
  assert.throws(() => loadOffBallDataset({}), TypeError);
  console.log('OK within-sequence population z-scores; n=8; persistence contribution=0');
}
