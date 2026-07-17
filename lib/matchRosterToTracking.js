function matchRosterToTracking(rosterCSV, trackingIDs, matchMetadata) {
  if (!rosterCSV || typeof rosterCSV !== 'string') return {error: 'Invalid CSV'};
  const lines = rosterCSV.trim().split('\n');
  if (lines.length < 2) return {error: 'Invalid CSV'};
  const header = lines[0].split(',');
  const nameIdx = header.indexOf('name');
  const jerseyIdx = header.indexOf('jersey_number');
  if (nameIdx === -1 || jerseyIdx === -1) return {error: 'Invalid CSV'};
  const roster = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;
    const name = parts[nameIdx].trim();
    const jersey = parseInt(parts[jerseyIdx].trim(), 10);
    if (!name || isNaN(jersey)) continue;
    roster.push({name, jersey});
  }
  if (roster.length === 0) return {error: 'Invalid CSV'};
  if (!trackingIDs || trackingIDs.length === 0) return [];
  const teamColors = matchMetadata.teamColors || [];
  const knownPlayerNumbers = matchMetadata.knownPlayerNumbers || [];
  const result = [];
  for (const rosterEntry of roster) {
    let bestMatch = null;
    let bestConfidence = 0;
    for (const track of trackingIDs) {
      const jerseyFreq = {};
      for (const num of track.jerseys) {
        jerseyFreq[num] = (jerseyFreq[num] || 0) + 1;
      }
      const totalDetections = track.jerseys.length || 1;
      const freqScore = (jerseyFreq[rosterEntry.jersey] || 0) / totalDetections;
      // A match requires the jersey to actually be detected in this track;
      // spatial clustering only *resolves* among jersey candidates, it never
      // manufactures a match from zero frequency (spec: "No match found -> omit").
      if (freqScore <= 0) continue;
      let spatialScore = 0;
      if (track.spatialCluster && track.spatialCluster.length >= 2) {
        const knownNumbers = knownPlayerNumbers.length > 0 ? knownPlayerNumbers : roster.map(r => r.jersey);
        const avgSpatial = knownNumbers.reduce((sum, num) => {
          const t = trackingIDs.find(t => t.jerseys.includes(num));
          return t ? sum + (t.spatialCluster[0] || 0) : sum;
        }, 0) / Math.max(knownNumbers.length, 1);
        const diff = Math.abs((track.spatialCluster[0] || 0) - avgSpatial);
        spatialScore = Math.max(0, 1 - diff / 100);
      }
      const confidence = freqScore * 0.7 + spatialScore * 0.3;
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {rosterName: rosterEntry.name, trackingId: track.id, confidence: Math.round(confidence * 1000) / 1000};
      }
    }
    if (bestMatch && bestConfidence > 0) {
      const existing = result.find(r => r.rosterName === bestMatch.rosterName);
      if (existing) {
        if (bestMatch.confidence > existing.confidence) {
          existing.trackingId = bestMatch.trackingId;
          existing.confidence = bestMatch.confidence;
        }
      } else {
        result.push(bestMatch);
      }
    }
  }
  return result;
}
module.exports = { matchRosterToTracking };