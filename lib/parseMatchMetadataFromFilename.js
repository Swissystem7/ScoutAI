function parseMatchMetadataFromFilename(filename) {
  if (typeof filename !== 'string' || !filename.toLowerCase().endsWith('.mp4')) {
    return { error: 'Filename format not recognized' };
  }
  const parseDate = value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  };
  const pattern = /^([A-Z0-9]+)_Match_(\d{4}-\d{2}-\d{2})_vs_([A-Za-z0-9_]+)\.mp4$/i;
  const match = filename.match(pattern);
  if (!match) {
    const extPattern = /\.\w+$/;
    if (!extPattern.test(filename) || !filename.toLowerCase().endsWith('.mp4')) {
      return { error: 'Filename format not recognized' };
    }
    const partialPattern = /^([A-Z0-9]+)_Match_(\d{4}-\d{2}-\d{2})_vs_([A-Za-z0-9_]+)/i;
    const partialMatch = filename.match(partialPattern);
    if (partialMatch) {
      const ageGroup = partialMatch[1].toUpperCase();
      const dateStr = partialMatch[2];
      const matchDate = parseDate(dateStr);
      const opponent = partialMatch[3] ? partialMatch[3].replace(/_/g, ' ') : null;
      return { ageGroup, matchDate, opponent };
    }
    const noOpponentPattern = /^([A-Z0-9]+)_Match_(\d{4}-\d{2}-\d{2})/i;
    const noOpponentMatch = filename.match(noOpponentPattern);
    if (noOpponentMatch) {
      const ageGroup = noOpponentMatch[1].toUpperCase();
      const dateStr = noOpponentMatch[2];
      const matchDate = parseDate(dateStr);
      return { ageGroup, matchDate, opponent: null };
    }
    return { error: 'Filename format not recognized' };
  }
  const ageGroup = match[1].toUpperCase();
  const dateStr = match[2];
  const matchDate = parseDate(dateStr);
  const opponent = match[3].replace(/_/g, ' ');
  return { ageGroup, matchDate, opponent };
}

module.exports = { parseMatchMetadataFromFilename };
