'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { auditPositions, filterByPosition, positionGroup } = require('../demo.js');

// A label that lands in UT (technical / unknown) must be reported like an OT
// label: with position normalisation on, UT players are ranked only against
// each other, so a silent UT bucket is the same surprise an OT bucket was.
test('auditPositions reports labels that land in UT, separately from OT', () => {
  const rows = [
    { position: 'Unknown' },
    { position: 'Technical Role' },
    { position: 'CB' },
    { position: 'Pivot' },
    { position: 'Unknown' }
  ];
  assert.equal(positionGroup('Unknown'), 'UT');
  const notes = auditPositions(rows);
  assert.equal(notes.length, 2);
  assert.ok(notes[0].startsWith('עמדות שלא זוהו ונחשבות OT'), notes[0]);
  assert.ok(notes[0].includes('Pivot') && !notes[0].includes('Unknown'), notes[0]);
  assert.ok(notes[1].startsWith('עמדות שסומנו UT'), notes[1]);
  assert.ok(notes[1].includes('Unknown') && notes[1].includes('Technical Role'), notes[1]);
  assert.equal(notes[1].split('Unknown').length, 2, 'each UT label is listed once');
});

test('auditPositions stays silent when every position is a real group', () => {
  assert.deepEqual(auditPositions([{ position: 'GK' }, { position: 'Striker' }, { position: '' }]), []);
});

test('filterByPosition treats UT as a selectable group', () => {
  const sample = [
    { name: 'Tech', team: 'A', position: 'Technical Role', minutes: 400 },
    { name: 'Mystery', team: 'A', position: 'Unknown', minutes: 400 },
    { name: 'Centre', team: 'B', position: 'CB', minutes: 400 },
    { name: 'Pivot', team: 'C', position: 'Pivot', minutes: 400 }
  ];
  assert.deepEqual(filterByPosition(sample, 'UT').map((row) => row.name), ['Tech', 'Mystery']);
  assert.deepEqual(filterByPosition(sample, 'ut').map((row) => row.name), ['Tech', 'Mystery']);
  assert.deepEqual(filterByPosition(sample, 'OT').map((row) => row.name), ['Pivot']);
});
