function generatePlayerHighlightReel(matchId, playerEvents) {
  if (typeof matchId !== "string" || matchId.trim() === "") {
    throw new TypeError("matchId must be a non-empty string");
  }
  if (!Array.isArray(playerEvents)) {
    throw new TypeError("playerEvents must be an array");
  }
  if (playerEvents.length === 0) {
    return [];
  }
  const validated = [];
  for (const event of playerEvents) {
    if (!event || typeof event.playerId !== "string" || event.playerId.trim() === "" ||
        typeof event.eventType !== "string" || event.eventType.trim() === "" ||
        !Number.isFinite(event.startTime) || !Number.isFinite(event.endTime) ||
        !Number.isFinite(event.qualityScore)) {
      throw new TypeError("Missing required fields in player event");
    }
    let start = event.startTime < 0 ? 0 : event.startTime;
    let end = event.endTime < 0 ? 0 : event.endTime;
    let score = Math.max(0, Math.min(1, event.qualityScore));
    validated.push({ playerId: event.playerId, eventType: event.eventType, startTime: start, endTime: end, qualityScore: score });
  }
  const grouped = Object.create(null);
  for (const ev of validated) {
    const key = ev.playerId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  const result = [];
  for (const playerId in grouped) {
    const events = grouped[playerId].sort((a, b) => a.startTime - b.startTime);
    const merged = [];
    for (const ev of events) {
      if (merged.length === 0) {
        merged.push({ playerId: ev.playerId, clipStart: ev.startTime, clipEnd: ev.endTime, eventType: ev.eventType, scoutScore: ev.qualityScore });
      } else {
        const last = merged[merged.length - 1];
        if (ev.startTime <= last.clipEnd) {
          last.clipEnd = Math.max(last.clipEnd, ev.endTime);
          last.scoutScore = Math.min(1, last.scoutScore + ev.qualityScore);
          if (last.scoutScore > 1) last.scoutScore = 1;
        } else {
          merged.push({ playerId: ev.playerId, clipStart: ev.startTime, clipEnd: ev.endTime, eventType: ev.eventType, scoutScore: ev.qualityScore });
        }
      }
    }
    result.push(...merged);
  }
  return result;
}
module.exports = { generatePlayerHighlightReel };
