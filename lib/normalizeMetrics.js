function normalizeMetrics(players) {
  if (!players || players.length === 0) return [];
  const metricCount = players[0].rawMetrics.length;
  const mins = new Array(metricCount).fill(Infinity);
  const maxs = new Array(metricCount).fill(-Infinity);
  for (const player of players) {
    for (let i = 0; i < metricCount; i++) {
      const val = player.rawMetrics[i];
      if (val < mins[i]) mins[i] = val;
      if (val > maxs[i]) maxs[i] = val;
    }
  }
  return players.map(player => {
    const normalizedMetrics = new Array(metricCount);
    for (let i = 0; i < metricCount; i++) {
      if (mins[i] === maxs[i]) {
        normalizedMetrics[i] = 50;
      } else {
        normalizedMetrics[i] = ((player.rawMetrics[i] - mins[i]) / (maxs[i] - mins[i])) * 100;
      }
    }
    return { id: player.id, normalizedMetrics };
  });
}
module.exports = { normalizeMetrics };