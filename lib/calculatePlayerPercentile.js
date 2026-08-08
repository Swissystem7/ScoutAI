function calculatePlayerPercentile(playerMetrics, peerDatabase) {
  const requiredMetrics = ['distanceCovered', 'sprints', 'passCompletion', 'tackles', 'goals'];
  const requiredPlayerKeys = ['playerId', 'position', 'age', 'metrics'];
  for (const key of requiredPlayerKeys) {
    if (!(key in playerMetrics)) return { error: 'Missing metric' };
  }
  for (const metric of requiredMetrics) {
    if (!(metric in playerMetrics.metrics) || typeof playerMetrics.metrics[metric] !== 'number') return { error: 'Missing metric' };
  }
  const positionWeights = {
    'GK': { distanceCovered: 0.05, sprints: 0.05, passCompletion: 0.3, tackles: 0.1, goals: 0.5 },
    'DEF': { distanceCovered: 0.2, sprints: 0.15, passCompletion: 0.2, tackles: 0.35, goals: 0.1 },
    'MID': { distanceCovered: 0.25, sprints: 0.2, passCompletion: 0.3, tackles: 0.15, goals: 0.1 },
    'FWD': { distanceCovered: 0.15, sprints: 0.2, passCompletion: 0.15, tackles: 0.05, goals: 0.45 }
  };
  const pos = playerMetrics.position;
  const weights = positionWeights[pos] || { distanceCovered: 0.2, sprints: 0.2, passCompletion: 0.2, tackles: 0.2, goals: 0.2 };
  const age = playerMetrics.age;
  const ageMin = age - 2;
  const ageMax = age + 2;
  const peers = peerDatabase.filter(p => p.position === pos && p.age >= ageMin && p.age <= ageMax);
  if (peers.length === 0) return { error: 'Insufficient peers' };
  const clampedMetrics = {};
  for (const metric of requiredMetrics) {
    clampedMetrics[metric] = Math.max(0, playerMetrics.metrics[metric]);
  }
  const percentiles = {};
  for (const metric of requiredMetrics) {
    const values = peers.map(p => Math.max(0, p.metrics[metric] || 0));
    const playerVal = clampedMetrics[metric];
    const countLess = values.filter(v => v < playerVal).length;
    const countEqual = values.filter(v => v === playerVal).length;
    const percentile = (countLess + 0.5 * countEqual) / values.length * 100;
    percentiles[metric] = Math.min(100, Math.max(0, percentile));
  }
  let overallScore = 0;
  for (const metric of requiredMetrics) {
    overallScore += percentiles[metric] * weights[metric];
  }
  return {
    playerId: playerMetrics.playerId,
    percentiles: percentiles,
    overallScore: overallScore
  };
}
module.exports = { calculatePlayerPercentile };