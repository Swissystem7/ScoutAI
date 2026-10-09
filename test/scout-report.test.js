'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const R = require('../radar.js');
const S = require('../scout-report.js');
const data = R.decode(JSON.parse(fs.readFileSync(path.join(root, 'data', 'radar_tournaments.json'), 'utf8')));
const html = fs.readFileSync(path.join(root, 'shortlist', 'index.html'), 'utf8');

function player(name, t) {
  const p = data.players.find((x) => x.name === name && x.t === t);
  assert.ok(p, name + ' in ' + t);
  return p;
}

test('percentile: mid-rank ties, null when there is nothing to compare', () => {
  assert.equal(S.percentile(5, [1, 2, 3, 4]), 100);
  assert.equal(S.percentile(0, [1, 2, 3, 4]), 0);
  assert.equal(S.percentile(2, [1, 2, 2, 3]), 50);
  assert.equal(S.percentile(null, [1]), null);
  assert.equal(S.percentile(1, []), null);
});

test('report for an outfield player: strengths ≥ 75th pct, weaknesses ≤ 25th, roles sorted, licence note', () => {
  const rep = S.buildReport(data.players, player('Luka Modrić', 'wc2018'), 'מונדיאל 2018');
  assert.equal(rep.player.group, 'MF');
  assert.ok(rep.strengths.length >= 1);
  rep.strengths.forEach((s) => assert.ok(s.pct >= 75 && s.kind !== 'style'));
  rep.weaknesses.forEach((s) => assert.ok(s.pct <= 25 && s.kind !== 'style'));
  for (let i = 1; i < rep.roles.length; i += 1) assert.ok(rep.roles[i - 1].score >= rep.roles[i].score);
  assert.equal(rep.roles.length, 4);
  assert.match(rep.licence, /שימוש מסחרי .*אסור/);
  assert.ok(rep.caveats.some((c) => /אין מדידות גוף/.test(c)));
  assert.ok(rep.caveats.some((c) => /לא מסיק אופי/.test(c)));
  assert.ok(!rep.profile.some((r) => /height|weight|face/i.test(r.id)));
});

test('goalkeeper report uses keeper metrics only', () => {
  const rep = S.buildReport(data.players, player('Thibaut Courtois', 'wc2018'), 'x');
  assert.equal(rep.player.group, 'GK');
  assert.deepEqual(rep.profile.map((r) => r.id).sort(), ['gkLongShare', 'passAcc', 'passesCompleted90', 'recoveries90']);
  assert.ok(rep.roles.every((r) => /^gk/.test(r.id)));
});

test('small samples are flagged in the report', () => {
  const low = data.players.find((p) => p.minutes < 150 && p.positionGroup === 'FW');
  const rep = S.buildReport(data.players, low, 'x');
  assert.match(rep.caveats[0], /מדגם קטן/);
});

test('shortlist: add is idempotent, remove works, broken storage never throws', () => {
  const p = player('Luka Modrić', 'wc2018');
  let list = S.addToShortlist([], p, 'הערה');
  list = S.addToShortlist(list, p);
  assert.equal(list.length, 1);
  assert.equal(list[0].note, 'הערה');
  assert.equal(S.removeFromShortlist(list, p).length, 0);
  const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { assert.equal(k, S.STORAGE_KEY); this.v = v; } };
  assert.equal(S.saveShortlist(mem, list), true);
  assert.deepEqual(S.loadShortlist(mem).map(S.keyOf), ['wc2018:' + p.id]);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(S.loadShortlist(broken), []);
  assert.equal(S.saveShortlist(broken, list), false);
  assert.deepEqual(S.loadShortlist({ getItem() { return '{not json'; } }), []);
  assert.deepEqual(S.loadShortlist(null), []);
});

test('CSV: UTF-8 BOM, Hebrew header, quoting, and no spreadsheet formula injection', () => {
  const reps = [S.buildReport(data.players, player('Luka Modrić', 'wc2018'), 'מונדיאל 2018')];
  const csv = S.shortlistCsv(reps, ['=HYPERLINK("x")']);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], S.CSV_HEADER.join(','));
  assert.match(lines[1], /^Luka Modrić,Croatia,מונדיאל 2018,קישור,/);
  assert.match(lines[1], /"'=HYPERLINK\(""x""\)"/);
  assert.equal(S.csvCell('a,b'), '"a,b"');
  assert.equal(S.csvCell('-1'), "'-1");
  const parsed = R.parseCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]['שם'], 'Luka Modrić');
});

test('bring your own players: required columns, then a report against their own pool', () => {
  assert.match(S.parseByodPlayers(R.parseCsv('name,team\nA,B')).error, /position/);
  let csv = 'name,team,position,minutes,passes,passesCompleted,keyPasses,pressures\n';
  for (let i = 0; i < 25; i += 1) csv += 'P' + i + ',Club,Center Midfield,' + (300 + i * 10) + ',' + (200 + i) + ',' + (150 + i) + ',' + (i % 7) + ',' + (40 + i) + '\n';
  const res = S.parseByodPlayers(R.parseCsv(csv));
  assert.equal(res.players.length, 25);
  const rep = S.buildReport(res.players, res.players[24], 'הנתונים שלכם');
  assert.equal(rep.player.group, 'MF');
  assert.match(rep.licence, /רישיון/);
  assert.ok(rep.profile.find((r) => r.id === 'passesCompleted90').pct != null);
  const list = S.addToShortlist([], res.players[0]);
  assert.ok(list[0].row, 'BYOD rows keep their numbers in the shortlist');
});

test('shortlist page: Hebrew RTL, print shows only the report, CSV export, no images', () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /@media print/);
  assert.match(html, /section:not\(#reportCard\)/);
  assert.match(html, /ייצוא CSV/);
  assert.match(html, /<script src="\.\.\/scout-report\.js"><\/script>/);
  assert.ok(!/<img\b/i.test(html));
});
