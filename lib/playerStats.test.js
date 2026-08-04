'use strict';

const assert = require('node:assert');
const { playerStats } = require('./playerStats.js');

// Normal case: mixed events, two players, unknown type ignored.
const events = [
  { playerId: 'p1', type: 'goal', minute: 5 },
  { playerId: 'p1', type: 'goal', minute: 20 },
  { playerId: 'p1', type: 'assist', minute: 33 },
  { playerId: 'p1', type: 'shot', minute: 40 },
  { playerId: 'p1', type: 'tackle', minute: 55 },
  { playerId: 'p1', type: 'offside', minute: 60 }, // unknown type -> ignored
  { playerId: 'p2', type: 'goal', minute: 70 },    // other player -> excluded
];
assert.deepStrictEqual(
  playerStats(events, 'p1'),
  { goals: 2, assists: 1, shots: 1, tackles: 1, involvement: 2 * 3 + 1 * 2 + 1 + 1 }
);

// Edge: player with no matching events -> all zeros.
assert.deepStrictEqual(
  playerStats(events, 'ghost'),
  { goals: 0, assists: 0, shots: 0, tackles: 0, involvement: 0 }
);

// Edge: empty events array.
assert.deepStrictEqual(
  playerStats([], 'p1'),
  { goals: 0, assists: 0, shots: 0, tackles: 0, involvement: 0 }
);

// Edge: non-array / missing events argument.
assert.deepStrictEqual(
  playerStats(undefined, 'p1'),
  { goals: 0, assists: 0, shots: 0, tackles: 0, involvement: 0 }
);

// Edge: involvement weighting is exact (2 assists = 4, no goals/shots/tackles).
assert.strictEqual(
  playerStats([{ playerId: 'x', type: 'assist' }, { playerId: 'x', type: 'assist' }], 'x').involvement,
  4
);

console.log('all tests passed');
