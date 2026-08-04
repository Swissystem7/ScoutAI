function estimatePlayerValue(playerData, matchStats, referenceMarketData) {
  if (!playerData || !matchStats || !referenceMarketData) {
    return { value: 0, confidence: 0, factors: { error: 'Invalid input' } };
  }
  const { playerId, age, position, clubId } = playerData;
  const { matchesPlayed, goals, assists, defensiveActions, keyPasses, dribblesCompleted, minutesPlayed } = matchStats;
  if (
    typeof playerId !== 'string' || typeof clubId !== 'string' ||
    typeof age !== 'number' || age < 0 || !Number.isFinite(age) ||
    typeof position !== 'string' ||
    typeof matchesPlayed !== 'number' || matchesPlayed < 0 || !Number.isFinite(matchesPlayed) ||
    typeof goals !== 'number' || goals < 0 || !Number.isFinite(goals) ||
    typeof assists !== 'number' || assists < 0 || !Number.isFinite(assists) ||
    typeof defensiveActions !== 'number' || defensiveActions < 0 || !Number.isFinite(defensiveActions) ||
    typeof keyPasses !== 'number' || keyPasses < 0 || !Number.isFinite(keyPasses) ||
    typeof dribblesCompleted !== 'number' || dribblesCompleted < 0 || !Number.isFinite(dribblesCompleted) ||
    typeof minutesPlayed !== 'number' || minutesPlayed < 0 || !Number.isFinite(minutesPlayed)
  ) {
    return { value: 0, confidence: 0, factors: { error: 'Invalid input' } };
  }
  const { positionStats, transferHistory } = referenceMarketData;
  if (!positionStats || typeof positionStats !== 'object') {
    return { value: 0, confidence: 0, factors: { error: 'Invalid input' } };
  }
  let posStats = positionStats[position];
  if (!posStats) {
    const allPositions = Object.keys(positionStats);
    if (allPositions.length === 0) {
      return { value: 0, confidence: 0, factors: { error: 'Invalid input' } };
    }
    let avgMarketValue = 0, stdMarketValue = 0, ageCoefficient = 0, performanceWeight = 0;
    for (const p of allPositions) {
      const s = positionStats[p];
      avgMarketValue += s.avgMarketValue;
      stdMarketValue += s.stdMarketValue;
      ageCoefficient += s.ageCoefficient;
      performanceWeight += s.performanceWeight;
    }
    const n = allPositions.length;
    posStats = {
      avgMarketValue: avgMarketValue / n,
      stdMarketValue: stdMarketValue / n,
      ageCoefficient: ageCoefficient / n,
      performanceWeight: performanceWeight / n
    };
  }
  const { avgMarketValue, stdMarketValue, ageCoefficient, performanceWeight } = posStats;
  if (![avgMarketValue, stdMarketValue, ageCoefficient, performanceWeight].every(Number.isFinite) || avgMarketValue < 0 || stdMarketValue < 0) {
    return { value: 0, confidence: 0, factors: { error: 'Invalid input' } };
  }
  const ageFactor = Math.exp(-ageCoefficient * (age - 22));
  const perfPerMatch = matchesPlayed > 0 ? (goals + assists + defensiveActions + keyPasses + dribblesCompleted) / matchesPlayed : 0;
  const perfScore = perfPerMatch * performanceWeight;
  let baseValue = avgMarketValue * ageFactor * (1 + perfScore);
  if (transferHistory && Array.isArray(transferHistory) && transferHistory.length > 0) {
    const relevantTransfers = transferHistory.filter(t => t && t.position === position && Number.isFinite(t.age) && Number.isFinite(t.value) && t.value >= 0 && t.age >= age - 3 && t.age <= age + 3);
    if (relevantTransfers.length > 0) {
      const values = relevantTransfers.map(t => t.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const zScore = (baseValue - mean) / (std || 1);
      baseValue = mean + zScore * std * 0.5;
      const nTransfers = relevantTransfers.length;
      const confidenceFromTransfers = Math.min(1, nTransfers / 10);
      const confidenceFromStats = stdMarketValue > 0 ? Math.min(1, 1 / (1 + stdMarketValue / avgMarketValue)) : 0.5;
      const confidence = (confidenceFromTransfers * 0.7 + confidenceFromStats * 0.3);
      const factors = {
        baseMarketValue: avgMarketValue,
        ageFactor: ageFactor,
        performanceScore: perfScore,
        transferComparables: relevantTransfers.length,
        method: 'hybrid'
      };
      const finalValue = Math.max(0, baseValue);
      return { value: finalValue, confidence: Math.min(1, Math.max(0, confidence)), factors };
    }
  }
  const confidence = stdMarketValue > 0 ? Math.min(1, 1 / (1 + stdMarketValue / avgMarketValue)) : 0.5;
  const factors = {
    baseMarketValue: avgMarketValue,
    ageFactor: ageFactor,
    performanceScore: perfScore,
    method: 'positionStats'
  };
  const finalValue = Math.max(0, baseValue);
  return { value: finalValue, confidence: Math.min(1, Math.max(0, confidence)), factors };
}
module.exports = { estimatePlayerValue };
