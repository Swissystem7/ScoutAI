function calculateROI(config, usageData) {
  if (!config || typeof config !== 'object') throw new TypeError('Invalid config');
  if (!usageData || typeof usageData !== 'object') throw new TypeError('Invalid usageData');
  const requiredConfig = ['scoutHourlyRate', 'aiCostPerMatch', 'hoursPerMatchHuman', 'matchesPerMonth'];
  const requiredUsage = ['totalMatches', 'aiAccuracy', 'humanAccuracy'];
  for (const field of requiredConfig) {
    if (!(field in config)) throw new TypeError(`Missing config field: ${field}`);
  }
  for (const field of requiredUsage) {
    if (!(field in usageData)) throw new TypeError(`Missing usageData field: ${field}`);
  }
  const { scoutHourlyRate, aiCostPerMatch, hoursPerMatchHuman, matchesPerMonth } = config;
  const { totalMatches, aiAccuracy, humanAccuracy } = usageData;
  if (![scoutHourlyRate, aiCostPerMatch, hoursPerMatchHuman, matchesPerMonth].every(Number.isFinite) || scoutHourlyRate <= 0 || aiCostPerMatch <= 0 || hoursPerMatchHuman <= 0 || matchesPerMonth <= 0) {
    throw new RangeError('Rates and hours must be positive');
  }
  if (![totalMatches, aiAccuracy, humanAccuracy].every(Number.isFinite) || totalMatches < 0 || aiAccuracy < 0 || aiAccuracy > 1 || humanAccuracy < 0 || humanAccuracy > 1) {
    throw new RangeError('Accuracy must be between 0 and 1');
  }
  const humanCostPerMatch = scoutHourlyRate * hoursPerMatchHuman;
  const costSavings = totalMatches === 0 ? 0 : Math.round((humanCostPerMatch - aiCostPerMatch) * totalMatches * 100) / 100;
  const timeSavings = totalMatches === 0 ? 0 : Math.round(hoursPerMatchHuman * totalMatches * 100) / 100;
  const accuracyImprovement = Math.round((aiAccuracy - humanAccuracy) * 100) / 100;
  const breakEvenMatches = totalMatches === 0 || aiCostPerMatch >= humanCostPerMatch ? 0 : Math.ceil(aiCostPerMatch / (humanCostPerMatch - aiCostPerMatch));
  let recommendation;
  if (totalMatches === 0) {
    recommendation = 'No matches to evaluate';
  } else if (costSavings > 0 && accuracyImprovement >= 0) {
    recommendation = 'Strongly recommend AI adoption';
  } else if (costSavings > 0 && accuracyImprovement < 0) {
    recommendation = 'Consider AI for cost savings, but monitor accuracy';
  } else if (costSavings <= 0 && accuracyImprovement > 0) {
    recommendation = 'Consider AI for accuracy improvement, but evaluate cost';
  } else {
    recommendation = 'AI not recommended under current conditions';
  }
  return {
    costSavings,
    timeSavings,
    accuracyImprovement,
    breakEvenMatches,
    recommendation
  };
}
module.exports = { calculateROI };
