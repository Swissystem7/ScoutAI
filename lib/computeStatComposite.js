function computeStatComposite(stats) {
  if (!Array.isArray(stats) || stats.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < stats.length; i++) {
    const val = stats[i];
    if (typeof val === 'number' && isFinite(val)) {
      sum += val;
    }
  }
  const avg = sum / stats.length;
  if (avg < 0) return 0;
  if (avg > 100) return 100;
  return avg;
}
module.exports = { computeStatComposite };
