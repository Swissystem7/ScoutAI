'use strict';

const assert = require('node:assert');
const { percentileRank } = require('./percentileRank.js');

// Normal case: 2 of 5 strictly below 30 -> 40.0
assert.strictEqual(percentileRank([10, 20, 30, 40, 50], 30), 40.0);

// Edge: empty array -> null
assert.strictEqual(percentileRank([], 5), null);

// Edge: strictly below (equal values do NOT count)
assert.strictEqual(percentileRank([50, 50, 50], 50), 0.0);

// Edge: value above all -> 100.0
assert.strictEqual(percentileRank([1, 2, 3], 10), 100.0);

// Edge: value below all -> 0.0
assert.strictEqual(percentileRank([1, 2, 3], 0), 0.0);

// Edge: 1-decimal rounding (1 of 3 -> 33.3)
assert.strictEqual(percentileRank([1, 2, 3], 2), 33.3);

// Edge: single element below
assert.strictEqual(percentileRank([5], 6), 100.0);

console.log('all tests passed');
