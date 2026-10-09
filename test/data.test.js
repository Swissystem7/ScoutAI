'use strict';

// Guards the shipped StatsBomb aggregate file. demo.js prefers the stored
// per90 numbers over its own division (rawPer90), so a re-export that changes
// a total without its per90 twin would show wrong rates with no error.

const assert = require('node:assert/strict');
const test = require('node:test');
const wc = require('../data/wc2018_event_aggregates.json');

const COUNTS = [
  'passesCompleted', 'keyPasses', 'assists', 'shots', 'shotsOnTarget', 'goals',
  'bigChanceProxy', 'boxTouches', 'progressiveActions', 'dribbles', 'duelsWon',
  'defensiveActions', 'pressures', 'tackles', 'interceptions'
];
const RATED = [...COUNTS, 'shotXgSum'];

test('header names WC2018 with 64 distinct matches', () => {
  assert.equal(wc.source, 'StatsBomb Open Data');
  assert.equal(wc.competitionId, 43);
  assert.equal(wc.seasonId, 3);
  assert.equal(wc.games, 64);
  assert.equal(wc.matchIds.length, 64);
  assert.equal(new Set(wc.matchIds).size, 64);
});

test('every player is one name/team pair across 32 teams', () => {
  for (const p of wc.players) {
    assert.ok(typeof p.name === 'string' && p.name.trim(), JSON.stringify(p.name));
    assert.ok(typeof p.team === 'string' && p.team.trim(), p.name);
  }
  const ids = wc.players.map((p) => `${p.name}|${p.team}`);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(wc.players.map((p) => p.team)).size, 32);
});

test('counts are non-negative integers and xG is a non-negative number', () => {
  for (const p of wc.players) {
    for (const key of COUNTS) assert.ok(Number.isInteger(p[key]) && p[key] >= 0, `${p.name} ${key}=${p[key]}`);
    assert.ok(Number.isFinite(p.shotXgSum) && p.shotXgSum >= 0, `${p.name} shotXgSum=${p.shotXgSum}`);
  }
});

test('minutes and matches fit a 7-match tournament with extra time', () => {
  for (const p of wc.players) {
    assert.ok(Number.isInteger(p.matchesPlayed) && p.matchesPlayed >= 1 && p.matchesPlayed <= 7, p.name);
    assert.ok(p.totalMinutesProxy >= 1 && p.totalMinutesProxy <= p.matchesPlayed * 130, `${p.name} ${p.totalMinutesProxy}`);
  }
});

test('nested counts never exceed their parent', () => {
  for (const p of wc.players) {
    assert.ok(p.goals <= p.shotsOnTarget && p.shotsOnTarget <= p.shots, `${p.name} goals/on target/shots`);
    assert.ok(p.bigChanceProxy <= p.shots, `${p.name} big chances > shots`);
    assert.ok(p.shotXgSum <= p.shots, `${p.name} xG > shots`);
    assert.ok(p.tackles + p.interceptions <= p.defensiveActions, `${p.name} tackles+interceptions > defensive actions`);
  }
});

test('stored per90 matches total x 90 / minutes for every rated stat', () => {
  for (const p of wc.players) {
    assert.deepEqual(Object.keys(p.per90).sort(), RATED.map((k) => `${k}Per90`).sort(), p.name);
    for (const key of RATED) {
      const expected = (p[key] * 90) / p.totalMinutesProxy;
      const stored = p.per90[`${key}Per90`];
      assert.ok(Math.abs(stored - expected) <= 0.0005, `${p.name} ${key}Per90 ${stored} vs ${expected}`);
    }
  }
});

test('a missing position is allowed only for a player with no recorded event', () => {
  for (const p of wc.players) {
    if (typeof p.position === 'string' && p.position.trim()) continue;
    assert.equal(p.position, null, p.name);
    assert.ok(RATED.every((key) => p[key] === 0), `${p.name} has events but no position`);
  }
});
