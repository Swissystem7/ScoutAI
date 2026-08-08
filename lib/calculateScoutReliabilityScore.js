function calculateScoutReliabilityScore(history) {
  if (!Array.isArray(history)) throw new TypeError();
  if (history.length === 0) return 0;
  let sumError = 0;
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    if (typeof entry !== 'object' || entry === null || !('predictedRating' in entry) || !('actualRating' in entry)) {
      throw new TypeError();
    }
    const { predictedRating, actualRating } = entry;
    if (typeof predictedRating !== 'number' || typeof actualRating !== 'number') throw new TypeError();
    if (!Number.isInteger(predictedRating) || !Number.isInteger(actualRating)) throw new TypeError();
    if (predictedRating < 1 || predictedRating > 10 || actualRating < 1 || actualRating > 10) throw new RangeError();
    sumError += Math.abs(predictedRating - actualRating);
  }
  const mae = sumError / history.length;
  const score = 1 - (mae / 9);
  return score;
}
module.exports = { calculateScoutReliabilityScore };