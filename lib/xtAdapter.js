'use strict';

/** Validate and defensively copy a socceraction xT dataset. */
function loadXtDataset(json) {
  const data = typeof json === 'string' ? parse(json) : json;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('xT dataset must be an object');
  if (typeof data.source !== 'string' || !data.source || data.measured !== true) throw new TypeError('xT dataset requires measured source provenance');
  for (const key of ['competitionId', 'seasonId', 'games', 'totalActions', 'playerCount']) finite(data[key], key);
  if (!Array.isArray(data.players) || data.players.length !== data.playerCount) throw new TypeError('players must match playerCount');
  data.players.forEach((p, i) => {
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name) throw new TypeError('invalid player at index ' + i);
    ['playerId', 'teamId', 'minutes', 'xtTotal', 'xtActions', 'xtPerAction'].forEach(k => finite(p[k], `players[${i}].${k}`));
    if (p.xtPer90 !== null) finite(p.xtPer90, `players[${i}].xtPer90`);
  });
  return JSON.parse(JSON.stringify(data));
}

function parse(text) { try { return JSON.parse(text); } catch (_) { throw new TypeError('xT dataset must be valid JSON'); } }
function finite(v, label) { if (!Number.isFinite(v)) throw new TypeError(label + ' must be finite'); }

/**
 * Convert xT rows to PlayerSignal records. actionValueScore uses the empirical
 * percentile (midrank for ties) of xtTotal. Percentiles are deterministic,
 * robust to outliers, and preserve the tournament-wide ordering without using
 * player identity. The minimum maps to 0 and maximum to 100.
 */
function xtToSignals(dataset, opts = {}) {
  const data = loadXtDataset(dataset);
  const values = data.players.map(p => p.xtTotal).sort((a, b) => a - b);
  const ranks = new Map();
  for (let i = 0; i < values.length;) {
    let j = i + 1;
    while (j < values.length && values[j] === values[i]) j++;
    ranks.set(values[i], values.length === 1 ? 100 : ((i + j - 1) / 2) / (values.length - 1) * 100);
    i = j;
  }
  return data.players.map(p => ({
    id: 'xt-' + p.playerId,
    name: p.name,
    source: 'stats',
    league: opts.league || 'World Cup 2018',
    leagueStrength: Number.isFinite(opts.leagueStrength) ? opts.leagueStrength : 1,
    minutes: p.minutes,
    statScore: round2(ranks.get(p.xtTotal)),
    statMetrics: {
      xtTotal: p.xtTotal, xtActions: p.xtActions, xtPerAction: p.xtPerAction,
      xtPer90: p.xtPer90, actionValueScore: round2(ranks.get(p.xtTotal)),
      actionValueProvenance: { measured: true, model: data.source },
    },
  }));
}

function round2(x) { return Math.round(x * 100) / 100; }
module.exports = { loadXtDataset, xtToSignals };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const fixture = { source: 'socceraction test', competitionId: 1, seasonId: 2, games: 1, totalActions: 3, playerCount: 3, measured: true, players: [
    { playerId: 1, name: 'A', teamId: 1, minutes: 90, xtTotal: 2, xtActions: 2, xtPerAction: 1, xtPer90: 2 },
    { playerId: 2, name: 'B', teamId: 1, minutes: 90, xtTotal: 1, xtActions: 2, xtPerAction: .5, xtPer90: 1 },
    { playerId: 3, name: 'C', teamId: 1, minutes: 0, xtTotal: 1, xtActions: 2, xtPerAction: .5, xtPer90: null },
  ] };
  const signals = xtToSignals(fixture);
  assert.deepStrictEqual(signals.map(x => x.statMetrics.actionValueScore), [100, 25, 25]);
  assert(signals.every(x => x.statMetrics.actionValueProvenance.measured));
  assert.deepStrictEqual(xtToSignals(fixture), signals);
  assert.throws(() => loadXtDataset({}), TypeError);
  console.log('OK xT adapter; percentile-midrank normalization; deterministic');
}
