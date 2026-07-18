function autoPlayerSummary(events, roster) {
  const playerStats = new Map();
  for (const event of events) {
    const pid = event.playerId;
    if (!playerStats.has(pid)) {
      playerStats.set(pid, { passes: 0, passSuccess: 0, shots: 0, shotSuccess: 0, tackles: 0, minTime: Infinity, maxTime: -Infinity });
    }
    const s = playerStats.get(pid);
    if (event.eventType === 'pass') {
      s.passes++;
      if (event.result === 'success') s.passSuccess++;
    } else if (event.eventType === 'shot') {
      s.shots++;
      if (event.result === 'success') s.shotSuccess++;
    } else if (event.eventType === 'tackle') {
      s.tackles++;
    }
    if (event.time < s.minTime) s.minTime = event.time;
    if (event.time > s.maxTime) s.maxTime = event.time;
  }
  return roster.map(p => {
    const pid = p.playerId;
    const s = playerStats.get(pid);
    if (!s) {
      return {
        playerId: pid,
        name: p.name,
        position: p.position,
        passAccuracy: 0,
        shotAccuracy: 0,
        tackles: 0,
        minutesPlayed: 0
      };
    }
    const passAccuracy = s.passes === 0 ? 0 : s.passSuccess / s.passes;
    const shotAccuracy = s.shots === 0 ? 0 : s.shotSuccess / s.shots;
    const minutesPlayed = s.minTime === Infinity ? 0 : s.maxTime - s.minTime;
    return {
      playerId: pid,
      name: p.name,
      position: p.position,
      passAccuracy: passAccuracy,
      shotAccuracy: shotAccuracy,
      tackles: s.tackles,
      minutesPlayed: minutesPlayed
    };
  });
}
module.exports = { autoPlayerSummary };
