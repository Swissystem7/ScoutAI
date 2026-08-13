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
  fragilityReport,
  createStore,
  loadLabSources,
  minutesImpossibleForCompetition,
  flagImpossibleMinutes,
  WORLD_CUP_MAX_MINUTES,
  normalizeMetricSpec,
  positionGroup,
  evaluateExercise,
  buildCompareRadar,
  radarValues,
  methodologyParagraph,
  exportMetricBundle,
  EVENT_GLOSSARY,
  DEFENDER_EXERCISE,
  buildEventExplorer,
  validateMetric,
  evaluateCurriculum,
  spearman,
  worldCupGroup,
  assignFold,
  outcomeValue,
  glossaryForPlayer,
  CURRICULUM_LESSONS,
  WC2018_GROUPS
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
  assert.match(runtime, /poc-calibrated\.json/);
  assert.match(runtime, /poc-top30\.json/);
  assert.match(runtime, /data\/wc2018_event_aggregates\.json/);
  assert.match(html, /loadLabSources\s*\(\s*fetch\s*\)/);
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

test('createStore prepares players once and derive feeds table, lesson, and fragility', () => {
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
  const store = createStore(dataset);
  assert.equal(store.players.length, 2);
  const firstGrit = store.players[0].components.grit;
  const gritView = store.derive({ grit: 100, involvement: 0, clutch: 0, minMinutes: 270 }, DEFAULT_METRIC);
  const clutchView = store.derive({ grit: 0, involvement: 0, clutch: 100, minMinutes: 270 }, DEFAULT_METRIC);
  assert.equal(store.players[0].components.grit, firstGrit);
  assert.equal(gritView.rows[0].name, 'Grinder');
  assert.equal(clutchView.rows[0].name, 'Finisher');
  assert.equal(gritView.lesson.length, 5);
  assert.equal(gritView.fragility.length, 3);
  assert.ok(gritView.contributions.some(item => item.key === 'grit'));
  assert.ok(gritView.mapping.some(item => item.feeds === 'Clutch'));
  assert.ok(gritView.explorer);
  assert.ok(gritView.validation);
  assert.equal(gritView.validation.heldOutSeason, false);
  assert.equal(gritView.curriculum.length, 8);
});

test('loadLabSources uses only relative static paths', async () => {
  const calls = [];
  const fake = (path) => {
    calls.push(path);
    if (path === 'data/wc2018_event_aggregates.json') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ players: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ men: [], women: [] }) });
  };
  const lab = await loadLabSources(fake);
  assert.deepEqual(calls, [
    'data/wc2018_event_aggregates.json',
    'poc-calibrated.json',
    'poc-top30.json'
  ]);
  assert.ok(lab.store);
  assert.ok(Array.isArray(lab.pocRows));
});

const SAMPLE = {
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
    },
    {
      name: 'MF-low', team: 'Croatia', position: 'Left Center Midfield',
      totalMinutesProxy: 400, pressures: 15, tackles: 1, interceptions: 1,
      defensiveActions: 8, progressiveActions: 10, keyPasses: 1, passesCompleted: 80,
      shotXgSum: 0.05, boxTouches: 1, shotsOnTarget: 0
    }
  ]
};

test('composite weights mix grit, involvement, and clutch and ignore a zero total', () => {
  const parts = { grit: 80, involvement: 20, clutch: 10 };
  assert.equal(compositeScore(parts, { grit: 100, involvement: 0, clutch: 0 }), 80);
  assert.equal(compositeScore(parts, { grit: 0, involvement: 100, clutch: 0 }), 20);
  assert.equal(compositeScore(parts, { grit: 0, involvement: 0, clutch: 100 }), 10);
  assert.equal(compositeScore(parts, { grit: 50, involvement: 50, clutch: 0 }), 50);
  assert.equal(compositeScore(parts, { grit: 0, involvement: 0, clutch: 0 }), 0);
  const gritOnly = applyMetric(SAMPLE, { grit: 100, involvement: 0, clutch: 0, minMinutes: 270 });
  const clutchOnly = applyMetric(SAMPLE, { grit: 0, involvement: 0, clutch: 100, minMinutes: 270 });
  assert.equal(gritOnly[0].name, 'Grinder');
  assert.equal(clutchOnly[0].name, 'Finisher');
});

test('minutes threshold drops players below the cutoff', () => {
  const loose = applyMetric(SAMPLE, { grit: 40, involvement: 30, clutch: 30, minMinutes: 90 });
  const tight = applyMetric(SAMPLE, { grit: 40, involvement: 30, clutch: 30, minMinutes: 270 });
  assert.ok(loose.some(row => row.name === 'Bench'));
  assert.ok(!tight.some(row => row.name === 'Bench'));
  assert.ok(tight.every(row => row.minutes >= 270));
  assert.ok(loose.length > tight.length);
});

