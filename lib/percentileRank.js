'use strict';

// percentileRank(scores, value): percentage (0-100, 1 decimal) of scores
// strictly below `value`. Empty array -> null.
function percentileRank(scores, value) {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  let below = 0;
  for (const s of scores) {
    if (s < value) below++;
  }
  return Math.round((below / scores.length) * 1000) / 10;
}

module.exports = { percentileRank };
