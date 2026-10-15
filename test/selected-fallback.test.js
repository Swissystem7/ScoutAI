'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createStore, serializeMetricHash, parseMetricHash } = require('../demo.js');

function player(name, minutes) {
  return { name: name, team: 'T', position: 'CM', minutes: minutes, pressures: 10, tackles: 2, passesCompleted: 50 };
}

// When the selected player no longer clears the minutes floor, derive()
// falls back to the first ranked row for the lesson, explorer and export.
// The spec it returns must name that same row: otherwise the table has no
// highlighted row and the share link / export bundle name two different
// players.
test('derive keeps spec.selectedId in step with the player it actually selected', () => {
  const store = createStore({ players: [player('Low', 300), player('High', 800)] });
  const low = store.players.find((row) => row.name === 'Low');
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 500, selectedId: low.id });
  assert.equal(view.rows.length, 1);
  assert.equal(view.selected.name, 'High');
  assert.equal(view.spec.selectedId, view.selected.id);
  assert.equal(view.exportBundle.selected.id, view.selected.id);
  assert.equal(parseMetricHash(serializeMetricHash(view.spec)).selectedId, view.selected.id);
});

test('derive still honours a selected id that is in the ranking', () => {
  const store = createStore({ players: [player('Low', 300), player('High', 800)] });
  const low = store.players.find((row) => row.name === 'Low');
  const view = store.derive({ selectedId: low.id });
  assert.equal(view.selected.id, low.id);
  assert.equal(view.spec.selectedId, low.id);
});

test('derive leaves selectedId alone when no row clears the floor', () => {
  const store = createStore({ players: [player('Low', 300), player('High', 800)] });
  const low = store.players.find((row) => row.name === 'Low');
  const view = store.derive({ minMinutes: 900, selectedId: low.id });
  assert.equal(view.rows.length, 0);
  assert.equal(view.selected, null);
  assert.equal(view.spec.selectedId, low.id);
});
