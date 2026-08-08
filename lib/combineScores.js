function combineScores(statScore, bodyLangScore, weights) {
  const s = typeof statScore === 'number' && isFinite(statScore) ? statScore : 0;
  const b = typeof bodyLangScore === 'number' && isFinite(bodyLangScore) ? bodyLangScore : 0;
  let wStat = 0.5, wBody = 0.5;
  if (weights && typeof weights.stat === 'number' && typeof weights.bodyLang === 'number') {
    const sum = weights.stat + weights.bodyLang;
    if (sum > 0) {
      wStat = weights.stat / sum;
      wBody = weights.bodyLang / sum;
    }
  }
  const result = s * wStat + b * wBody;
  return Math.min(100, Math.max(0, result));
}
module.exports = { combineScores };