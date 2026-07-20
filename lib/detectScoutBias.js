function detectScoutBias(metrics, referenceDistribution, options = {}) {
  const significanceLevel = Number.isFinite(options.significanceLevel) && options.significanceLevel > 0 && options.significanceLevel < 1 ? options.significanceLevel : 0.05;
  const minSampleSize = Number.isInteger(options.minSampleSize) && options.minSampleSize > 0 ? options.minSampleSize : 5;
  const biasedAttributes = [];
  const warnings = [];
  if (!metrics || metrics.length === 0) {
    return { biasedAttributes: [], warnings: ['No metrics provided'] };
  }
  const attributeGroups = new Map();
  for (const m of metrics) {
    if (!m || typeof m.attribute !== 'string' || !Number.isFinite(m.value)) continue;
    if (!attributeGroups.has(m.attribute)) attributeGroups.set(m.attribute, []);
    attributeGroups.get(m.attribute).push(m.value);
  }
  for (const [attr, values] of attributeGroups) {
    if (!referenceDistribution || !Object.prototype.hasOwnProperty.call(referenceDistribution, attr)) {
      warnings.push('No reference for ' + attr);
      continue;
    }
    const ref = referenceDistribution[attr];
    if (!Number.isFinite(ref.mean) || !Number.isFinite(ref.stdDev) || ref.stdDev === 0) {
      warnings.push('Attribute ' + attr + ' has zero variance in reference');
      continue;
    }
    if (values.length < minSampleSize) {
      warnings.push('Insufficient sample for ' + attr);
      continue;
    }
    const sampleMean = values.reduce((a, b) => a + b, 0) / values.length;
    const zScore = (sampleMean - ref.mean) / (ref.stdDev / Math.sqrt(values.length));
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
    if (Math.abs(zScore) > getCriticalZ(significanceLevel)) {
      const direction = sampleMean > ref.mean ? 'over' : 'under';
      biasedAttributes.push({
        attribute: attr,
        zScore: zScore,
        pValue: pValue,
        direction: direction,
        warning: 'Attribute ' + attr + ' shows significant bias (p=' + pValue.toFixed(3) + ')'
      });
    }
  }
  return { biasedAttributes: biasedAttributes, warnings: warnings };
}
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
function getCriticalZ(alpha) {
  const twoTailed = alpha / 2;
  const z = 1 - twoTailed;
  const a1 = 2.50662823884;
  const a2 = -18.61500062529;
  const a3 = 41.39119773534;
  const a4 = -25.44106049637;
  const b1 = -8.4735109309;
  const b2 = 23.08336743743;
  const b3 = -21.06224101826;
  const b4 = 3.13082909833;
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  if (z < 0.5) return -getCriticalZ(1 - alpha);
  if (z === 0.5) return 0;
  const t = Math.sqrt(-2 * Math.log(1 - z));
  const x = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return x;
}
module.exports = { detectScoutBias };
