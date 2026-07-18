function rankByUndervaluedUpside(players) {
  if (!Array.isArray(players) || players.length === 0) return [];
  return players
    .map(p => {
      const potential = Number.isFinite(p.potentialScore) ? p.potentialScore : 0;
      const current = Number.isFinite(p.currentStatScore) ? p.currentStatScore : 0;
      return {
        id: p.id,
        upsideScore: potential - current,
        potentialScore: potential,
        currentStatScore: current
      };
    })
    .sort((a, b) => b.upsideScore - a.upsideScore);
}
module.exports = { rankByUndervaluedUpside };