test('position normalization rescales components inside a position group', () => {
  const peers = {
    players: [
      {
        name: 'MF-high', team: 'France', position: 'Right Center Midfield',
        totalMinutesProxy: 500, pressures: 120, tackles: 20, interceptions: 15,
        defensiveActions: 80, progressiveActions: 20, keyPasses: 1, passesCompleted: 200,
        shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0
      },
      {
        name: 'MF-low', team: 'Croatia', position: 'Left Center Midfield',
        totalMinutesProxy: 400, pressures: 15, tackles: 1, interceptions: 1,
        defensiveActions: 8, progressiveActions: 10, keyPasses: 1, passesCompleted: 80,
        shotXgSum: 0.05, boxTouches: 1, shotsOnTarget: 0
      }
    ]
  };
  const raw = applyMetric(peers, { grit: 100, involvement: 0, clutch: 0, minMinutes: 270, normalizePosition: false });
  const norm = applyMetric(peers, { grit: 100, involvement: 0, clutch: 0, minMinutes: 270, normalizePosition: true });
  const rawLow = raw.find(row => row.name === 'MF-low');
  const normLow = norm.find(row => row.name === 'MF-low');
  const normHigh = norm.find(row => row.name === 'MF-high');
  assert.equal(positionGroup('Right Center Midfield'), 'MF');
  assert.equal(positionGroup('Center Forward'), 'FW');
  assert.equal(positionGroup('Goalkeeper'), 'GK');
  assert.notEqual(rawLow.components.grit, normLow.components.grit);
  assert.ok(normLow.components.normalized);
  assert.ok(normHigh.components.grit > normLow.components.grit);
});

test('permalink hash encodes and decodes metric state', () => {
  const empty = parseMetricHash('');
  assert.deepEqual(normalizeMetricSpec(empty), normalizeMetricSpec(DEFAULT_METRIC));
  assert.equal(parseMetricHash('#').grit, DEFAULT_METRIC.grit);
  const hashed = serializeMetricHash({
    grit: 12,
    involvement: 34,
    clutch: 56,
    minMinutes: 360,
    normalizePosition: true,
    selectedId: 'N\'Golo Kanté|France'
  });
  const parsed = parseMetricHash('#' + hashed);
  assert.equal(parsed.grit, 12);
  assert.equal(parsed.involvement, 34);
  assert.equal(parsed.clutch, 56);
  assert.equal(parsed.minMinutes, 360);
  assert.equal(parsed.normalizePosition, true);
  assert.equal(parsed.selectedId, 'N\'Golo Kanté|France');
  assert.equal(serializeMetricHash(parsed), hashed);
  const clamped = parseMetricHash('g=999&i=-4&c=abc&min=40&npos=0');
  assert.equal(clamped.grit, 100);
  assert.equal(clamped.involvement, 0);
  assert.equal(clamped.normalizePosition, false);
  assert.ok(clamped.minMinutes >= 0);
});

test('impossible World Cup minutes are detected and not treated as tournament data', () => {
  assert.equal(WORLD_CUP_MAX_MINUTES, 480);
  assert.equal(minutesImpossibleForCompetition({ comp: 'WorldCup2022', minutes: 481 }), true);
  assert.equal(minutesImpossibleForCompetition({ comp: 'World Cup 2018', minutes: 900 }), true);
  assert.equal(minutesImpossibleForCompetition({ comp: 'WorldCup2022', minutes: 480 }), false);
  assert.equal(minutesImpossibleForCompetition({ comp: 'FA_WSL_2023_24', minutes: 1710 }), false);
  assert.equal(minutesImpossibleForCompetition({ comp: 'Bundesliga_2023_24', minutes: 3000 }), false);
  const flagged = flagImpossibleMinutes([
    { name: 'Ok', comp: 'WorldCup2022', minutes: 270 },
    { name: 'Bad', comp: 'WorldCup2022', minutes: 2279 }
  ]);
  assert.equal(flagged[0].hygiene, undefined);
  assert.equal(flagged[1].hygiene, SEASON_MISLABELED);
  assert.equal(flagged[1].comp, SEASON_MISLABELED);
  assert.equal(flagged[1].labeledComp, 'WorldCup2022');
});

