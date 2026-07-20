const fs = require('fs');
const path = require('path');

function importPlayersFromCsv(filePath, teamId) {
  if (typeof teamId !== 'string' || teamId.trim() === '') {
    throw new TypeError('Invalid teamId: must be a non-empty string');
  }

  const result = { imported: 0, duplicates: 0, errors: [] };

  let absolutePath;
  try {
    absolutePath = path.resolve(filePath);
  } catch {
    result.errors.push('File not found');
    return result;
  }

  if (!fs.existsSync(absolutePath)) {
    result.errors.push('File not found');
    return result;
  }

  let fileContent;
  try {
    fileContent = fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    result.errors.push('File not found');
    return result;
  }

  const parseCsvLine = line => {
    const cells = []; let cell = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
      else cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) {
    result.errors.push('File is empty');
    return result;
  }

  const headerLine = lines[0].toLowerCase().trim();
  const headers = parseCsvLine(headerLine).map(h => h.toLowerCase());
  const nameIndex = headers.indexOf('name');
  const jerseyIndex = headers.indexOf('jerseynumber');

  if (nameIndex === -1 || jerseyIndex === -1) {
    result.errors.push('Row 1: missing required fields');
    return result;
  }

  const seenJerseys = new Set();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const name = row[nameIndex] || '';
    const jerseyNumber = row[jerseyIndex] || '';

    if (!name || !jerseyNumber) {
      result.errors.push(`Row ${i + 1}: missing required fields`);
      continue;
    }

    if (seenJerseys.has(jerseyNumber)) {
      result.duplicates++;
      continue;
    }

    seenJerseys.add(jerseyNumber);
    result.imported++;
  }

  return result;
}

module.exports = { importPlayersFromCsv };
