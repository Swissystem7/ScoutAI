function calculatePlayerROI(playerStats, leagueAverages) {
  const ValidationError = class extends Error {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  };

  if (!playerStats || typeof playerStats !== 'object' || !leagueAverages || typeof leagueAverages !== 'object') {
    throw new ValidationError('Missing required stats');
  }
  const requiredStats = ['goals', 'assists', 'passAccuracy', 'age', 'position', 'leagueTier'];
  for (const stat of requiredStats) {
    if (playerStats[stat] === undefined || playerStats[stat] === null ||
        (stat !== 'position' && !Number.isFinite(playerStats[stat]))) {
      throw new ValidationError(`Missing required stat: ${stat}`);
    }
  }

  let { goals, assists, passAccuracy, age, position, leagueTier } = playerStats;
  const averageNames = ['goalsAvg', 'assistsAvg', 'passAccuracyAvg'];
  for (const stat of averageNames) {
    if (!Number.isFinite(leagueAverages[stat])) throw new ValidationError(`Missing required stat: ${stat}`);
  }
  let { goalsAvg, assistsAvg, passAccuracyAvg } = leagueAverages;

  if (age < 5) age = 5;
  if (age > 40) age = 40;
  if (leagueTier < 1) leagueTier = 1;
  if (goals < 0) goals = 0;
  if (assists < 0) assists = 0;
  if (passAccuracy < 0) passAccuracy = 0;
  if (goalsAvg < 0) goalsAvg = 0;
  if (assistsAvg < 0) assistsAvg = 0;
  if (passAccuracyAvg < 0) passAccuracyAvg = 0;

  const validPositions = ['forward', 'midfielder', 'defender', 'goalkeeper'];
  if (!validPositions.includes(position)) {
    console.warn(`Warning: Position "${position}" not recognized, defaulting to 'forward'`);
    position = 'forward';
  }

  if (goals === 0 && assists === 0 && passAccuracy === 0) {
    return { estimatedValue: 0, confidenceInterval: [0, 0], currency: 'EUR' };
  }

  const positionMultipliers = {
    forward: 1.2,
    midfielder: 1.0,
    defender: 0.9,
    goalkeeper: 0.8
  };
  const posMult = positionMultipliers[position];

  const ageFactor = age <= 23 ? 1.5 : age <= 27 ? 1.2 : age <= 30 ? 0.8 : 0.4;
  const tierFactor = 1 + (5 - leagueTier) * 0.15;

  const goalsRatio = goalsAvg > 0 ? goals / goalsAvg : 0;
  const assistsRatio = assistsAvg > 0 ? assists / assistsAvg : 0;
  const passRatio = passAccuracyAvg > 0 ? passAccuracy / passAccuracyAvg : 0;

  const rawValue = (goalsRatio * 0.4 + assistsRatio * 0.3 + passRatio * 0.3) * 1000000;
  const estimatedValue = Math.round(rawValue * posMult * ageFactor * tierFactor);

  const lowerBound = Math.round(estimatedValue * 0.8);
  const upperBound = Math.round(estimatedValue * 1.2);
  const confidenceInterval = [lowerBound, upperBound];

  return { estimatedValue, confidenceInterval, currency: 'EUR' };
}

module.exports = { calculatePlayerROI };
