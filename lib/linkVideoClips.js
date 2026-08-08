function linkVideoClips(matchId, eventsList, videoUrl) {
  if (!Array.isArray(eventsList) || eventsList.length === 0) return [];
  const safeVideoUrl = typeof videoUrl === 'string' ? videoUrl : '';
  const result = [];
  for (const event of eventsList) {
    if (event.playerId == null || event.playerId === undefined || event.eventType == null || event.eventType === undefined) continue;
    if (!event || !Number.isFinite(event.timeSeconds)) continue;
    const start = Math.max(0, event.timeSeconds);
    const duration = Number.isFinite(event.durationSeconds) && event.durationSeconds >= 0 ? event.durationSeconds : 10;
    const end = start + duration;
    let clipUrl = null;
    const ytMatch = safeVideoUrl.match(/(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];
      clipUrl = `https://www.youtube.com/watch?v=${videoId}&t=${start}s`;
      if (duration !== 10 || event.durationSeconds != null) {
        clipUrl += `&end=${end}s`;
      }
    } else {
      const vimeoMatch = safeVideoUrl.match(/vimeo\.com\/(\d+)/);
      if (vimeoMatch) {
        const videoId = vimeoMatch[1];
        clipUrl = `https://vimeo.com/${videoId}#t=${start}s`;
      } else if (/\.mp4(?:[?#]|$)/i.test(safeVideoUrl)) {
        clipUrl = `${safeVideoUrl.split('#')[0]}#t=${start},${end}`;
      } else {
        clipUrl = safeVideoUrl;
      }
    }
    result.push({
      playerId: event.playerId,
      eventType: event.eventType,
      timestamp: event.timeSeconds,
      clipUrl: clipUrl
    });
  }
  return result;
}
module.exports = { linkVideoClips };
