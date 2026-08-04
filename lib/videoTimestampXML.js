function videoTimestampXML(videoFilePath, events, videoDuration = 0) {
  if (!events || events.length === 0) {
    return '<playlist></playlist>';
  }
  const src = videoFilePath || '';
  const duration = Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : Infinity;
  const escapeXML = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sorted = events.map(e => ({
    startTime: Math.max(0, Math.min(e.startTime, duration)),
    endTime: Math.max(0, Math.min(e.endTime, duration)),
    playerName: e.playerName || '',
    action: e.action || '',
    highlightLabel: e.highlightLabel || ''
  })).sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTime > sorted[i + 1].startTime) {
      sorted[i].endTime = sorted[i + 1].startTime;
    }
  }
  for (const event of sorted) event.endTime = Math.max(event.startTime, event.endTime);
  const clips = sorted.map(e => {
    const label = [e.playerName, e.action, e.highlightLabel].filter(Boolean).join(' - ');
    return `<clip start="${e.startTime}" end="${e.endTime}" label="${escapeXML(label)}" video="${escapeXML(src)}"/>`;
  }).join('');
  return `<playlist>${clips}</playlist>`;
}
module.exports = { videoTimestampXML };
