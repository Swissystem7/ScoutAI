function generateROIReport(scoutAIResults, manualScoutResults) {
  if (!Array.isArray(scoutAIResults) || !Array.isArray(manualScoutResults) || scoutAIResults.length === 0 || manualScoutResults.length === 0) {
    return { error: 'No data' };
  }
  const manualMap = new Map();
  for (const m of manualScoutResults) {
    if (m && typeof m.playerId === 'string') manualMap.set(m.playerId, m.rating);
  }
  const matched = [];
  const unmatchedAI = [];
  for (const s of scoutAIResults) {
    if (!s || typeof s.playerId !== 'string' || !manualMap.has(s.playerId)) {
      unmatchedAI.push(s && s.playerId);
    } else {
      const manualRating = manualMap.get(s.playerId);
      const sRating = Number(s.rating);
      const mRating = Number(manualRating);
      if (Number.isFinite(sRating) && Number.isFinite(mRating)) {
        matched.push({ playerId: s.playerId, scoutRating: sRating, manualRating: mRating });
      }
    }
  }
  const unmatchedManual = [];
  for (const m of manualScoutResults) {
    if (!scoutAIResults.some(s => s.playerId === m.playerId)) {
      unmatchedManual.push(m.playerId);
    }
  }
  if (unmatchedAI.length > 0) {
    console.warn('Unmatched player IDs in scoutAIResults:', unmatchedAI);
  }
  if (unmatchedManual.length > 0) {
    console.warn('Unmatched player IDs in manualScoutResults:', unmatchedManual);
  }
  if (matched.length === 0) {
    return { error: 'Invalid ratings' };
  }
  const totalPlayers = new Set([
    ...scoutAIResults.map(r => r && r.playerId),
    ...manualScoutResults.map(r => r && r.playerId)
  ].filter(id => id !== undefined && id !== null)).size;
  const discrepancies = matched.map(m => ({
    playerId: m.playerId,
    scoutRating: m.scoutRating,
    manualRating: m.manualRating,
    diff: m.scoutRating - m.manualRating
  }));
  let correlationCoefficient = null;
  if (matched.length >= 2) {
    const n = matched.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const m of matched) {
      sumX += m.scoutRating;
      sumY += m.manualRating;
      sumXY += m.scoutRating * m.manualRating;
      sumX2 += m.scoutRating * m.scoutRating;
      sumY2 += m.manualRating * m.manualRating;
    }
    const numerator = n * sumXY - sumX * sumY;
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    correlationCoefficient = denom === 0 ? null : numerator / denom;
  }
  let meanAbsoluteError = null;
  if (matched.length >= 1) {
    let sumAbsDiff = 0;
    for (const m of matched) {
      sumAbsDiff += Math.abs(m.scoutRating - m.manualRating);
    }
    meanAbsoluteError = sumAbsDiff / matched.length;
  }
  return {
    correlationCoefficient,
    meanAbsoluteError,
    matchedPlayers: matched.length,
    totalPlayers,
    discrepancies
  };
}
module.exports = { generateROIReport };
