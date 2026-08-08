function findTopProspects(matchIds, criteria, topN, matchStats) {
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return { prospects: [], totalMatchesProcessed: 0 };
  }
  if (criteria.minAge > criteria.maxAge) {
    return { prospects: [], error: 'Invalid age range' };
  }
  if (!criteria || typeof criteria !== 'object' || !Number.isFinite(criteria.minAge) || !Number.isFinite(criteria.maxAge) || !Number.isInteger(topN) || topN < 0) return { prospects: [], error: 'Invalid criteria' };
  const playerMap = new Map();
  let totalMatchesProcessed = 0;
  for (const matchId of matchIds) {
    const players = matchStats && matchStats[matchId];
    if (!Array.isArray(players)) continue;
    totalMatchesProcessed++;
    for (const p of players) {
      if (!p || !Number.isFinite(p.secondsPlayed) || p.secondsPlayed < 600 || !Number.isFinite(p.age)) continue;
      if (p.age < criteria.minAge || p.age > criteria.maxAge) continue;
      if (p.position !== criteria.position) continue;
      if (!playerMap.has(p.playerId)) {
        playerMap.set(p.playerId, { playerId: p.playerId, primarySum: 0, primaryCount: 0, secondarySum: 0, secondaryCount: 0, count: 0, age: p.age, position: p.position });
      }
      const entry = playerMap.get(p.playerId);
      if (Number.isFinite(p.primaryStat)) { entry.primarySum += p.primaryStat; entry.primaryCount++; }
      if (Number.isFinite(p.secondaryStat)) { entry.secondarySum += p.secondaryStat; entry.secondaryCount++; }
      entry.count++;
    }
  }
  const eligible = [...playerMap.values()];
  const scored = eligible.map(e => {
    const primaryMean = e.primaryCount ? e.primarySum / e.primaryCount : 0;
    const secondaryMean = e.secondaryCount ? e.secondarySum / e.secondaryCount : 0;
    const score = e.primaryCount ? primaryMean : e.secondaryCount ? secondaryMean : 0;
    return { playerId: e.playerId, score, stats: { primaryStat: primaryMean, secondaryStat: secondaryMean, age: e.age, position: e.position } };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = topN >= scored.length ? scored : scored.slice(0, topN);
  const ranked = top.map((p, i) => ({ ...p, rank: i + 1 }));
  return { prospects: ranked, totalMatchesProcessed };
}
module.exports = { findTopProspects };
