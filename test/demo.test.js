'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  createDemoFixture,
  preparePocRows,
  SEASON_MISLABELED,
  applyMetric,
  parseMetricHash,
  serializeMetricHash,
  DEFAULT_METRIC,
  componentsFromEvents,
  compositeScore,
  buildLesson,
  fragilityReport
} = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'demo.js'), 'utf8');

test('same seed yields byte-for-byte equivalent metadata', () => {
  const first = JSON.stringify(createDemoFixture('athlete-fixture-7'));
  const second = JSON.stringify(createDemoFixture('athlete-fixture-7'));
  assert.equal(first, second);
});

test('fixture declares provenance and never claims video analysis', () => {
  const fixture = createDemoFixture('provenance');
  assert.equal(fixture.video.provenance, 'LOCAL_VIDEO');
  assert.equal(fixture.video.analyzed, false);
  assert.equal(fixture.video.uploaded, false);
  assert.equal(fixture.service.provenance, 'VERIFIED_ANALYSIS_SERVICE');
  assert.equal(fixture.service.available, false);
  assert.ok(fixture.metrics.every(item => item.provenance === 'DEMO_METRIC' && item.measured === false));
  assert.ok(fixture.timeline.every(item => item.provenance === 'DEMO_METRIC'));
});

test('runtime contains no external network or submission path', () => {
  const productRuntime = `${html}\n${runtime}`;
  const forbidden = [
    /XMLHttpRequest/i, /sendBeacon/i, /WebSocket/i,
    /<form\b/i, /type=["']submit/i, /mailto:/i, /https?:\/\//i,
    /fetch\s*\(\s*['"`]https?:/i
  ];
  forbidden.forEach(pattern => assert.doesNotMatch(productRuntime, pattern));
  assert.match(html, /fetch\s*\(\s*['"]poc-calibrated\.json['"]\s*\)/);
  assert.match(html, /fetch\s*\(\s*['"]poc-top30\.json['"]\s*\)/);
  assert.match(html, /fetch\s*\(\s*['"]data\/wc2018_event_aggregates\.json['"]\s*\)/);
});

test('UI labels provenance and unavailable external actions', () => {
  for (const label of ['LOCAL_VIDEO', 'DEMO_METRIC', 'VERIFIED_ANALYSIS_SERVICE', 'STATSBOMB_OPEN_DATA']) {
    assert.match(html, new RegExp(label, 'g'));
  }
  assert.match(html, /אינן זמינות/);
  assert.match(html, /דבר לא נשלח/);
  assert.match(html, /אינו מספק סקאוטינג מקצועי/);
});

test('preparePocRows ranks calibrated players and tags StatsBomb provenance', () => {
  const rows = preparePocRows({
    men: [{ id: '2', name: 'B', team: 'T', comp: 'WorldCup2022', minutes: 200, index: 10 }],
    women: [{ id: '1', name: 'A', team: 'T', comp: 'FA_WSL_2023_24', minutes: 900, index: 20 }]
  }, [{ id: '1', breakdown: { stat: { value: 20, weight: 1 } }, explanation: 'stat driven' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'A');
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].provenance, 'STATSBOMB_OPEN_DATA');
  assert.equal(rows[0].breakdown.stat.value, 20);
  assert.equal(rows[1].name, 'B');
  assert.equal(rows[1].comp, 'WorldCup2022');
});

test('World Cup rows over 480 minutes are flagged as season data, mislabeled', () => {
  const rows = preparePocRows({
    men: [
      { id: 'ok', name: 'Plausible WC', team: 'Canada', comp: 'WorldCup2022', minutes: 270, index: 30 },
      { id: 'bad', name: 'Jonas Hofmann', team: 'Germany', comp: 'WorldCup2022', minutes: 2279, index: 47.88 }
    ],
    women: []
  });
  const flagged = rows.find(row => row.name === 'Jonas Hofmann');
  const kept = rows.find(row => row.name === 'Plausible WC');
  assert.equal(flagged.hygiene, SEASON_MISLABELED);
  assert.equal(flagged.comp, SEASON_MISLABELED);
  assert.equal(flagged.labeledComp, 'WorldCup2022');
  assert.notEqual(kept.comp, SEASON_MISLABELED);
  assert.equal(kept.hygiene, undefined);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('metric sliders recompute rank from event totals and keep a hash permalink', () => {
  const dataset = {
    players: [
      {
        name: 'Grinder', team: 'France', position: 'Center Defensive Midfield',
        totalMinutesProxy: 500, pressures: 120, tackles: 20, interceptions: 15,
        defensiveActions: 80, progressiveActions: 20, keyPasses: 1, passesCompleted: 200,
        shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0
      },
      {
        name: 'Finisher', team: 'Brazil', position: 'Center Forward',
        totalMinutesProxy: 500, pressures: 20, tackles: 2, interceptions: 1,
        defensiveActions: 10, progressiveActions: 40, keyPasses: 8, passesCompleted: 80,
        shotXgSum: 3.2, boxTouches: 40, shotsOnTarget: 8
      },
      {
        name: 'Bench', team: 'Peru', position: 'Left Wing',
        totalMinutesProxy: 90, pressures: 10, tackles: 1, interceptions: 0,
        defensiveActions: 4, progressiveActions: 5, keyPasses: 1, passesCompleted: 20,
        shotXgSum: 0.4, boxTouches: 6, shotsOnTarget: 1
      }
    ]
  };
  const gritLeaders = applyMetric(dataset, { grit: 100, involvement: 0, clutch: 0, minMinutes: 270 }, DEFAULT_METRIC);
  const clutchLeaders = applyMetric(dataset, { grit: 0, involvement: 0, clutch: 100, minMinutes: 270 }, DEFAULT_METRIC);
  assert.equal(gritLeaders.length, 2);
  assert.equal(gritLeaders[0].name, 'Grinder');
  assert.equal(clutchLeaders[0].name, 'Finisher');
  assert.notEqual(gritLeaders[0].score, clutchLeaders.find(row => row.name === 'Grinder').score);
  assert.ok(Number.isFinite(gritLeaders[0].deltaScore));
  assert.ok(Number.isFinite(gritLeaders[0].deltaRank));
  const hashed = serializeMetricHash({ grit: 70, involvement: 20, clutch: 10, minMinutes: 300, normalizePosition: true, selectedId: 'Grinder|France' });
  const parsed = parseMetricHash(hashed);
  assert.equal(parsed.grit, 70);
  assert.equal(parsed.minMinutes, 300);
  assert.equal(parsed.normalizePosition, true);
  assert.equal(parsed.selectedId, 'Grinder|France');
  assert.equal(serializeMetricHash(parsed), hashed);
  assert.match(html, /בנה מדד בעצמך/);
  const parts = componentsFromEvents(dataset.players[0]);
  assert.ok(parts.grit > parts.clutch);
  assert.ok(compositeScore(parts, { grit: 100, involvement: 0, clutch: 0 }) > 0);
});

test('transparent lesson walks a player from raw per90 numbers to the weighted score', () => {
  const dataset = {
    players: [{
      name: 'N\'Golo Kanté', team: 'France', position: 'Center Defensive Midfield',
      totalMinutesProxy: 621, pressures: 183, tackles: 14, interceptions: 22,
      defensiveActions: 90, progressiveActions: 133, keyPasses: 1, passesCompleted: 313,
      shotXgSum: 0.035, boxTouches: 1, shotsOnTarget: 0
    }]
  };
  const rows = applyMetric(dataset, DEFAULT_METRIC);
  const lesson = buildLesson(rows[0], DEFAULT_METRIC);
  assert.equal(lesson.length, 5);
  assert.match(lesson[0].body, /STATSBOMB_OPEN_DATA/);
  assert.match(lesson[1].body, /לחיצות/);
  assert.match(lesson[3].body, /ציון =/);
  assert.match(lesson[3].body, new RegExp(String(rows[0].score)));
  assert.match(html, /שיעור שקוף/);
  assert.doesNotMatch(html + '\n' + runtime, /https?:\/\//);
});

test('fragility lab reports rank swings when one weight is bumped by 10', () => {
  const dataset = {
    players: [
      {
        name: 'Grinder', team: 'France', position: 'Center Defensive Midfield',
        totalMinutesProxy: 500, pressures: 120, tackles: 20, interceptions: 15,
        defensiveActions: 80, progressiveActions: 20, keyPasses: 1, passesCompleted: 200,
        shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0
      },
      {
        name: 'Finisher', team: 'Brazil', position: 'Center Forward',
        totalMinutesProxy: 500, pressures: 20, tackles: 2, interceptions: 1,
        defensiveActions: 10, progressiveActions: 40, keyPasses: 8, passesCompleted: 80,
        shotXgSum: 3.2, boxTouches: 40, shotsOnTarget: 8
      }
    ]
  };
  const report = fragilityReport(dataset, { grit: 40, involvement: 30, clutch: 30, minMinutes: 270 }, 40);
  const clutchBump = report.find(item => item.key === 'clutch');
  const invBump = report.find(item => item.key === 'involvement');
  assert.ok(clutchBump.swings.some(row => row.name === 'Finisher' && row.from === 2 && row.to === 1));
  assert.ok(invBump.swings.some(row => row.name === 'Grinder' && row.deltaRank < 0));
  assert.match(html, /מעבדת שבריריות משקלות/);
});
