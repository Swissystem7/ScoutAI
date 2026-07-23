const fs = require('fs');
const path = require('path');

async function importRosterFromFile(filePath, format) {
  try {
    const buffer = fs.readFileSync(filePath);
    const content = buffer.toString('utf8');
    if (content.includes('\uFFFD')) {
      throw new Error('File is not valid UTF-8');
    }
    
    if (content.trim().length === 0) {
      return { success: false, players: [], errors: [{ line: 0, message: 'File is empty' }] };
    }
    
    if (format === 'csv') {
      return parseCSV(content);
    } else if (format === 'json') {
      return parseJSON(content);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  } catch (err) {
    if (err.message.includes('ENOENT')) {
      throw new Error(`File not found: ${filePath}`);
    }
    if (err.message.includes('UTF-8') || err.message.includes('utf8') || err.message.includes('encoding')) {
      throw err;
    }
    return { success: false, players: [], errors: [{ line: 0, message: err.message }] };
  }
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  const players = [];
  const errors = [];
  const seenNumbers = new Set();
  
  if (lines.length === 0) {
    return { success: false, players: [], errors: [{ line: 0, message: 'File is empty' }] };
  }
  
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const numberIdx = header.indexOf('number');
  const positionIdx = header.indexOf('position');
  const photoIdx = header.indexOf('photourl');
  
  if (nameIdx === -1 || numberIdx === -1 || positionIdx === -1) {
    return { success: false, players: [], errors: [{ line: 0, message: 'Missing required columns: name, number, position' }] };
  }
  
  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cols = lines[i].split(',');
    
    if (cols.length < 3) {
      errors.push({ line: lineNum, message: 'Missing columns' });
      continue;
    }
    
    const name = cols[nameIdx] ? cols[nameIdx].trim() : '';
    const numberStr = cols[numberIdx] ? cols[numberIdx].trim() : '';
    const position = cols[positionIdx] ? cols[positionIdx].trim() : '';
    let photoUrl = photoIdx !== -1 && cols[photoIdx] ? cols[photoIdx].trim() : undefined;
    
    if (!name || !numberStr || !position) {
      errors.push({ line: lineNum, message: 'Missing required field' });
      continue;
    }
    
    const number = Number(numberStr);
    if (!Number.isInteger(number)) {
      errors.push({ line: lineNum, message: `Invalid number: ${numberStr}` });
      continue;
    }
    
    if (photoUrl && !photoUrl.startsWith('http://') && !photoUrl.startsWith('https://')) {
      photoUrl = undefined;
    }
    
    if (seenNumbers.has(number)) {
      errors.push({ line: lineNum, message: `Duplicate player number: ${number}` });
    }
    seenNumbers.add(number);
    
    players.push({ name, number, position, photoUrl });
  }
  
  return { success: errors.length === 0, players, errors };
}

function parseJSON(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return { success: false, players: [], errors: [{ line: 0, message: 'Invalid JSON format' }] };
  }
  
  if (!Array.isArray(data)) {
    return { success: false, players: [], errors: [{ line: 0, message: 'JSON root must be an array' }] };
  }
  
  const players = [];
  const errors = [];
  const seenNumbers = new Set();
  
  for (let i = 0; i < data.length; i++) {
    const lineNum = i + 1;
    const item = data[i];
    
    if (!item || typeof item !== 'object') {
      errors.push({ line: lineNum, message: 'Invalid player object' });
      continue;
    }
    
    const name = item.name;
    const number = item.number;
    const position = item.position;
    let photoUrl = item.photoUrl;
    
    if (!name || number === undefined || number === null || !position) {
      errors.push({ line: lineNum, message: 'Missing required fields: name, number, position' });
      continue;
    }
    
    if (typeof name !== 'string' || typeof position !== 'string') {
      errors.push({ line: lineNum, message: 'Name and position must be strings' });
      continue;
    }
    
    const num = typeof number === 'number' ? number : Number(number);
    if (!Number.isInteger(num)) {
      errors.push({ line: lineNum, message: `Invalid number: ${number}` });
      continue;
    }
    
    if (photoUrl !== undefined && photoUrl !== null) {
      if (typeof photoUrl !== 'string' || (!photoUrl.startsWith('http://') && !photoUrl.startsWith('https://'))) {
        photoUrl = undefined;
      }
    } else {
      photoUrl = undefined;
    }
    
    if (seenNumbers.has(num)) {
      errors.push({ line: lineNum, message: `Duplicate player number: ${num}` });
    }
    seenNumbers.add(num);
    
    players.push({ name, number: num, position, photoUrl });
  }
  
  return { success: errors.length === 0, players, errors };
}

module.exports = { importRosterFromFile };