test('UI exposes keyboard sliders, table semantics, focus, contrast, and RTL', () => {
  assert.match(html, /lang="he"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /aria-valuetext="Grit, 40 אחוז"/);
  assert.match(html, /aria-valuetext="Involvement, 30 אחוז"/);
  assert.match(html, /aria-valuetext="Clutch, 30 אחוז"/);
  assert.match(html, /aria-valuetext="סף דקות, 270"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /class="skip"/);
  assert.match(html, /scope=["']col["']/);
  assert.match(html, /<caption>/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-selected/);
  assert.match(html, /border-inline-start/);
});

const DEFENDERS = {
  players: [
    {
      name: 'Stopper', team: 'Uruguay', position: 'Center Back',
      totalMinutesProxy: 500, pressures: 90, tackles: 18, interceptions: 14,
      defensiveActions: 70, progressiveActions: 12, keyPasses: 0, passesCompleted: 180,
      shotXgSum: 0.05, boxTouches: 1, shotsOnTarget: 0
    },
    {
      name: 'Fullback', team: 'France', position: 'Left Back',
      totalMinutesProxy: 480, pressures: 70, tackles: 10, interceptions: 8,
      defensiveActions: 50, progressiveActions: 30, keyPasses: 2, passesCompleted: 220,
      shotXgSum: 0.1, boxTouches: 4, shotsOnTarget: 0
    },
    {
      name: 'Poacher', team: 'England', position: 'Center Forward',
      totalMinutesProxy: 500, pressures: 18, tackles: 1, interceptions: 0,
      defensiveActions: 6, progressiveActions: 20, keyPasses: 3, passesCompleted: 70,
      shotXgSum: 4.1, boxTouches: 38, shotsOnTarget: 9
    },
    {
      name: 'Winger', team: 'Belgium', position: 'Right Wing',
      totalMinutesProxy: 450, pressures: 25, tackles: 2, interceptions: 1,
      defensiveActions: 8, progressiveActions: 35, keyPasses: 6, passesCompleted: 90,
      shotXgSum: 2.4, boxTouches: 22, shotsOnTarget: 5
    },
    {
      name: 'Holder', team: 'Brazil', position: 'Center Defensive Midfield',
      totalMinutesProxy: 500, pressures: 100, tackles: 16, interceptions: 12,
      defensiveActions: 60, progressiveActions: 18, keyPasses: 1, passesCompleted: 250,
      shotXgSum: 0.08, boxTouches: 1, shotsOnTarget: 0
    }
  ]
};

test('position labels put center-backs with defenders and CDM with midfielders', () => {
  assert.equal(positionGroup('Center Back'), 'DF');
  assert.equal(positionGroup('Left Back'), 'DF');
  assert.equal(positionGroup('Left Wing Back'), 'DF');
  assert.equal(positionGroup('Center Defensive Midfield'), 'MF');
  assert.equal(positionGroup('Right Wing'), 'FW');
});

test('guided defender exercise fails the default 40/30/30 and passes a grit-first metric', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const failed = evaluateExercise(wc, DEFAULT_METRIC);
  const passed = evaluateExercise(wc, DEFENDER_EXERCISE.hint);
  assert.equal(failed.id, 'defenders-sensible');
  assert.equal(failed.passed, false);
  assert.ok(failed.checks.some(item => item.id === 'defenders-surface' && item.pass === false));
  assert.ok(failed.checks.some(item => item.id === 'not-just-attackers' && item.pass === false));
  assert.equal(passed.passed, true);
  assert.ok(passed.dfNow > failed.dfNow);
  assert.ok(passed.checks.every(item => item.pass));
  const gritOnly = applyMetric(DEFENDERS, { grit: 80, involvement: 15, clutch: 5, minMinutes: 270 });
  const stopper = gritOnly.find(row => row.name === 'Stopper');
  const poacher = gritOnly.find(row => row.name === 'Poacher');
  assert.ok(stopper.rank < poacher.rank);
  assert.equal(stopper.positionGroup, 'DF');
  assert.match(html, /תרגיל מודרך/);
  assert.match(html, /בדיקה עצמית/);
});

test('comparison radar is built from the same raw caps as the score recipe', () => {
  const store = createStore(DEFENDERS);
  const view = store.derive({
    grit: 70, involvement: 20, clutch: 10, minMinutes: 270,
    selectedId: 'Stopper|Uruguay', compareId: 'Poacher|England'
  }, DEFAULT_METRIC);
  assert.ok(view.radar.a);
  assert.ok(view.radar.b);
  assert.equal(view.radar.a.values.length, 9);
  const stopperPress = view.radar.a.values.find(item => item.key === 'pressures90');
  const poacherXg = view.radar.b.values.find(item => item.key === 'xg90');
  assert.ok(stopperPress.scaled > 50);
  assert.ok(poacherXg.scaled > 50);
  const same = buildCompareRadar(view.selected, view.selected);
  assert.equal(same.a.points, same.b.points);
  const values = radarValues(view.selected);
  assert.ok(values.every(item => Number.isFinite(item.scaled) && item.scaled >= 0 && item.scaled <= 100));
  assert.match(html, /מכ״ם השוואה/);
  const hashed = serializeMetricHash(view.spec);
  assert.match(hashed, /cmp=/);
  assert.equal(parseMetricHash(hashed).compareId, 'Poacher|England');
});

test('metric export is local, non-commercial, and citation-ready without a network URL', () => {
  const store = createStore(DEFENDERS);
  const view = store.derive(DEFENDER_EXERCISE.hint, DEFAULT_METRIC);
  const bundle = exportMetricBundle(view.spec, view.selected, { compared: view.compared });
  assert.equal(bundle.commercial, false);
  assert.equal(bundle.generatedLocally, true);
  assert.equal(bundle.provenance, 'STATSBOMB_OPEN_DATA');
  assert.equal(bundle.source.competitionId, 43);
  assert.match(bundle.methodologyHe, /לא כהמלצת סקאוטינג/);
  assert.match(bundle.methodologyHe, /אוסר שימוש מסחרי/);
  assert.match(bundle.methodologyHe, /מונדיאל 2018/);
  assert.match(bundle.citationEn, /Non-commercial/);
  assert.doesNotMatch(bundle.methodologyHe, /https?:\/\//);
  assert.doesNotMatch(JSON.stringify(bundle), /https?:\/\//);
  assert.match(methodologyParagraph(view.spec, view.selected), /משקלות ידניות/);
  assert.match(html, /ייצוא המדד/);
  assert.match(html, /scoutai-metric\.json/);
});

test('glossary names the StatsBomb event types that feed the score and the ones that do not', () => {
  const types = EVENT_GLOSSARY.map(item => item.type);
  for (const needed of ['Pressure', 'Duel / Tackle', 'Interception', 'Ball Recovery', 'Block', 'Pass', 'Carry', 'Shot + statsbomb_xg']) {
    assert.ok(types.includes(needed), needed);
  }
  assert.ok(EVENT_GLOSSARY.some(item => item.usedInScore === false && /Dribble/.test(item.type)));
  assert.ok(EVENT_GLOSSARY.some(item => item.feeds === 'סף דקות'));
  assert.match(html, /מילון סוגי אירועים/);
  assert.match(html + '\n' + runtime, /לא בנוסחה/);
});

test('event explorer rebuilds Kanté\'s file counts into a per90 receipt without inventing a match log', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const kante = store.players.find(row => /Kant/.test(row.name));
  assert.equal(kante.counts.pressures, 183);
  assert.equal(kante.minutes, 621);
  const explorer = buildEventExplorer(kante);
  const press = explorer.rows.find(row => row.key === 'pressures');
  assert.equal(press.total, 183);
  assert.equal(press.per90, 26.52);
  assert.equal(press.capped, true);
  assert.equal(press.scaled, 100);
  assert.equal(press.filePath, 'players[].pressures');
  assert.ok(explorer.unused.some(row => row.key === 'dribbles'));
  assert.ok(explorer.unused.every(row => row.usedInScore === false));
  assert.match(explorer.honesty, /ספירות מצטברות|אין בריפו יומן/);
  assert.doesNotMatch(explorer.honesty, /יומן אירוע-אחר-אירוע נמצא/);
  const live = store.derive({ selectedId: kante.id }, DEFAULT_METRIC);
  assert.equal(live.explorer.player.name, kante.name);
  assert.match(html, /חוקר ספירות האירועים/);
  assert.match(html, /NO_HELD_OUT_SEASON/);
});

test('glossary terms point at JSON fields and the selected player\'s live value', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const kante = store.players.find(row => /Kant/.test(row.name));
  const items = glossaryForPlayer(kante);
  const pressure = items.find(item => item.type === 'Pressure');
  assert.equal(pressure.field, 'pressures');
  assert.equal(pressure.filePath, 'players[].pressures');
  assert.equal(pressure.selectedTotal, 183);
  assert.ok(pressure.selectedPer90 > 26);
  const unused = items.find(item => item.feeds === 'לא בנוסחה');
  assert.equal(unused.usedInScore, false);
  assert.match(unused.filePath, /dribbles/);
  assert.match(html, /players\[\]\.pressures|filePath/);
});

test('Spearman is 1 on a monotone pair and -1 when reversed', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.equal(spearman([1], [1]), null);
});

