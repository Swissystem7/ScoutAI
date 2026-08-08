'use strict';

// playerStats: tally a single player's events.
// involvement = goals*3 + assists*2 + shots + tackles.
// Unknown event types are ignored; missing/empty events yields all-zero stats.
function playerStats(events, playerId) {
  const stats = { goals: 0, assists: 0, shots: 0, tackles: 0, involvement: 0 };
  const bucket = { goal: 'goals', assist: 'assists', shot: 'shots', tackle: 'tackles' };

  if (Array.isArray(events)) {
    for (const e of events) {
      if (!e || e.playerId !== playerId) continue;
      const key = bucket[e.type];
      if (key) stats[key]++;
    }
  }

  stats.involvement = stats.goals * 3 + stats.assists * 2 + stats.shots + stats.tackles;
  return stats;
}

module.exports = { playerStats };
