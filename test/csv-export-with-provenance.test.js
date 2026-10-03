'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createStore,
  createCsvReportWithProvenance,
  PROVENANCE_LEDGER_COLUMNS,
  OPEN_DATA_PROVENANCE,
  OPEN_DATA_SOURCE,
  USER_DATA_PROVENANCE,
  EVENT_COLUMNS
} = require('../demo.js');

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  const text = String(line || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseProvenanceLedger(csv) {
  const lines = String(csv || '').trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length >= 1, 'CSV must include a header row');
  assert.deepEqual(splitCsvLine(lines[0]), PROVENANCE_LEDGER_COLUMNS);
  return lines.slice(1).map(function (line) {
    const cells = splitCsvLine(line);
    return {
      fieldKey: cells[0],
      label: cells[1],
      value: cells[2],
      filePath: cells[3],
      provenance: cells[4],
      dataset: cells[5]
    };
  });
}

function filePathForLedgerField(fieldKey) {
  if (fieldKey === 'minutes') return 'players[].totalMinutesProxy';
  return 'players[].' + fieldKey;
}

test('createCsvReportWithProvenance returns a ledger tying each number to a JSON field path', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const kante = store.players.find((row) => /Kant/.test(row.name));
  const csv = createCsvReportWithProvenance(kante, {
    provenance: OPEN_DATA_PROVENANCE,
    source: OPEN_DATA_SOURCE
  });
  assert.equal(typeof csv, 'string');
  const rows = parseProvenanceLedger(csv);
  assert.equal(rows.length, EVENT_COLUMNS.length + 1);
  const pressures = rows.find((row) => row.fieldKey === 'pressures');
  assert.equal(pressures.value, '183');
  assert.equal(pressures.filePath, 'players[].pressures');
  assert.equal(pressures.provenance, OPEN_DATA_PROVENANCE);
  assert.equal(pressures.dataset, OPEN_DATA_SOURCE.dataset);
  const minutes = rows.find((row) => row.fieldKey === 'minutes');
  assert.equal(minutes.value, '621');
  assert.equal(minutes.filePath, 'players[].totalMinutesProxy');
  rows.forEach((row) => {
    assert.equal(row.filePath, filePathForLedgerField(row.fieldKey));
    assert.ok(row.provenance);
    assert.match(row.value, /^-?\d+(\.\d+)?$/);
  });
  const dribbles = rows.find((row) => row.fieldKey === 'dribbles');
  assert.ok(dribbles);
  assert.equal(dribbles.filePath, 'players[].dribbles');
});

test('createCsvReportWithProvenance tags USER_LICENSED_DATA uploads without claiming Open Data', () => {
  const store = createStore({
    players: [
      {
        name: 'Ledger Alpha',
        team: 'Home',
        position: 'Center Back',
        minutes: 400,
        pressures: 40,
        tackles: 8,
        interceptions: 6,
        defensiveActions: 20,
        progressiveActions: 10,
        keyPasses: 1,
        passesCompleted: 100,
        shotXgSum: 0.1,
        boxTouches: 2,
        shotsOnTarget: 0
      }
    ]
  }, {
    provenance: USER_DATA_PROVENANCE,
    source: { dataset: 'club-export.csv', competition: 'USER_DATASET' }
  });
  const player = store.players[0];
  const csv = createCsvReportWithProvenance(player, {
    provenance: USER_DATA_PROVENANCE,
    source: { dataset: 'club-export.csv' }
  });
  const rows = parseProvenanceLedger(csv);
  assert.ok(rows.every((row) => row.provenance === USER_DATA_PROVENANCE));
  assert.ok(rows.every((row) => row.dataset === 'club-export.csv'));
  assert.ok(rows.every((row) => row.provenance !== OPEN_DATA_PROVENANCE));
});

test('createCsvReportWithProvenance without a player yields only the ledger header', () => {
  const csv = createCsvReportWithProvenance(null);
  const lines = csv.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(splitCsvLine(lines[0]), PROVENANCE_LEDGER_COLUMNS);
});
