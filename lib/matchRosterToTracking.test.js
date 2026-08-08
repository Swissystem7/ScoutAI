const assert = require('node:assert');
const { matchRosterToTracking } = require('./matchRosterToTracking.js');

// Normal case: each roster player matches the track where their jersey is most frequent.
const rosterCSV = 'name,jersey_number\nAlice,10\nBob,20\nCharlie,30';
const trackingIDs = [
  { id: 't1', jerseys: [10, 10, 20], spatialCluster: [50, 60] },
  { id: 't2', jerseys: [20, 20, 20], spatialCluster: [150, 160] },
  { id: 't3', jerseys: [30, 10], spatialCluster: [250, 260] }
];
const matchMetadata = { teamColors: ['red'], knownPlayerNumbers: [10, 20, 30] };
const result = matchRosterToTracking(rosterCSV, trackingIDs, matchMetadata);
assert.strictEqual(result.length, 3);
assert.strictEqual(result[0].rosterName, 'Alice');
assert.strictEqual(result[0].trackingId, 't1');
assert.ok(result[0].confidence > 0 && result[0].confidence <= 1);
assert.strictEqual(result[1].rosterName, 'Bob');
assert.strictEqual(result[1].trackingId, 't2');
assert.strictEqual(result[2].rosterName, 'Charlie');
assert.strictEqual(result[2].trackingId, 't3');

// Edge case: empty / non-string / header-only / missing-column CSV -> Invalid CSV
assert.deepStrictEqual(matchRosterToTracking('', trackingIDs, matchMetadata), { error: 'Invalid CSV' });
assert.deepStrictEqual(matchRosterToTracking(123, trackingIDs, matchMetadata), { error: 'Invalid CSV' });
assert.deepStrictEqual(matchRosterToTracking('name,jersey_number', trackingIDs, matchMetadata), { error: 'Invalid CSV' });
assert.deepStrictEqual(matchRosterToTracking('name,age\nAlice,25', trackingIDs, matchMetadata), { error: 'Invalid CSV' });

// Edge case: malformed rows (blank / non-numeric jersey) are dropped, valid ones kept
const rosterCSV2 = 'name,jersey_number\nAlice,10\nBob,\nCharlie,abc';
const result2 = matchRosterToTracking(rosterCSV2, trackingIDs, matchMetadata);
assert.strictEqual(result2.length, 1);
assert.strictEqual(result2[0].rosterName, 'Alice');

// Edge case: empty / null trackingIDs -> []
assert.deepStrictEqual(matchRosterToTracking(rosterCSV, [], matchMetadata), []);
assert.deepStrictEqual(matchRosterToTracking(rosterCSV, null, matchMetadata), []);

// Edge case: jersey never detected in any track -> omit entry (spec: "No match found").
// Only jersey 99 is seen; roster jerseys 10/20/30 appear nowhere, so no matches.
const noMatch = matchRosterToTracking(rosterCSV, [{ id: 't1', jerseys: [99], spatialCluster: [0, 0] }], matchMetadata);
assert.strictEqual(noMatch.length, 0);

// Edge case: same roster name mapped twice -> keep the higher-confidence match.
// Alice#10 appears once-in-three in t1 (freq 0.33); Alice#20 appears twice-in-two in t2
// (freq 1.0). Identical spatial for both tracks, so the jersey-20 match wins and overrides.
const rosterCSVdup = 'name,jersey_number\nAlice,10\nAlice,20';
const trackingIDsDup = [
  { id: 't1', jerseys: [10, 99, 99], spatialCluster: [100, 100] },
  { id: 't2', jerseys: [20, 20], spatialCluster: [100, 100] }
];
const dupRes = matchRosterToTracking(rosterCSVdup, trackingIDsDup, { teamColors: [], knownPlayerNumbers: [10, 20] });
assert.strictEqual(dupRes.length, 1);
assert.strictEqual(dupRes[0].rosterName, 'Alice');
assert.strictEqual(dupRes[0].trackingId, 't2');
assert.ok(dupRes[0].confidence > 0 && dupRes[0].confidence <= 1);

// Edge case: matchMetadata missing optional fields -> falls back to roster jerseys, still matches
const result5 = matchRosterToTracking(rosterCSV, trackingIDs, {});
assert.strictEqual(result5.length, 3);

console.log('ok');