test('WC2018 group split is a complete 16-vs-16 team holdout, not a later season', () => {
  assert.equal(worldCupGroup('France'), 'C');
  assert.equal(worldCupGroup('Brazil'), 'E');
  assert.equal(assignFold({ name: 'A', team: 'France' }, 'groups'), 'train');
  assert.equal(assignFold({ name: 'B', team: 'Brazil' }, 'groups'), 'test');
  const listed = Object.values(WC2018_GROUPS).flat();
  assert.equal(listed.length, 32);
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const report = validateMetric(store.players, DEFAULT_METRIC, { outcomeId: 'assists', splitId: 'groups' });
  assert.equal(report.heldOutSeason, false);
  assert.equal(report.leaky, false);
  assert.equal(report.train.n, 120);
  assert.equal(report.test.n, 120);
  assert.equal(report.unassigned, 0);
  assert.match(report.honesty, /אין בריפו עונה שנייה/);
  assert.ok(Number.isFinite(report.test.rho));
  const leaky = validateMetric(store.players, DEFAULT_METRIC, { outcomeId: 'goals', splitId: 'groups' });
  assert.equal(leaky.leaky, true);
  assert.ok(leaky.test.componentRho.clutch > leaky.test.componentRho.grit);
  assert.match(html, /מעבדת אימות/);
  assert.match(html, /אין בריפו עונה שנייה/);
});

