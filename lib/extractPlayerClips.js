const allowedEventTypes = new Set([
  'goal', 'assist', 'shot', 'save', 'tackle', 'pass', 'dribble', 'foul', 'corner', 'free_kick', 'penalty', 'substitution', 'yellow_card', 'red_card', 'offside', 'throw_in', 'goal_kick', 'clearance', 'block', 'interception'
]);

function parseTimestamp(ts) {
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (typeof ts !== 'string') return 0;
  const parts = ts.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(ts);
}

function clampTime(time, duration) {
  return Math.max(0, Math.min(time, duration));
}

async function extractPlayerClips(playerId, matchId, eventTypes, baseVideoPath) {
  if (!baseVideoPath || typeof baseVideoPath !== 'string' || baseVideoPath.trim() === '') {
    throw new Error('baseVideoPath is missing or invalid');
  }

  const validEventTypes = Array.isArray(eventTypes) ? eventTypes.filter(et => allowedEventTypes.has(et)) : [];

  const matchData = (globalThis.__matchDatabase || matchDatabase)[matchId];
  if (!matchData) {
    throw new Error(`Match ${matchId} not found`);
  }

  const playerData = matchData.players[playerId];
  if (!playerData) {
    throw new Error(`Player ${playerId} not found in match ${matchId}`);
  }

  const videoDuration = Number.isFinite(matchData.duration) && matchData.duration >= 0 ? matchData.duration : 7200;

  const matchingEvents = (Array.isArray(playerData.events) ? playerData.events : [])
    .filter(evt => evt && validEventTypes.includes(evt.eventType));

  if (matchingEvents.length === 0) {
    return [];
  }

  const parsedEvents = matchingEvents.map(evt => ({
    ...evt,
    startTime: clampTime(parseTimestamp(evt.startTime), videoDuration),
    endTime: clampTime(parseTimestamp(evt.endTime), videoDuration)
  })).map(evt => evt.endTime < evt.startTime ? { ...evt, endTime: evt.startTime } : evt);

  parsedEvents.sort((a, b) => a.startTime - b.startTime);

  const mergedClips = [];
  let current = null;

  for (const evt of parsedEvents) {
    if (current === null) {
      current = { ...evt };
    } else if (evt.startTime <= current.endTime) {
      current.endTime = Math.max(current.endTime, evt.endTime);
      current.eventType = current.eventType + '_' + evt.eventType;
    } else {
      mergedClips.push({
        clipId: `${playerId}_${matchId}_${mergedClips.length}`,
        eventType: current.eventType,
        startTime: current.startTime,
        endTime: current.endTime,
        videoPath: baseVideoPath
      });
      current = { ...evt };
    }
  }

  if (current !== null) {
    mergedClips.push({
      clipId: `${playerId}_${matchId}_${mergedClips.length}`,
      eventType: current.eventType,
      startTime: current.startTime,
      endTime: current.endTime,
      videoPath: baseVideoPath
    });
  }

  return mergedClips;
}

const matchDatabase = {};

module.exports = { extractPlayerClips };
