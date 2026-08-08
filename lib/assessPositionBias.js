function assessPositionBias(playerRecords) {
  const biasByPosition = {};
  const threshold = 0.5;
  const alpha = 0.05;
  let totalHuman = 0;
  let totalAI = 0;
  let humanCount = 0;
  let aiCount = 0;

  if (!playerRecords || playerRecords.length === 0) {
    return { biasByPosition: {}, chiSqPValue: null, flaggedPositions: [] };
  }

  for (const rec of playerRecords) {
    const pos = rec.position;
    if (!biasByPosition[pos]) {
      biasByPosition[pos] = { sumDelta: 0, count: 0, baselineCount: 0, humanSum: 0, aiSum: 0 };
    }
    if (rec.humanRating !== undefined && rec.humanRating !== null) {
      const delta = rec.aiRating - rec.humanRating;
      biasByPosition[pos].sumDelta += delta;
      biasByPosition[pos].humanSum += rec.humanRating;
      biasByPosition[pos].aiSum += rec.aiRating;
      biasByPosition[pos].count++;
      biasByPosition[pos].baselineCount++;
      totalHuman += rec.humanRating;
      totalAI += rec.aiRating;
      humanCount++;
      aiCount++;
    } else {
      biasByPosition[pos].count++;
      biasByPosition[pos].aiSum += rec.aiRating;
      totalAI += rec.aiRating;
      aiCount++;
    }
  }

  const resultBias = {};
  for (const pos in biasByPosition) {
    const data = biasByPosition[pos];
    resultBias[pos] = {
      meanDelta: data.baselineCount > 0 ? data.sumDelta / data.baselineCount : 0,
      count: data.count
    };
  }

  if (humanCount === 0) {
    return { biasByPosition: resultBias, chiSqPValue: null, flaggedPositions: [] };
  }

  const positions = Object.keys(biasByPosition).filter(p => biasByPosition[p].count >= 3);
  if (positions.length <= 1) {
    return { biasByPosition: resultBias, chiSqPValue: null, flaggedPositions: [] };
  }

  let chiSq = 0;
  const totalObs = positions.reduce((sum, pos) => sum + biasByPosition[pos].aiSum, 0);
  const totalExp = positions.reduce((sum, pos) => sum + biasByPosition[pos].humanSum, 0);
  if (totalExp === 0) {
    return { biasByPosition: resultBias, chiSqPValue: null, flaggedPositions: [] };
  }

  for (const pos of positions) {
    const data = biasByPosition[pos];
    const observed = data.aiSum;
    const expected = (data.humanSum / totalExp) * totalObs;
    if (expected > 0) {
      chiSq += Math.pow(observed - expected, 2) / expected;
    }
  }

  const df = positions.length - 1;
  let pValue = null;
  if (df > 0 && chiSq >= 0) {
    pValue = 1 - chiSquaredCDF(chiSq, df);
  }

  const flaggedPositions = [];
  for (const pos in resultBias) {
    if (Math.abs(resultBias[pos].meanDelta) > threshold) {
      if (pValue !== null && pValue < alpha) {
        flaggedPositions.push(pos);
      }
    }
  }

  return { biasByPosition: resultBias, chiSqPValue: pValue, flaggedPositions };
}

function chiSquaredCDF(x, k) {
  if (x <= 0) return 0;
  return regularizedGammaP(k / 2, x / 2);
}

function regularizedGammaP(a, x) {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  const gln = lgamma(a);
  if (x >= a + 1) {
    let b = x + 1 - a, c = 1 / Number.EPSILON, d = 1 / b, h = d;
    for (let i = 1; i <= 100; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < Number.EPSILON) d = Number.EPSILON;
      c = b + an / c; if (Math.abs(c) < Number.EPSILON) c = Number.EPSILON;
      d = 1 / d;
      const delta = d * c; h *= delta;
      if (Math.abs(delta - 1) < 1e-7) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= 100; n++) {
    ap++;
    del = del * (x / ap);
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-7) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

function lgamma(z) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = z;
  let x = z;
  let tmp = x + 5.5;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y++;
    ser += cof[j] / y;
  }
  return tmp + Math.log(2.5066282746310005 * ser / x);
}

module.exports = { assessPositionBias };
