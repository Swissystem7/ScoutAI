function verifyPlayerIdentityConsistency(detections, options = {}) {
  const iouThreshold = Number.isFinite(options.iouThreshold) ? Math.max(0, Math.min(1, options.iouThreshold)) : 0.5;
  const histogramSimilarityThreshold = Number.isFinite(options.histogramSimilarityThreshold) ? Math.max(0, Math.min(1, options.histogramSimilarityThreshold)) : 0.7;
  if (!Array.isArray(detections) || detections.length === 0) {
    return { confirmedIdentities: [], warnings: [] };
  }
  if (detections.length === 1) {
    return {
      confirmedIdentities: [{ playerId: detections[0].playerId, consistentFrames: 1, totalFrames: 1, confidence: 1.0 }],
      warnings: []
    };
  }
  const sorted = [...detections].sort((a, b) => a.frameIndex - b.frameIndex);
  const playerGroups = new Map();
  for (const d of sorted) {
    if (!d || !Array.isArray(d.bbox) || d.bbox.length !== 4 || !d.bbox.every(Number.isFinite)) continue;
    if (!playerGroups.has(d.playerId)) playerGroups.set(d.playerId, []);
    playerGroups.get(d.playerId).push(d);
  }
  const warnings = [];
  const confirmedIdentities = [];
  for (const [playerId, frames] of playerGroups) {
    let consistentCount = 1;
    let totalCount = frames.length;
    let confidenceSum = 0;
    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i - 1];
      const curr = frames[i];
      const iou = computeIoU(prev.bbox, curr.bbox);
      let match = iou >= iouThreshold;
      const hasAppearance = Array.isArray(curr.jerseyColorHistogram) && Array.isArray(prev.jerseyColorHistogram);
      if (hasAppearance) {
        const histSim = cosineSimilarity(curr.jerseyColorHistogram, prev.jerseyColorHistogram);
        match = match && histSim >= histogramSimilarityThreshold;
      }
      if (curr.jerseyNumber && prev.jerseyNumber && curr.jerseyNumber !== prev.jerseyNumber) {
        match = false;
      }
      if (match) {
        consistentCount++;
        confidenceSum += iou * (hasAppearance && curr.jerseyNumber && prev.jerseyNumber ? 1 : 0.8);
      } else {
        warnings.push({
          description: `Identity mismatch between frame ${prev.frameIndex} and ${curr.frameIndex}`,
          frameIndex: curr.frameIndex,
          expectedPlayerId: playerId,
          observedPlayerId: playerId
        });
      }
    }
    const avgConfidence = totalCount > 1 ? confidenceSum / (totalCount - 1) : 1.0;
    const confidence = Math.min(1.0, avgConfidence);
    confirmedIdentities.push({
      playerId,
      consistentFrames: consistentCount,
      totalFrames: totalCount,
      confidence
    });
  }
  return { confirmedIdentities, warnings };
}

function computeIoU(bbox1, bbox2) {
  const [x1a, y1a, x2a, y2a] = bbox1;
  const [x1b, y1b, x2b, y2b] = bbox2;
  const xi1 = Math.max(x1a, x1b);
  const yi1 = Math.max(y1a, y1b);
  const xi2 = Math.min(x2a, x2b);
  const yi2 = Math.min(y2a, y2b);
  const interArea = Math.max(0, xi2 - xi1) * Math.max(0, yi2 - yi1);
  const areaA = (x2a - x1a) * (y2a - y1a);
  const areaB = (x2b - x1b) * (y2b - y1b);
  const unionArea = areaA + areaB - interArea;
  return unionArea === 0 ? 0 : interArea / unionArea;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = { verifyPlayerIdentityConsistency };
