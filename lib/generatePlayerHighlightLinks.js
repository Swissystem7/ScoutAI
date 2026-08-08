function generatePlayerHighlightLinks(baseVideoUrl, events, playerIdMapping) {
  if (baseVideoUrl === null || baseVideoUrl === undefined || events === null || events === undefined || playerIdMapping === null || playerIdMapping === undefined) {
    throw new TypeError('Inputs must not be null or undefined');
  }
  try { new URL(baseVideoUrl); } catch {
    throw new Error('Invalid baseVideoUrl: must contain protocol');
  }
  if (!Array.isArray(events)) {
    throw new TypeError('events must be an array');
  }
  if (typeof playerIdMapping !== 'object' || playerIdMapping === null) {
    throw new TypeError('playerIdMapping must be an object');
  }
  if (events.length === 0) {
    return [];
  }
  const results = [];
  for (const event of events) {
    if (event === null || event === undefined || typeof event !== 'object') {
      continue;
    }
    const { timestampStart, timestampEnd, playerIdentifier } = event;
    if (timestampStart === null || timestampStart === undefined || timestampEnd === null || timestampEnd === undefined || playerIdentifier === null || playerIdentifier === undefined) {
      continue;
    }
    if (!Number.isFinite(timestampStart) || !Number.isFinite(timestampEnd) || typeof playerIdentifier !== 'string') {
      continue;
    }
    const playerId = playerIdMapping[playerIdentifier];
    if (playerId === undefined) {
      continue;
    }
    let start = Math.trunc(timestampStart);
    let end = Math.trunc(timestampEnd);
    if (start > end) {
      [start, end] = [end, start];
    }
    const highlightUrl = baseVideoUrl + '?t=' + start + ',' + end;
    results.push({ playerId: String(playerId), highlightUrl });
  }
  return results;
}

module.exports = { generatePlayerHighlightLinks };
