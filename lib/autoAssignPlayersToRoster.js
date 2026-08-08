function autoAssignPlayersToRoster(videoAnalysisResults, roster) {
  const assignments = [];
  const unassigned = [];
  if (!Array.isArray(videoAnalysisResults) || !Array.isArray(roster)) {
    return { assignments, unassigned };
  }
  const usedRosterIds = new Set();
  const rosterByJersey = new Map();
  const rosterNoJersey = [];
  for (const r of roster) {
    if (r.jerseyNumber !== null && r.jerseyNumber !== undefined) {
      const jn = String(r.jerseyNumber).trim();
      if (!rosterByJersey.has(jn)) rosterByJersey.set(jn, []);
      rosterByJersey.get(jn).push(r);
    } else {
      rosterNoJersey.push(r);
    }
  }
  const processedDetected = new Set();
  for (const d of videoAnalysisResults) {
    if (processedDetected.has(d.detectedPlayerId)) continue;
    processedDetected.add(d.detectedPlayerId);
    const candidates = [];
    if (d.jerseyNumber !== null && d.jerseyNumber !== undefined) {
      const jn = String(d.jerseyNumber).trim();
      if (rosterByJersey.has(jn)) {
        for (const r of rosterByJersey.get(jn)) {
          if (!usedRosterIds.has(r.rosterPlayerId)) {
            candidates.push(r);
          }
        }
      }
    }
    if (candidates.length === 0 && (d.jerseyNumber === null || d.jerseyNumber === undefined) && rosterNoJersey.length > 0) {
      for (const r of rosterNoJersey) {
        if (!usedRosterIds.has(r.rosterPlayerId)) {
          candidates.push(r);
        }
      }
    }
    if (candidates.length === 0) {
      unassigned.push({ detectedPlayerId: d.detectedPlayerId, reason: d.jerseyNumber == null ? 'no_jersey' : 'no_match' });
      continue;
    }
    if (candidates.length === 1) {
      const r = candidates[0];
      let confidence = 0.7;
      if (d.faceEmbedding && r.faceImage) {
        const sim = cosineSimilarity(d.faceEmbedding, r.faceImage);
        if (sim > 0.6) confidence = Math.min(1, 0.5 + sim * 0.5);
        else if (sim < 0.3) {
          unassigned.push({ detectedPlayerId: d.detectedPlayerId, reason: 'no_match' });
          continue;
        }
      }
      assignments.push({ detectedPlayerId: d.detectedPlayerId, rosterPlayerId: r.rosterPlayerId, confidence: Math.round(confidence * 100) / 100 });
      usedRosterIds.add(r.rosterPlayerId);
    } else {
      const comparable = candidates.filter(r =>
        ArrayBuffer.isView(d.faceEmbedding) && ArrayBuffer.isView(r.faceImage) &&
        d.faceEmbedding.length > 0 && d.faceEmbedding.length === r.faceImage.length
      );
      if (comparable.length === 0) {
        unassigned.push({ detectedPlayerId: d.detectedPlayerId, reason: 'ambiguous' });
        continue;
      }
      let best = null;
      let bestSim = -1;
      let tied = false;
      for (const r of comparable) {
        const sim = cosineSimilarity(d.faceEmbedding, r.faceImage);
        if (sim > bestSim) {
          bestSim = sim;
          best = r;
          tied = false;
        } else if (sim === bestSim) {
          tied = true;
        }
      }
      if (best && bestSim > 0.3 && !tied) {
        let confidence = 0.5 + bestSim * 0.5;
        assignments.push({ detectedPlayerId: d.detectedPlayerId, rosterPlayerId: best.rosterPlayerId, confidence: Math.round(Math.min(1, confidence) * 100) / 100 });
        usedRosterIds.add(best.rosterPlayerId);
      } else {
        unassigned.push({ detectedPlayerId: d.detectedPlayerId, reason: 'ambiguous' });
      }
    }
  }
  return { assignments, unassigned };
}

function cosineSimilarity(a, b) {
  if (!a || !b) return 0;
  if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.length !== b.length || a.length === 0) return 0;
  const len = a.length;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = { autoAssignPlayersToRoster };
