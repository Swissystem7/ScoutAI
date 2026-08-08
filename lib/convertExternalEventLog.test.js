const assert = require('node:assert');
const { convertExternalEventLog } = require('./convertExternalEventLog.js');

// Normal case: opta_json with valid data
const optaJsonData = JSON.stringify([
  { timestamp: '2023-01-01T12:00:00Z', type_id: 1, player_id: 'p1', x: 50, y: 50, outcome: true },
  { timestamp: '2023-01-01T12:01:00Z', type_id: 2, player_id: 'p2', x: 80, y: 30, outcome: false }
]);
const result1 = convertExternalEventLog(optaJsonData, 'opta_json');
assert.strictEqual(result1.length, 2);
assert.strictEqual(result1[0].eventType, 'pass');
assert.strictEqual(result1[0].playerId, 'p1');
assert.deepStrictEqual(result1[0].location, [50, 50]);
assert.strictEqual(result1[0].outcome, 'success');
assert.strictEqual(result1[1].eventType, 'shot');
assert.strictEqual(result1[1].playerId, 'p2');
assert.deepStrictEqual(result1[1].location, [80, 30]);
assert.strictEqual(result1[1].outcome, 'failure');

// Edge case: empty input
assert.deepStrictEqual(convertExternalEventLog('', 'opta_json'), []);
assert.deepStrictEqual(convertExternalEventLog('   ', 'opta_json'), []);
assert.deepStrictEqual(convertExternalEventLog(null, 'opta_json'), []);
assert.deepStrictEqual(convertExternalEventLog(undefined, 'opta_json'), []);

// Edge case: unsupported format
const result2 = convertExternalEventLog('some data', 'unsupported');
assert.deepStrictEqual(result2, { error: 'Unsupported format' });

// Edge case: invalid JSON for opta_json
const result3 = convertExternalEventLog('not json', 'opta_json');
assert.deepStrictEqual(result3, { error: 'Parse failure' });

// Edge case: opta_json with match wrapper object
const optaJsonWrapper = JSON.stringify({ match: { event: [{ timestamp: 100, type_id: 3, player_id: 'p3', x: 10, y: 20, outcome: true }] } });
const result4 = convertExternalEventLog(optaJsonWrapper, 'opta_json');
assert.strictEqual(result4.length, 1);
assert.strictEqual(result4[0].eventType, 'foul');

// Edge case: wyscout_csv with valid data
const wyscoutCsvData = 'timestamp,event,playerid,x,y,outcome\n100,pass,p1,50,50,success\n200,shot,p2,80,30,failure';
const result5 = convertExternalEventLog(wyscoutCsvData, 'wyscout_csv');
assert.strictEqual(result5.length, 2);
assert.strictEqual(result5[0].eventType, 'pass');
assert.strictEqual(result5[0].playerId, 'p1');
assert.deepStrictEqual(result5[0].location, [50, 50]);
assert.strictEqual(result5[0].outcome, 'success');

// Edge case: wyscout_csv missing columns
const wyscoutCsvMissing = 'timestamp,event,x,y\n100,pass,50,50';
const result6 = convertExternalEventLog(wyscoutCsvMissing, 'wyscout_csv');
assert.deepStrictEqual(result6, []);

// Edge case: manual_csv with valid data
const manualCsvData = 'timestamp,eventtype,playerid,x,y,outcome\n100,pass,p1,50,50,success\n200,shot,p2,80,30,failure';
const result7 = convertExternalEventLog(manualCsvData, 'manual_csv');
assert.strictEqual(result7.length, 2);
assert.strictEqual(result7[0].eventType, 'pass');
assert.strictEqual(result7[0].playerId, 'p1');

// Edge case: manual_csv missing columns
const manualCsvMissing = 'timestamp,eventtype,x,y\n100,pass,50,50';
const result8 = convertExternalEventLog(manualCsvMissing, 'manual_csv');
assert.deepStrictEqual(result8, []);

// Edge case: xml_match with valid data (simulated with DOMParser)
// Note: In Node.js, DOMParser is not available; this test will fail unless polyfilled.
// For the purpose of this test, we assume a polyfill or skip.
// Skipping xml_match tests due to DOMParser dependency.

// Edge case: playerIdMapping
const mapping = { p1: 'mapped1', p2: 'mapped2' };
const result9 = convertExternalEventLog(optaJsonData, 'opta_json', { playerIdMapping: mapping });
assert.strictEqual(result9[0].playerId, 'mapped1');
assert.strictEqual(result9[1].playerId, 'mapped2');

// Edge case: timezoneOffset
const result10 = convertExternalEventLog(JSON.stringify([{ timestamp: 100, type_id: 1, player_id: 'p1', x: 50, y: 50, outcome: true }]), 'opta_json', { timezoneOffset: 60 });
assert.strictEqual(result10[0].timestamp, 100 + 60 * 60);

// Edge case: missing required fields in opta event
const optaMissing = JSON.stringify([{ player_id: 'p1', x: 50, y: 50, outcome: true }]);
const result11 = convertExternalEventLog(optaMissing, 'opta_json');
assert.strictEqual(result11.length, 0);

// Edge case: location normalization (values > 100)
const optaLarge = JSON.stringify([{ timestamp: 100, type_id: 1, player_id: 'p1', x: 200, y: 300, outcome: true }]);
const result12 = convertExternalEventLog(optaLarge, 'opta_json');
assert.deepStrictEqual(result12[0].location, [100, 100]);

// Edge case: location normalization (NaN)
const optaNaN = JSON.stringify([{ timestamp: 100, type_id: 1, player_id: 'p1', x: 'abc', y: 50, outcome: true }]);
const result13 = convertExternalEventLog(optaNaN, 'opta_json');
assert.deepStrictEqual(result13[0].location, [0, 0]);

// Edge case: parseTimestamp with number
const result14 = convertExternalEventLog(JSON.stringify([{ timestamp: 500, type_id: 1, player_id: 'p1', x: 50, y: 50, outcome: true }]), 'opta_json');
assert.strictEqual(result14[0].timestamp, 500);

// Edge case: parseTimestamp with date string
const result15 = convertExternalEventLog(JSON.stringify([{ timestamp: '2023-01-01T00:00:00Z', type_id: 1, player_id: 'p1', x: 50, y: 50, outcome: true }]), 'opta_json');
assert.strictEqual(result15[0].timestamp, Math.floor(new Date('2023-01-01T00:00:00Z').getTime() / 1000));

// Edge case: mapOptaEventType unknown type
const result16 = convertExternalEventLog(JSON.stringify([{ timestamp: 100, type_id: 99, player_id: 'p1', x: 50, y: 50, outcome: true }]), 'opta_json');
assert.strictEqual(result16[0].eventType, '99');

console.log('ok');