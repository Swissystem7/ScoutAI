'use strict';

// Writes data/basketball.example.csv: a SYNTHETIC season for the basketball
// lab. No real league, team or player. Every number comes from a seeded
// random generator, so the file is reproducible:
//
//   node tools/make-basketball-example.js
//
// One hidden "skill" per player drives both the box-score counts and +/-.
// That is on purpose and is said on the page: the metric "working" on +/-
// in this file is a property of the generator, not a finding.
// The player names do not feed anything; PanimGuide reads them anyway.

const fs = require('node:fs');
const path = require('node:path');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261114);
function gauss() {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A second stream for the two "new line" practice columns, so adding them
// leaves every box-score number above unchanged.
//   שפת גוף (אקראי): pure noise, 1-5. Nothing real can be in it.
//   בקרה (מושתל): built from the same hidden skill plus noise. A positive
//   control: it shows the test can find an effect when one was planted.
// Neither is a body-language measurement.
const rand2 = mulberry32(5150);
function gauss2() {
  const u = Math.max(rand2(), 1e-12);
  const v = rand2();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Per-40-minute baselines by position (rough FIBA-level shapes).
const ROLE = {
  PG: { word: 'רכז', pts: 15, ast: 6.5, stl: 1.7, blk: 0.2, orb: 0.8, drb: 4.0, tov: 3.1, fga: 13, fta: 4.0, tpa: 5.0, pf: 3.0 },
  SG: { word: 'קלע', pts: 17, ast: 3.3, stl: 1.4, blk: 0.3, orb: 0.9, drb: 4.4, tov: 2.3, fga: 14, fta: 3.8, tpa: 6.0, pf: 3.1 },
  SF: { word: 'פורוורד', pts: 15, ast: 2.7, stl: 1.2, blk: 0.6, orb: 1.6, drb: 6.0, tov: 2.0, fga: 12, fta: 3.6, tpa: 4.5, pf: 3.3 },
  PF: { word: 'פאוור', pts: 14, ast: 2.1, stl: 1.0, blk: 1.1, orb: 2.6, drb: 7.4, tov: 1.9, fga: 11, fta: 4.0, tpa: 2.4, pf: 3.6 },
  C: { word: 'סנטר', pts: 13, ast: 1.5, stl: 0.8, blk: 1.8, orb: 3.4, drb: 8.4, tov: 2.1, fga: 9.5, fta: 4.4, tpa: 0.4, pf: 4.0 }
};
const ROSTER = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C'];
const TEAMS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

function count(rate, minutes, skill) {
  const value = rate * (1 + 0.16 * skill) * (1 + 0.1 * gauss()) * minutes / 40;
  return Math.max(0, Math.round(value));
}

const rows = [];
TEAMS.forEach(function (letter) {
  const teamEffect = gauss() * 2.5;
  ROSTER.forEach(function (pos, k) {
    const role = ROLE[pos];
    const skill = gauss();
    const games = 22 + Math.floor(rand() * 9);
    const mpg = Math.max(6, Math.min(34, 20 + 6 * skill + 4 * gauss() - (k >= 5 ? 6 : 0)));
    const minutes = Math.round(games * mpg);

    const fga = count(role.fga, minutes, skill * 0.6);
    const tpa = Math.min(fga, count(role.tpa, minutes, 0));
    const twoPa = fga - tpa;
    const twoPm = Math.round(twoPa * Math.max(0.3, Math.min(0.7, 0.5 + 0.03 * skill + 0.03 * gauss())));
    const tpm = Math.round(tpa * Math.max(0.15, Math.min(0.5, 0.35 + 0.02 * skill + 0.03 * gauss())));
    const fta = count(role.fta, minutes, skill * 0.5);
    const ftm = Math.round(fta * Math.max(0.45, Math.min(0.95, 0.74 + 0.03 * skill + 0.05 * gauss())));
    const points = twoPm * 2 + tpm * 3 + ftm;
    const orb = count(role.orb, minutes, skill);
    const drb = count(role.drb, minutes, skill);
    const ast = count(role.ast, minutes, skill);
    const stl = count(role.stl, minutes, skill);
    const blk = count(role.blk, minutes, skill);
    const tov = count(role.tov, minutes, -0.5 * skill);
    const pf = count(role.pf, minutes, 0);
    const plusMinus = Math.round((4 * skill + teamEffect + 4 * gauss()) * minutes / 40);
    const fgm = twoPm + tpm;
    // Simplified PIR: PTS + REB + AST + STL + BLK - missed FG - missed FT - TOV - PF.
    const pir = points + orb + drb + ast + stl + blk - (fga - fgm) - (fta - ftm) - tov - pf;
    const randomLine = Math.round((1 + rand2() * 4) * 10) / 10;
    const plantedLine = Math.round(Math.max(1, Math.min(5, 3 + 0.8 * skill + 0.8 * gauss2())) * 10) / 10;

    rows.push([
      role.word + ' הדגמה ' + letter + (k + 1),
      'קבוצה ' + letter + '׳',
      pos, games, minutes, points, orb + drb, orb, drb, ast, stl, blk, tov,
      fgm, fga, ftm, fta, tpm, tpa, pf, plusMinus, pir, randomLine, plantedLine
    ]);
  });
});

const header = ['Player', 'Team', 'Pos', 'G', 'MP', 'PTS', 'TRB', 'ORB', 'DRB', 'AST', 'STL', 'BLK', 'TOV',
  'FG', 'FGA', 'FT', 'FTA', '3P', '3PA', 'PF', '+/-', 'PIR', 'שפת גוף (אקראי)', 'בקרה (מושתל)'];
const csv = [header].concat(rows).map(function (cells) { return cells.join(','); }).join('\n') + '\n';
const out = path.join(__dirname, '..', 'data', 'basketball.example.csv');
fs.writeFileSync(out, csv, 'utf8');
console.log('wrote ' + rows.length + ' synthetic players to ' + path.relative(process.cwd(), out));

// ---------------------------------------------------------------------------
// data/basketball.gamelog.example.csv: a SYNTHETIC game-by-game season (one
// row per player per round) for the start-of-season test. Its own seeded
// stream, so the season file above does not change.
//
// Each player has a hidden skill that drifts during the season (some improve,
// some fade), and every game adds noise. So even a good metric cannot read
// the rest of the season perfectly from the first rounds — on purpose.
const rand3 = mulberry32(2026111402);
function gauss3() {
  const u = Math.max(rand3(), 1e-12);
  const v = rand3();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const ROUNDS = 14;

function gameCount(rate, minutes, skill) {
  const value = rate * (1 + 0.16 * skill) * (1 + 0.35 * gauss3()) * minutes / 40;
  return Math.max(0, Math.round(value));
}

const players = [];
TEAMS.forEach(function (letter) {
  const teamEffect = gauss3() * 2.5;
  ROSTER.forEach(function (pos, k) {
    const skill = gauss3();
    players.push({
      name: ROLE[pos].word + ' דמו ' + letter + (k + 1),
      team: 'קבוצה ' + letter + '׳',
      pos: pos,
      skill: skill,
      drift: 0.6 * gauss3(),
      mpg: Math.max(6, Math.min(34, 20 + 6 * skill + 4 * gauss3() - (k >= 5 ? 6 : 0))),
      teamEffect: teamEffect
    });
  });
});

const logRows = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  players.forEach(function (p) {
    if (rand3() < 0.05) return; // did not play
    const role = ROLE[p.pos];
    const skill = p.skill + p.drift * (round - 1) / (ROUNDS - 1);
    const minutes = Math.max(3, Math.min(40, Math.round(p.mpg * (1 + 0.15 * gauss3()))));
    const fga = gameCount(role.fga, minutes, skill * 0.6);
    const tpa = Math.min(fga, gameCount(role.tpa, minutes, 0));
    const twoPa = fga - tpa;
    const twoPm = Math.round(twoPa * Math.max(0.2, Math.min(0.8, 0.5 + 0.03 * skill + 0.1 * gauss3())));
    const tpm = Math.round(tpa * Math.max(0, Math.min(0.7, 0.35 + 0.02 * skill + 0.12 * gauss3())));
    const fta = gameCount(role.fta, minutes, skill * 0.5);
    const ftm = Math.round(fta * Math.max(0.3, Math.min(1, 0.74 + 0.03 * skill + 0.12 * gauss3())));
    const points = twoPm * 2 + tpm * 3 + ftm;
    const orb = gameCount(role.orb, minutes, skill);
    const drb = gameCount(role.drb, minutes, skill);
    const ast = gameCount(role.ast, minutes, skill);
    const stl = gameCount(role.stl, minutes, skill);
    const blk = gameCount(role.blk, minutes, skill);
    const tov = gameCount(role.tov, minutes, -0.5 * skill);
    const pf = Math.min(5, gameCount(role.pf, minutes, 0));
    const plusMinus = Math.round((4 * skill + p.teamEffect) * minutes / 40 + 7 * gauss3() * Math.sqrt(minutes / 40));
    const fgm = twoPm + tpm;
    const pir = points + orb + drb + ast + stl + blk - (fga - fgm) - (fta - ftm) - tov - pf;
    logRows.push([round, p.name, p.team, p.pos, minutes, points, orb + drb, orb, drb, ast, stl, blk, tov,
      fgm, fga, ftm, fta, tpm, tpa, pf, plusMinus, pir]);
  });
}

const logHeader = ['Round', 'Player', 'Team', 'Pos', 'MP', 'PTS', 'TRB', 'ORB', 'DRB', 'AST', 'STL', 'BLK', 'TOV',
  'FG', 'FGA', 'FT', 'FTA', '3P', '3PA', 'PF', '+/-', 'PIR'];
const logCsv = [logHeader].concat(logRows).map(function (cells) { return cells.join(','); }).join('\n') + '\n';
const logOut = path.join(__dirname, '..', 'data', 'basketball.gamelog.example.csv');
fs.writeFileSync(logOut, logCsv, 'utf8');
console.log('wrote ' + logRows.length + ' synthetic game rows (' + players.length + ' players, ' + ROUNDS + ' rounds) to ' +
  path.relative(process.cwd(), logOut));
