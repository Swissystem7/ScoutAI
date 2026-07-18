function computePlayerValueIndex(playerStats, benchmarks, ageGroup) {
  const validAgeGroups = ['U12', 'U14', 'U16', 'U18', 'U20'];
  if (!validAgeGroups.includes(ageGroup)) {
    throw new Error('Invalid ageGroup');
  }
  const stats = {
    goals: Number.isFinite(playerStats.goals) ? playerStats.goals : 0,
    assists: Number.isFinite(playerStats.assists) ? playerStats.assists : 0,
    passesCompleted: Number.isFinite(playerStats.passesCompleted) ? playerStats.passesCompleted : 0,
    keyPasses: Number.isFinite(playerStats.keyPasses) ? playerStats.keyPasses : 0,
    dribbles: Number.isFinite(playerStats.dribbles) ? playerStats.dribbles : 0,
    speed90thPercentile: Number.isFinite(playerStats.speed90thPercentile) ? playerStats.speed90thPercentile : 0,
    defensiveActions: Number.isFinite(playerStats.defensiveActions) ? playerStats.defensiveActions : 0
  };
  const bench = {
    goalsAvg: benchmarks.goalsAvg,
    assistsAvg: benchmarks.assistsAvg,
    passesCompletedAvg: benchmarks.passesCompletedAvg,
    keyPassesAvg: benchmarks.keyPassesAvg,
    dribblesAvg: benchmarks.dribblesAvg,
    speed90thPercentileAvg: benchmarks.speed90thPercentileAvg,
    defensiveActionsAvg: benchmarks.defensiveActionsAvg
  };
  for (const key in bench) {
    if (!Number.isFinite(bench[key]) || bench[key] <= 0) {
      throw new Error('Benchmark cannot be zero');
    }
  }
  const ratios = [
    stats.goals / bench.goalsAvg,
    stats.assists / bench.assistsAvg,
    stats.passesCompleted / bench.passesCompletedAvg,
    stats.keyPasses / bench.keyPassesAvg,
    stats.dribbles / bench.dribblesAvg,
    stats.speed90thPercentile / bench.speed90thPercentileAvg,
    stats.defensiveActions / bench.defensiveActionsAvg
  ];
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const index = Math.min(100, Math.max(0, avgRatio * 50));
  return Math.round(index * 100) / 100;
}
module.exports = { computePlayerValueIndex };
