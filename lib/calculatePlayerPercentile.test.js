const assert = require('node:assert');
const { calculatePlayerPercentile } = require('./calculatePlayerPercentile.js');

// Normal case
const player = {
  playerId: 'P1',
  position: 'MID',
  age: 25,
  metrics: { distanceCovered: 12, sprints: 30, passCompletion: 85, tackles: 10, goals: 5 }
};
const peers = [
  { position: 'MID', age: 24, metrics: { distanceCovered: 10, sprints: 25, passCompletion: 80, tackles: 8, goals: 3 } },
  { position: 'MID', age: 26, metrics: { distanceCovered: 14, sprints: 35, passCompletion: 90, tackles: 12, goals: 7 } },
  { position: 'MID', age: 25, metrics: { distanceCovered: 11, sprints: 28, passCompletion: 82, tackles: 9, goals: 4 } }
];
const result = calculatePlayerPercentile(player, peers);
assert.strictEqual(result.playerId, 'P1');
assert.ok(result.percentiles.distanceCovered >= 0 && result.percentiles.distanceCovered <= 100);
assert.ok(result.percentiles.sprints >= 0 && result.percentiles.sprints <= 100);
assert.ok(result.percentiles.passCompletion >= 0 && result.percentiles.passCompletion <= 100);
assert.ok(result.percentiles.tackles >= 0 && result.percentiles.tackles <= 100);
assert.ok(result.percentiles.goals >= 0 && result.percentiles.goals <= 100);
assert.ok(typeof result.overallScore === 'number');

// Edge case: missing playerId
assert.deepStrictEqual(calculatePlayerPercentile({ position: 'MID', age: 25, metrics: { distanceCovered: 10, sprints: 20, passCompletion: 80, tackles: 5, goals: 2 } }, peers), { error: 'Missing metric' });

// Edge case: missing metric in metrics
assert.deepStrictEqual(calculatePlayerPercentile({ playerId: 'P2', position: 'MID', age: 25, metrics: { distanceCovered: 10, sprints: 20, passCompletion: 80, tackles: 5 } }, peers), { error: 'Missing metric' });

// Edge case: non-number metric
assert.deepStrictEqual(calculatePlayerPercentile({ playerId: 'P3', position: 'MID', age: 25, metrics: { distanceCovered: '10', sprints: 20, passCompletion: 80, tackles: 5, goals: 2 } }, peers), { error: 'Missing metric' });

// Edge case: insufficient peers
assert.deepStrictEqual(calculatePlayerPercentile({ playerId: 'P4', position: 'GK', age: 30, metrics: { distanceCovered: 5, sprints: 10, passCompletion: 70, tackles: 2, goals: 0 } }, peers), { error: 'Insufficient peers' });

// Edge case: unknown position uses default weights
const unknownPosPlayer = { playerId: 'P5', position: 'UNKNOWN', age: 25, metrics: { distanceCovered: 10, sprints: 20, passCompletion: 80, tackles: 5, goals: 2 } };
const unknownPosPeers = [{ position: 'UNKNOWN', age: 25, metrics: { distanceCovered: 8, sprints: 18, passCompletion: 75, tackles: 4, goals: 1 } }];
const unknownResult = calculatePlayerPercentile(unknownPosPlayer, unknownPosPeers);
assert.strictEqual(unknownResult.playerId, 'P5');
assert.ok(unknownResult.overallScore > 0);

// Edge case: negative metrics clamped to 0
const negativePlayer = { playerId: 'P6', position: 'FWD', age: 22, metrics: { distanceCovered: -5, sprints: 10, passCompletion: 60, tackles: 0, goals: -1 } };
const negativePeers = [{ position: 'FWD', age: 22, metrics: { distanceCovered: 5, sprints: 10, passCompletion: 60, tackles: 0, goals: 1 } }];
const negativeResult = calculatePlayerPercentile(negativePlayer, negativePeers);
assert.strictEqual(negativeResult.percentiles.distanceCovered, 0);
assert.strictEqual(negativeResult.percentiles.goals, 0);

console.log('ok');