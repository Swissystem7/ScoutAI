function scoutROIAnalyzer(aiEvents, humanEvents, scoutHourlyRate) {
  const safeRate = Number.isFinite(scoutHourlyRate) ? Math.max(0, scoutHourlyRate) : 0;
  const humanLen = humanEvents.length;
  const aiLen = aiEvents.length;
  const hoursSaved = Math.max(0, humanLen / 200 - aiLen / 2000);
  const costSaved = hoursSaved * safeRate;
  let matched = 0;
  const humanMap = new Map();
  for (let i = 0; i < humanLen; i++) {
    const h = humanEvents[i];
    const key = JSON.stringify([h.playerId, h.action]);
    if (!humanMap.has(key)) humanMap.set(key, []);
    humanMap.get(key).push(h.time);
  }
  for (let i = 0; i < aiLen; i++) {
    const a = aiEvents[i];
    const key = JSON.stringify([a.playerId, a.action]);
    const times = humanMap.get(key);
    if (times) {
      for (let j = 0; j < times.length; j++) {
        if (Math.abs(a.time - times[j]) <= 2) {
          matched++;
          times.splice(j, 1);
          break;
        }
      }
    }
  }
  const agreementRate = humanLen > 0 ? matched / humanLen : 0;
  const totalManualClicksSaved = humanLen * 3;
  return {
    hoursSaved: hoursSaved,
    costSaved: costSaved,
    agreementRate: agreementRate,
    totalManualClicksSaved: totalManualClicksSaved
  };
}
module.exports = { scoutROIAnalyzer };
