function importPlayerRoster(csvString, clubId) {
  const players = [];
  const errors = [];
  if (!csvString || csvString.trim().length === 0) {
    errors.push({ row: 1, field: 'file', message: 'Empty CSV' });
    return { players, errors };
  }
  let cleaned = csvString;
  if (cleaned.charCodeAt(0) === 0xFEFF) {
    cleaned = cleaned.slice(1);
  }
  const lines = cleaned.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    errors.push({ row: 1, field: 'file', message: 'Empty CSV' });
    return { players, errors };
  }
  const headerLine = lines[0].trim();
  const headers = headerLine.split(',').map(h => h.trim());
  const nameIdx = headers.indexOf('Name');
  const posIdx = headers.indexOf('Position');
  const jerseyIdx = headers.indexOf('JerseyNumber');
  const ageIdx = headers.indexOf('AgeGroup');
  const hasHeader = nameIdx !== -1 && posIdx !== -1 && jerseyIdx !== -1 && ageIdx !== -1;
  const ageGroupSet = new Set();
  const jerseyMap = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const rowNum = i + 1;
    const fields = line.split(',').map(f => f.trim());
    if (!hasHeader) {
      errors.push({ row: rowNum, field: 'header', message: 'Missing required header columns' });
      continue;
    }
    const name = fields[nameIdx] || '';
    const position = fields[posIdx] || '';
    const jerseyRaw = fields[jerseyIdx] || '';
    const ageGroup = fields[ageIdx] || '';
    let rowError = false;
    if (!name) {
      errors.push({ row: rowNum, field: 'Name', message: 'Name is required' });
      rowError = true;
    }
    if (!position) {
      errors.push({ row: rowNum, field: 'Position', message: 'Position is required' });
      rowError = true;
    }
    const jerseyNumber = Number(jerseyRaw);
    if (jerseyRaw === '' || isNaN(jerseyNumber) || !Number.isFinite(jerseyNumber) || jerseyNumber <= 0 || !Number.isInteger(jerseyNumber)) {
      errors.push({ row: rowNum, field: 'JerseyNumber', message: 'Invalid JerseyNumber, must be a positive integer' });
      rowError = true;
    }
    if (!/^U\d{1,2}$/.test(ageGroup)) {
      errors.push({ row: rowNum, field: 'AgeGroup', message: 'Invalid AgeGroup format, must be like U12' });
      rowError = true;
    }
    if (rowError) continue;
    const key = ageGroup + '|' + jerseyNumber;
    if (jerseyMap[key]) {
      errors.push({ row: rowNum, field: 'JerseyNumber', message: 'Duplicate JerseyNumber within same AgeGroup' });
      continue;
    }
    jerseyMap[key] = true;
    const playerId = clubId + '-' + ageGroup + '-' + jerseyNumber;
    players.push({
      name: name,
      position: position,
      jerseyNumber: jerseyNumber,
      ageGroup: ageGroup,
      playerId: playerId
    });
  }
  return { players, errors };
}

module.exports = { importPlayerRoster };