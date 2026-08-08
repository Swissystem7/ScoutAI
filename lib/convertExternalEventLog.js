function convertExternalEventLog(externalData, sourceFormat, options = {}) {
  if (!externalData || externalData.trim() === '') return [];
  const { timezoneOffset = 0, playerIdMapping = {} } = options;
  const warnings = [];
  let parsed;
  try {
    switch (sourceFormat) {
      case 'opta_json':
        parsed = parseOptaJson(externalData, timezoneOffset, playerIdMapping, warnings);
        break;
      case 'wyscout_csv':
        parsed = parseWyscoutCsv(externalData, timezoneOffset, playerIdMapping, warnings);
        break;
      case 'manual_csv':
        parsed = parseManualCsv(externalData, timezoneOffset, playerIdMapping, warnings);
        break;
      case 'xml_match':
        parsed = parseXmlMatch(externalData, timezoneOffset, playerIdMapping, warnings);
        break;
      default:
        return { error: 'Unsupported format' };
    }
  } catch (e) {
    return { error: 'Parse failure' };
  }
  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(w));
  }
  return parsed;
}

function parseOptaJson(data, offset, mapping, warnings) {
  let events;
  try {
    events = JSON.parse(data);
  } catch {
    throw new Error('Parse failure');
  }
  if (!Array.isArray(events)) {
    events = events.match ? events.match.event : [];
  }
  return events.map(e => {
    const timestamp = parseTimestamp(e.timestamp || e.time, offset);
    const eventType = mapOptaEventType(e.type_id || e.type);
    const playerId = mapping[e.player_id] || e.player_id || '';
    const location = normalizeLocation(e.x, e.y);
    const outcome = e.outcome !== undefined ? (e.outcome ? 'success' : 'failure') : 'unknown';
    if (!timestamp || !eventType) {
      warnings.push('Missing required fields in opta event');
      return null;
    }
    return { timestamp, eventType, playerId, location, outcome };
  }).filter(Boolean);
}

function parseWyscoutCsv(data, offset, mapping, warnings) {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['timestamp', 'event', 'playerid', 'x', 'y'];
  const idx = {};
  for (const r of required) {
    idx[r] = headers.indexOf(r);
    if (idx[r] === -1) {
      warnings.push(`Missing column: ${r}`);
      return [];
    }
  }
  const outcomeIdx = headers.indexOf('outcome');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const timestamp = parseTimestamp(cols[idx.timestamp], offset);
    const eventType = cols[idx.event];
    const playerId = mapping[cols[idx.playerid]] || cols[idx.playerid];
    const x = parseFloat(cols[idx.x]);
    const y = parseFloat(cols[idx.y]);
    const location = normalizeLocation(x, y);
    const outcome = outcomeIdx !== -1 ? cols[outcomeIdx] : 'unknown';
    if (!timestamp || !eventType || !playerId) {
      warnings.push('Missing required fields in wyscout event');
      return null;
    }
    return { timestamp, eventType, playerId, location, outcome };
  }).filter(Boolean);
}

function parseManualCsv(data, offset, mapping, warnings) {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['timestamp', 'eventtype', 'playerid', 'x', 'y'];
  const idx = {};
  for (const r of required) {
    idx[r] = headers.indexOf(r);
    if (idx[r] === -1) {
      warnings.push(`Missing column: ${r}`);
      return [];
    }
  }
  const outcomeIdx = headers.indexOf('outcome');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const timestamp = parseTimestamp(cols[idx.timestamp], offset);
    const eventType = cols[idx.eventtype];
    const playerId = mapping[cols[idx.playerid]] || cols[idx.playerid];
    const x = parseFloat(cols[idx.x]);
    const y = parseFloat(cols[idx.y]);
    const location = normalizeLocation(x, y);
    const outcome = outcomeIdx !== -1 ? cols[outcomeIdx] : 'unknown';
    if (!timestamp || !eventType || !playerId) {
      warnings.push('Missing required fields in manual event');
      return null;
    }
    return { timestamp, eventType, playerId, location, outcome };
  }).filter(Boolean);
}

function parseXmlMatch(data, offset, mapping, warnings) {
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(data, 'text/xml');
  } catch {
    throw new Error('Parse failure');
  }
  const events = doc.querySelectorAll('event');
  return Array.from(events).map(el => {
    const timestamp = parseTimestamp(el.getAttribute('timestamp') || el.getAttribute('time'), offset);
    const eventType = el.getAttribute('type') || el.getAttribute('eventType');
    const playerId = mapping[el.getAttribute('playerId')] || el.getAttribute('playerId') || '';
    const x = parseFloat(el.getAttribute('x'));
    const y = parseFloat(el.getAttribute('y'));
    const location = normalizeLocation(x, y);
    const outcome = el.getAttribute('outcome') || 'unknown';
    if (!timestamp || !eventType) {
      warnings.push('Missing required fields in xml event');
      return null;
    }
    return { timestamp, eventType, playerId, location, outcome };
  }).filter(Boolean);
}

function parseTimestamp(value, offset) {
  if (!value) return null;
  if (typeof value === 'number') return value + offset * 60;
  const num = Number(value);
  if (!isNaN(num)) return num + offset * 60;
  const d = new Date(value);
  if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000) + offset * 60;
  return null;
}

function normalizeLocation(x, y) {
  if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) return [0, 0];
  let nx = x, ny = y;
  if (x > 100 || y > 100) {
    nx = (x / 100) * 100;
    ny = (y / 100) * 100;
  }
  return [Math.max(0, Math.min(100, nx)), Math.max(0, Math.min(100, ny))];
}

function mapOptaEventType(type) {
  const map = {
    1: 'pass',
    2: 'shot',
    3: 'foul',
    4: 'corner',
    5: 'goal',
    6: 'substitution',
    7: 'card',
    8: 'offside',
    9: 'throw_in',
    10: 'free_kick'
  };
  return map[type] || String(type);
}

module.exports = { convertExternalEventLog };