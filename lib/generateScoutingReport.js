const crypto = require('crypto');

function generateScoutingReport(playerName, playerId, matchEvents, metadata) {
  if (typeof playerName !== 'string' || playerName.length === 0) {
    throw new Error('playerName must be a non-empty string');
  }
  if (typeof playerId !== 'string' || playerId.length === 0) {
    throw new Error('playerId must be a non-empty string');
  }
  const requiredFields = ['clubName', 'position', 'matchDate', 'opposition'];
  if (!metadata || typeof metadata !== 'object') throw new Error('Missing metadata');
  for (const field of requiredFields) {
    if (!(field in metadata) || metadata[field] === undefined || metadata[field] === null) {
      throw new Error('Missing metadata field: ' + field);
    }
  }
  const events = Array.isArray(matchEvents) ? matchEvents : [];
  const validEvents = events.filter(e => e && typeof e.timestamp === 'string' && e.timestamp.length > 0);
  const highlights = validEvents.filter(e => typeof e.videoClipUrl === 'string' && e.videoClipUrl.length > 0).map(e => ({
    timestamp: e.timestamp,
    eventType: e.eventType,
    clipUrl: e.videoClipUrl
  }));
  let goals = 0, assists = 0, keyPasses = 0;
  for (const e of validEvents) {
    if (e.eventType === 'goal') goals++;
    else if (e.eventType === 'assist') assists++;
    else if (e.eventType === 'keyPass') keyPasses++;
  }
  return {
    playerName,
    playerId,
    reportId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    highlights,
    summary: {
      goals,
      assists,
      keyPasses,
      totalEvents: validEvents.length
    },
    metadata
  };
}

module.exports = { generateScoutingReport };
