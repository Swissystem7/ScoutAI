const createPlayerHighlightClip = async (playerId, matchId, options = {}) => {
  if (typeof playerId !== 'string' || !playerId.trim()) throw new Error('Invalid playerId');
  if (typeof matchId !== 'string' || !matchId.trim()) throw new Error('Invalid matchId');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid options');
  if (options.duration !== undefined && (!Number.isInteger(options.duration) || options.duration <= 0)) throw new Error('Invalid duration');
  const duration = options.duration !== undefined ? Math.min(options.duration, 30) : 5;
  const format = options.format || 'mp4';
  if (format !== 'gif' && format !== 'mp4') throw new Error('InvalidFormatError');
  const matchData = await getMatchData(matchId);
  if (!matchData) throw new Error('MatchNotProcessedError');
  const playerData = matchData.players.find(p => p.id === playerId);
  if (!playerData) throw new Error('PlayerNotInMatchError');
  const highlights = playerData.highlights;
  if (!highlights || highlights.length === 0) throw new Error('NoHighlightsError');
  const clip = await extractClip(highlights, duration, format);
  const safeMatchId = encodeURIComponent(matchId);
  const safePlayerId = encodeURIComponent(playerId);
  const clipUrl = `https://scoutai.com/clips/${safeMatchId}/${safePlayerId}/highlight.${format}`;
  const thumbnailUrl = `https://scoutai.com/thumbnails/${safeMatchId}/${safePlayerId}.jpg`;
  const shareText = `Check out ${playerData.name} on ScoutAI!`;
  return { clipUrl, thumbnailUrl, shareText };
};
const getMatchData = async (matchId) => {
  const db = { processed: { 'match1': { players: [{ id: 'p1', name: 'John Doe', highlights: [{ start: 10, end: 15 }] }] } } };
  return db.processed[matchId] || null;
};
const extractClip = async (highlights, duration, format) => {
  return { url: 'mock', thumbnail: 'mock' };
};
module.exports = { createPlayerHighlightClip };
