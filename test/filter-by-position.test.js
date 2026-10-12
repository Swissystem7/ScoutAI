'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { filterByPosition, createStore, positionGroup } = require('../demo.js');

const sample = [
  { name: 'Keeper', team: 'A', position: 'GK', minutes: 400 },
  { name: 'Centre', team: 'A', position: 'CB', minutes: 400 },
  { name: 'Wing', team: 'B', position: 'LW', minutes: 400 },
  { name: 'Striker', team: 'B', position: 'ST', minutes: 400 },
  { name: 'Pivot', team: 'C', position: 'CDM', minutes: 400 }
];

test('filterByPosition returns all players when no position is selected', () => {
  assert.deepEqual(filterByPosition(sample, ''), sample);
  assert.deepEqual(filterByPosition(sample, null), sample);
});

test('filterByPosition keeps only players in the selected position group', () => {
  const df = filterByPosition(sample, 'DF');
  assert.deepEqual(df.map((row) => row.name), ['Centre']);
  assert.equal(positionGroup(df[0].position), 'DF');

  const fw = filterByPosition(sample, 'FW');
  assert.deepEqual(fw.map((row) => row.name).sort(), ['Striker', 'Wing']);

  const mf = filterByPosition(sample, 'MF');
  assert.deepEqual(mf.map((row) => row.name), ['Pivot']);
});

test('filterByPosition matches a specific position code within a group', () => {
  const stOnly = filterByPosition(sample, 'ST');
  assert.deepEqual(stOnly.map((row) => row.name), ['Striker']);
  assert.ok(filterByPosition(sample, 'LW').every((row) => row.position === 'LW'));
});

test('filterByPosition works on prepared players from the store', () => {
  const store = createStore({ players: sample });
  const gk = filterByPosition(store.players, 'GK');
  assert.equal(gk.length, 1);
  assert.equal(gk[0].name, 'Keeper');
  assert.equal(gk[0].positionGroup, 'GK');
});
