function extractMatchMetadataFromFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return { teamA: null, teamB: null, date: null, competition: null, confidence: 0 };
  }
  const name = fileName.replace(/\.[^/.]+$/, '');
  let teamA = null, teamB = null, date = null, competition = null;
  let confidence = 0;
  const patterns = [
    /^(.+?)_vs_(.+?)_(\d{4}-\d{2}-\d{2})$/,
    /^(.+?)_vs_(.+?)_(\d{2}-\d{2}-\d{4})$/,
    /^(.+?)_vs_(.+?)$/
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      teamA = match[1] || null;
      teamB = match[2] || null;
      if (match[3]) {
        const iso = /^\d{4}/.test(match[3]) ? match[3] : match[3].replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$1-$2');
        const parsed = new Date(iso + 'T00:00:00Z');
        if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso) {
          date = parsed;
          confidence = /^\d{4}/.test(match[3]) ? 0.9 : 0.7;
        }
      } else {
        confidence = 0.5;
      }
      if (teamA && teamB && !teamA.includes('_vs_') && !teamB.includes('_vs_')) {
        const parts = name.split('_');
        const compIndex = parts.indexOf('vs');
        if (compIndex > 1) {
          competition = parts.slice(0, compIndex).join('_');
        }
        if (compIndex !== -1 && compIndex + 2 < parts.length) {
          const after = parts.slice(compIndex + 2);
          const dateIndex = after.findIndex(p => /^\d{4}-\d{2}-\d{2}$/.test(p) || /^\d{2}-\d{2}-\d{4}$/.test(p));
          if (dateIndex > 0) {
            competition = after.slice(0, dateIndex).join('_');
          }
        }
      }
      if (teamA.includes('_vs_') || teamB.includes('_vs_')) {
        teamA = teamB = null; date = null; competition = null; confidence = 0;
      }
      break;
    }
  }
  if (!teamA && !teamB && !date && !competition) {
    confidence = 0;
  }
  return { teamA, teamB, date, competition, confidence };
}
module.exports = { extractMatchMetadataFromFileName };
