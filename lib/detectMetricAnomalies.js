function detectMetricAnomalies({ playerId, matchReports, zScoreThreshold = 3 }) {
  if (!Array.isArray(matchReports) || matchReports.length < 3) return [];
  const threshold = Number.isFinite(zScoreThreshold) && zScoreThreshold > 0 ? zScoreThreshold : 3;
  const metricKeys = new Set();
  for (const report of matchReports) {
    if (report.metrics) {
      Object.keys(report.metrics).forEach(k => metricKeys.add(k));
    }
  }
  const validMetrics = [];
  for (const key of metricKeys) {
    const values = matchReports.map(r => r.metrics ? r.metrics[key] : undefined);
    if (values.some(v => !Number.isFinite(v))) continue;
    validMetrics.push(key);
  }
  const anomalies = [];
  for (const metricName of validMetrics) {
    const values = matchReports.map(r => r.metrics[metricName]);
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    for (let i = 0; i < n; i++) {
      const zScore = (values[i] - mean) / std;
      if (Math.abs(zScore) > threshold) {
        anomalies.push({
          matchId: matchReports[i].matchId,
          metricName,
          value: values[i],
          zScore: Math.round(zScore * 100) / 100
        });
      }
    }
  }
  return anomalies;
}
module.exports = { detectMetricAnomalies };
