'use strict';

function countByPosition(players) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  if (!Array.isArray(players)) return counts;
  for (const p of players) {
    const pos = p && p.position;
    if (Object.prototype.hasOwnProperty.call(counts, pos)) counts[pos]++;
  }
  return counts;
}

module.exports = { countByPosition };
