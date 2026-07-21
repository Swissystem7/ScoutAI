function bulkImportPlayers(fileBuffer, fileType) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error('Empty buffer');
  }
  if (fileType !== 'csv' && fileType !== 'json') {
    throw new Error('Unsupported file type');
  }

  const result = {
    totalRows: 0,
    newPlayers: 0,
    updatedPlayers: 0,
    failedRows: []
  };

  const players = [];
  const seen = new Map();

  function sanitizeName(name) {
    return encodeURIComponent(name);
  }

  function validatePlayer(row, rowIndex) {
    const errors = [];
    if (!row || typeof row !== 'object' || Array.isArray(row)) return ['row must be an object'];
    if (!row.playerName || typeof row.playerName !== 'string' || row.playerName.trim() === '') {
      errors.push('missing field: playerName');
    }
    if (!row.dateOfBirth || typeof row.dateOfBirth !== 'string') {
      errors.push('missing field: dateOfBirth');
    } else {
      const date = new Date(`${row.dateOfBirth}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfBirth) || isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== row.dateOfBirth) {
        errors.push('invalid date: dateOfBirth');
      }
    }
    if (!row.position || typeof row.position !== 'string' || row.position.trim() === '') {
      errors.push('missing field: position');
    }
    if (row.clubId === undefined || row.clubId === null || (typeof row.clubId !== 'string' && typeof row.clubId !== 'number')) {
      errors.push('missing field: clubId');
    }
    return errors;
  }

  function processRow(row, rowIndex) {
    const validationErrors = validatePlayer(row, rowIndex);
    if (validationErrors.length > 0) {
      result.failedRows.push({ rowIndex, reason: validationErrors.join('; ') });
      return;
    }

    const cleanName = sanitizeName(row.playerName.trim());
    const key = JSON.stringify([cleanName, row.dateOfBirth, String(row.clubId)]);
    const existing = seen.get(key);

    if (existing) {
      let updated = false;
      if (row.position && row.position.trim() !== '' && row.position.trim() !== existing.position) {
        existing.position = row.position.trim();
        updated = true;
      }
      if (updated) {
        result.updatedPlayers++;
      }
    } else {
      const newPlayer = {
        playerName: cleanName,
        dateOfBirth: row.dateOfBirth,
        position: row.position.trim(),
        clubId: row.clubId
      };
      players.push(newPlayer);
      seen.set(key, newPlayer);
      result.newPlayers++;
    }
  }

  if (fileType === 'json') {
    let data;
    try {
      data = JSON.parse(fileBuffer.toString('utf8'));
    } catch (e) {
      throw new Error('Invalid JSON');
    }
    if (!Array.isArray(data)) {
      throw new Error('JSON not array');
    }
    result.totalRows = data.length;
    data.forEach((row, index) => processRow(row, index));
  } else {
    const lines = fileBuffer.toString('utf8').split(/\r?\n/);
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) {
      throw new Error('Empty buffer');
    }
    const header = lines[0].split(',').map(h => h.trim());
    const requiredFields = ['playerName', 'dateOfBirth', 'position', 'clubId'];
    const headerMap = {};
    header.forEach((h, i) => { headerMap[h] = i; });
    for (const field of requiredFields) {
      if (!(field in headerMap)) {
        throw new Error(`Missing required column: ${field}`);
      }
    }
    result.totalRows = lines.length - 1;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      const columns = line.split(',');
      if (columns.length !== header.length) {
        result.failedRows.push({ rowIndex: i, reason: 'malformed CSV: uneven columns' });
        continue;
      }
      const row = {};
      header.forEach((h, idx) => {
        row[h] = columns[idx].trim();
      });
      processRow(row, i);
    }
  }

  return result;
}

module.exports = { bulkImportPlayers };
