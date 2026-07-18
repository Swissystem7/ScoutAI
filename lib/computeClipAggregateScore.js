function computeClipAggregateScore(clips, weights) {
  if (!clips || clips.length === 0) return 0;
  const defaultWeights = { sprintRecovery: 0.2, offBallMovement: 0.2, reactionTime: 0.2, aggression: 0.2, facialIntensity: 0.2 };
  const w = weights || defaultWeights;
  const features = ['sprintRecovery', 'offBallMovement', 'reactionTime', 'aggression', 'facialIntensity'];
  let total = 0;
  for (let i = 0; i < clips.length; i++) {
    let sum = 0;
    for (let j = 0; j < features.length; j++) {
      const f = features[j];
      const val = Number.isFinite(clips[i][f]) ? clips[i][f] : 0;
      sum += w[f] * Math.min(100, Math.max(0, val));
    }
    total += sum;
  }
  return total / clips.length;
}
module.exports = { computeClipAggregateScore };
