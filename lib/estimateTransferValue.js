const fs = require('fs');
const path = require('path');

const exchangeRates = {
  EUR: 1,
  GBP: 1.15,
  USD: 0.92,
  JPY: 0.0063,
  BRL: 0.18,
};

function loadStoredComparables() {
  const filePath = path.join(__dirname, 'comparables.json');
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
}

function euclideanSimilarity(statsA, statsB) {
  const keys = Object.keys(statsA);
  let sum = 0;
  for (const key of keys) {
    if (!Number.isFinite(statsA[key]) || !Number.isFinite(statsB[key])) {
      throw new TypeError(`Missing or non-numeric stat key: ${key}`);
    }
    sum += (statsA[key] - statsB[key]) ** 2;
  }
  return 1 / (1 + Math.sqrt(sum));
}

function convertToEUR(amount, currency) {
  const rate = exchangeRates[currency];
  if (!rate) return amount;
  return amount * rate;
}

async function estimateTransferValue(playerStats, comparableTransfers) {
  if (!playerStats || typeof playerStats !== 'object') throw new TypeError('Invalid playerStats');
  if (!comparableTransfers || comparableTransfers.length === 0) {
    comparableTransfers = loadStoredComparables();
  }

  if (!Array.isArray(comparableTransfers) || comparableTransfers.length < 3) {
    return {
      estimatedValue: null,
      confidenceInterval: null,
      topComparables: [],
      error: 'data',
    };
  }

  const requiredKeys = ['goals', 'assists', 'passAccuracy'];
  for (const key of requiredKeys) {
    if (!Number.isFinite(playerStats[key])) {
      throw new TypeError(`Missing or invalid stat key: ${key}`);
    }
  }

  const comparablesWithSimilarity = comparableTransfers.map((comp) => {
    if (!comp || !comp.stats || !Number.isFinite(comp.transferFee)) throw new TypeError('Invalid comparable transfer');
    const similarity = euclideanSimilarity(playerStats, comp.stats);
    const feeInEUR = convertToEUR(comp.transferFee, comp.currency || 'EUR');
    return {
      playerName: comp.playerName || 'Unknown',
      transferFee: feeInEUR,
      similarityScore: similarity,
      age: Number.isFinite(comp.stats.age) ? comp.stats.age : null,
    };
  });

  comparablesWithSimilarity.sort((a, b) => b.similarityScore - a.similarityScore);
  const topComparables = comparablesWithSimilarity.slice(0, 5);

  const ages = comparablesWithSimilarity.map((c) => c.age).filter((a) => a !== null);
  let lowConfidence = false;
  if (ages.length > 0 && playerStats.age !== undefined) {
    const mean = ages.reduce((s, a) => s + a, 0) / ages.length;
    const variance = ages.reduce((s, a) => s + (a - mean) ** 2, 0) / ages.length;
    const std = Math.sqrt(variance);
    lowConfidence = std === 0 ? playerStats.age !== mean : Math.abs(playerStats.age - mean) > 3 * std;
  }

  const weightedSum = topComparables.reduce((sum, c) => sum + c.transferFee * c.similarityScore, 0);
  const totalWeight = topComparables.reduce((sum, c) => sum + c.similarityScore, 0);
  const estimatedValue = totalWeight > 0 ? weightedSum / totalWeight : null;

  let confidenceInterval = null;
  if (estimatedValue !== null && topComparables.length >= 3 && !lowConfidence) {
    const fees = topComparables.map((c) => c.transferFee);
    const meanFee = fees.reduce((s, f) => s + f, 0) / fees.length;
    const variance = fees.reduce((s, f) => s + (f - meanFee) ** 2, 0) / fees.length;
    const std = Math.sqrt(variance);
    const margin = 1.96 * (std / Math.sqrt(fees.length));
    confidenceInterval = [estimatedValue - margin, estimatedValue + margin];
  }

  return {
    estimatedValue,
    confidenceInterval,
    topComparables: topComparables.map(({playerName,transferFee,similarityScore}) => ({playerName,transferFee,similarityScore})),
  };
}

module.exports = { estimateTransferValue };