test('unused outcomes stay available and SAMPLE folds France to train and Brazil to test', () => {
  const store = createStore(SAMPLE);
  assert.equal(outcomeValue(store.players.find(row => row.name === 'Finisher'), 'goals'), 0);
  assert.ok(store.players[0].counts);
  const report = validateMetric(store.players, { grit: 40, involvement: 30, clutch: 30, minMinutes: 270 }, { splitId: 'groups', outcomeId: 'dribbles' });
  const france = store.players.find(row => row.team === 'France');
  const brazil = store.players.find(row => row.team === 'Brazil');
  assert.equal(assignFold(france, 'groups'), 'train');
  assert.equal(assignFold(brazil, 'groups'), 'test');
  assert.ok(report.train.n >= 1);
  assert.ok(report.test.n >= 1);
});

test('mini-curriculum has eight lessons and graduates only after honest holdout answers', () => {
  assert.equal(CURRICULUM_LESSONS.length, 8);
  assert.equal(CURRICULUM_LESSONS[0].id, 'events');
  assert.equal(CURRICULUM_LESSONS[7].id, 'honesty');
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const failed = evaluateCurriculum(store.derive(DEFAULT_METRIC));
  assert.equal(failed.length, 8);
  assert.equal(failed.find(item => item.id === 'defenders').passed, false);
  assert.equal(failed.find(item => item.id === 'holdout').passed, false);
  const view = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, { selectedId: "N'Golo Kanté|France" }));
  const passed = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    answers: {
      unusedField: 'dribbles',
      per90: '45',
      kanteCapped: 'yes',
      weightsManual: 'yes',
      bumpCanMove: 'yes',
      splitIsSeason: 'no',
      whatMatters: 'test',
      unusedTerm: 'dribble',
      commercial: 'no'
    }
  });
  assert.ok(passed.every(item => item.passed), passed.filter(item => !item.passed).map(item => item.id).join(','));
  const seasonLie = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    answers: {
      unusedField: 'dribbles',
      per90: '45',
      kanteCapped: 'yes',
      weightsManual: 'yes',
      bumpCanMove: 'yes',
      splitIsSeason: 'yes',
      whatMatters: 'test',
      unusedTerm: 'dribble',
      commercial: 'no'
    }
  });
  assert.equal(seasonLie.find(item => item.id === 'holdout').passed, false);
  assert.match(html, /שיעור מלא: מאירוע למדד מאומת/);
  assert.match(html, /id="course"/);
  assert.match(html, /id="explorer"/);
  assert.match(html, /id="validate"/);
});

test('curriculum and explorer stay Hebrew RTL and keep skip/focus semantics', () => {
  assert.match(html, /href="#course"/);
  assert.match(html, /דלגו לשיעור המלא/);
  assert.match(html, /id="outcomeSelect"/);
  assert.match(html, /id="splitSelect"/);
  assert.match(html, /aria-label="צעדי השיעור המלא"/);
  assert.doesNotMatch(html + '\n' + runtime, /https?:\/\//);
});
