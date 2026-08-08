function importFixtureCalendar(icsContent, clubId) {
  const matches = [];
  const errors = [];
  const seen = new Set();

  if (!icsContent || icsContent.trim().length === 0) {
    errors.push({ line: 0, message: 'Empty ICS' });
    return { matches, errors };
  }

  if (!icsContent.includes('BEGIN:VCALENDAR')) {
    errors.push({ line: 0, message: 'Malformed ICS: missing BEGIN:VCALENDAR' });
    return { matches, errors };
  }

  const tzOffsets = {
    'America/New_York': -5,
    'America/Chicago': -6,
    'America/Denver': -7,
    'America/Los_Angeles': -8,
    'Europe/London': 0,
    'Europe/Berlin': 1,
    'Europe/Paris': 1,
    'Asia/Tokyo': 9,
    'Asia/Shanghai': 8,
    'Australia/Sydney': 11,
  };

  const lines = icsContent.split('\n');
  let currentEvent = null;
  let lineNumber = 0;
  let inEvent = false;

  for (let i = 0; i < lines.length; i++) {
    lineNumber = i + 1;
    const rawLine = lines[i];
    const line = rawLine.replace(/\r$/, '').trim();

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = { dtstart: null, summary: null, location: null, tzid: null };
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && currentEvent) {
        if (!currentEvent.dtstart) {
          errors.push({ line: lineNumber, message: 'VEVENT missing DTSTART, skipped' });
        } else {
          const opponent = currentEvent.summary ? currentEvent.summary.replace(/^vs\.?\s*/i, '').trim() : '';
          if (opponent && !opponent.toLowerCase().includes('training') && !opponent.toLowerCase().includes('practice')) {
            let dateTime = currentEvent.dtstart;
            if (currentEvent.tzid && tzOffsets[currentEvent.tzid] !== undefined) {
              const offset = tzOffsets[currentEvent.tzid];
              const sign = offset >= 0 ? '+' : '-';
              const absOffset = Math.abs(offset);
              const hours = String(Math.floor(absOffset)).padStart(2, '0');
              const minutes = '00';
              dateTime = dateTime.replace(/Z$/, '') + sign + hours + minutes;
            } else if (!dateTime.endsWith('Z') && !dateTime.includes('+') && !dateTime.includes('-')) {
              dateTime += 'Z';
            }
            const key = dateTime + '|' + opponent;
            if (!seen.has(key)) {
              seen.add(key);
              matches.push({
                matchId: clubId + '-' + dateTime.replace(/[^0-9TZ]/g, '').replace(/[TZ]/g, '-').replace(/-+$/, ''),
                dateTime: dateTime,
                opponent: opponent,
                location: currentEvent.location || '',
                status: 'scheduled'
              });
            }
          }
        }
        currentEvent = null;
        inEvent = false;
      }
      continue;
    }

    if (inEvent && currentEvent) {
      if (line.startsWith('DTSTART')) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          let dtstart = parts.slice(1).join(':');
          const tzMatch = line.match(/TZID=([^:]+)/);
          if (tzMatch) {
            currentEvent.tzid = tzMatch[1];
            if (!tzOffsets[currentEvent.tzid]) {
              currentEvent.tzid = null;
            }
          }
          currentEvent.dtstart = dtstart;
        }
      } else if (line.startsWith('SUMMARY')) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          currentEvent.summary = parts.slice(1).join(':');
        }
      } else if (line.startsWith('LOCATION')) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          currentEvent.location = parts.slice(1).join(':');
        }
      }
    }
  }

  return { matches, errors };
}

module.exports = { importFixtureCalendar };