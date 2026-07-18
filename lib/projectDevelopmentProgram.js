function projectDevelopmentProgram(trajectory) {
  if (!trajectory || trajectory.length === 0) {
    return { phases: [] };
  }
  const metricKeys = Object.keys(trajectory[0].metrics);
  const averages = {};
  for (const key of metricKeys) {
    let sum = 0;
    for (const season of trajectory) {
      sum += season.metrics[key];
    }
    averages[key] = sum / trajectory.length;
  }
  const sorted = metricKeys.sort((a, b) => averages[a] - averages[b]);
  const focusAreas = [sorted[0], sorted[1]];
  const phases = [
    { name: 'Off-Season', duration: '8 weeks', focusAreas: focusAreas, intensity: 'high' },
    { name: 'Pre-Season', duration: '4 weeks', focusAreas: focusAreas, intensity: 'medium' },
    { name: 'In-Season', duration: '16 weeks', focusAreas: focusAreas, intensity: 'low' },
    { name: 'Recovery', duration: '2 weeks', focusAreas: focusAreas, intensity: 'low' }
  ];
  return { phases: phases };
}
module.exports = { projectDevelopmentProgram };