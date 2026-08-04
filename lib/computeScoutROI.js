function computeScoutROI(scoutAICostPerMatch, humanScoutCostPerMatch, matchesPerSeason, expectedLeadsPerMatch, conversionRate, averagePlayerSaleValue) {
  if (!Number.isFinite(scoutAICostPerMatch) || !Number.isFinite(humanScoutCostPerMatch) || scoutAICostPerMatch <= 0 || humanScoutCostPerMatch <= 0) {
    throw new Error('Cost cannot be zero');
  }
  if (!Number.isFinite(conversionRate) || conversionRate < 0 || conversionRate > 1) {
    throw new Error('Conversion rate out of range');
  }
  if (matchesPerSeason < 1) {
    throw new Error('Matches per season must be at least 1');
  }
  const leadsPerMatch = expectedLeadsPerMatch < 0 ? 0 : expectedLeadsPerMatch;
  const avgSaleValue = averagePlayerSaleValue < 0 ? 0 : averagePlayerSaleValue;
  const totalScoutAICost = scoutAICostPerMatch * matchesPerSeason;
  const totalHumanCost = humanScoutCostPerMatch * matchesPerSeason;
  const savings = totalHumanCost - totalScoutAICost;
  const leadsGenerated = leadsPerMatch * matchesPerSeason;
  const expectedSales = Math.floor(leadsGenerated * conversionRate);
  const expectedRevenue = expectedSales * avgSaleValue;
  let netROI = ((expectedRevenue + savings) / totalScoutAICost) * 100;
  if (netROI < 0) netROI = 0;
  netROI = Math.round(netROI * 100) / 100;
  return {
    totalScoutAICost,
    totalHumanCost,
    savings,
    leadsGenerated,
    expectedSales,
    expectedRevenue,
    netROI
  };
}
module.exports = { computeScoutROI };
