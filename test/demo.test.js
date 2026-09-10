'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
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
  shrinkByPosition,
  SHRINK_DEFAULT_K,
  evaluateExercise,
  buildCompareRadar,
  radarValues,
  methodologyParagraph,
  exportMetricBundle,
  EVENT_GLOSSARY,
  DEFENDER_EXERCISE,
  buildEventExplorer,
  explainScore,
  LEDGER_FIELDS,
  playerKey,
  validateMetric,
  evaluateCurriculum,
  spearman,
  spearmanRaw,
  percentile,
  componentsFromRates,
  RATE_KEYS,
  bootstrapSpearman,
  formatRhoWithCi,
  BOOTSTRAP_MIN_ITERATIONS,
  BOOTSTRAP_MAX_ITERATIONS,
  BOOTSTRAP_MIN_N,
  worldCupGroup,
  assignFold,
  outcomeValue,
  parseUserDataset,
  glossaryForPlayer,
  CURRICULUM_LESSONS,
  WC2018_GROUPS,
  USER_DATA_PROVENANCE,
  SYNTHETIC_PROVENANCE,
  OPEN_DATA_PROVENANCE
} = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'demo.js'), 'utf8');

test('product runtime has no video theater, no demo fixtures, and no outbound network', () => {
  const productRuntime = `${html}\n${runtime}`;
  const forbidden = [
    /XMLHttpRequest/i, /sendBeacon/i, /WebSocket/i,
    /<form\b/i, /type=["']submit/i, /mailto:/i, /https?:\/\//i,
    /fetch\s*\(\s*['"`]https?:/i,
    /createDemoFixture/, /poc-calibrated/, /poc-top30/,
    /accept="video/, /LOCAL_VIDEO/, /DEMO_METRIC/, /VERIFIED_ANALYSIS_SERVICE/,
    /יצירת חשבון/, /התחלת ניסיון/, /שליחת דוח/
  ];
  forbidden.forEach(pattern => assert.doesNotMatch(productRuntime, pattern));
  assert.match(runtime, /data\/wc2018_event_aggregates\.json/);
  assert.match(html, /loadLabSources\s*\(\s*fetch\s*\)/);
  assert.match(html, /STATSBOMB_OPEN_DATA/);
  assert.match(html, /NO_HELD_OUT_SEASON/);
  assert.match(html, /לא<\/strong> סקאוטינג/);
  assert.match(html, /לא<\/strong> AI/);
});

test('stranger-facing hero states the formula and the shipped file in the first screen', () => {
  assert.match(html, /למדו לבנות מדד כדורגל שקוף/);
  assert.match(html, /0\.4×Grit \+ 0\.3×Involvement \+ 0\.3×Clutch/);
  assert.match(html, /data\/wc2018_event_aggregates\.json/);
  assert.match(html, /id="hero"/);
  const heroAt = html.indexOf('id="hero"');
  const courseAt = html.indexOf('id="course"');
  const byodAt = html.indexOf('id="byod"');
  assert.ok(heroAt > 0 && courseAt > heroAt, 'course follows the hero');
  assert.ok(byodAt > courseAt, 'BYOD stays after the lesson, not first');
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

test('loadLabSources fetches only the shipped event aggregate', async () => {
  const calls = [];
  const fake = (path) => {
    calls.push(path);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ players: [] }) });
  };
  const lab = await loadLabSources(fake);
  assert.deepEqual(calls, ['data/wc2018_event_aggregates.json']);
  assert.ok(lab.store);
  assert.equal(lab.pocRows, undefined);
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

test('impossible World Cup minutes are those beyond a full knockout run, not 480', () => {
  assert.equal(WORLD_CUP_MAX_MINUTES, 750);
  assert.equal(minutesImpossibleForCompetition({ comp: 'WorldCup2018', minutes: 621 }), false);
  assert.equal(minutesImpossibleForCompetition({ comp: 'World Cup 2018', minutes: 750 }), false);
  assert.equal(minutesImpossibleForCompetition({ comp: 'WorldCup2018', minutes: 751 }), true);
  assert.equal(minutesImpossibleForCompetition({ comp: 'World Cup 2018', minutes: 2279 }), true);
  assert.equal(minutesImpossibleForCompetition({ comp: 'FA_WSL_2023_24', minutes: 1710 }), false);
  assert.equal(minutesImpossibleForCompetition({ comp: 'Bundesliga_2023_24', minutes: 3000 }), false);
  const flagged = flagImpossibleMinutes([
    { name: 'Kanté-like', comp: 'WorldCup2018', minutes: 621 },
    { name: 'Bad', comp: 'WorldCup2018', minutes: 2279 }
  ]);
  assert.equal(flagged[0].hygiene, undefined);
  assert.equal(flagged[1].hygiene, SEASON_MISLABELED);
  assert.equal(flagged[1].comp, SEASON_MISLABELED);
  assert.equal(flagged[1].labeledComp, 'WorldCup2018');
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
  assert.match(html, /ArrowDown/);
  assert.match(html, /min-height:44px/);
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

test('every shipped WC2018 score is a pure function of the JSON counts', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  assert.equal(wc.source, 'StatsBomb Open Data');
  assert.equal(wc.competitionId, 43);
  assert.equal(wc.seasonId, 3);
  assert.equal(wc.games, 64);
  const store = createStore(wc);
  assert.equal(store.players.length, wc.players.length);
  store.players.forEach((player) => {
    const fromFile = wc.players.find((row) => row.name === player.name && row.team === player.team);
    assert.ok(fromFile, player.name);
    assert.equal(player.counts.pressures, fromFile.pressures || 0);
    assert.equal(player.minutes, fromFile.totalMinutesProxy);
    const recomputed = componentsFromEvents(fromFile);
    assert.equal(player.components.grit, recomputed.grit);
    assert.equal(player.components.involvement, recomputed.involvement);
    assert.equal(player.components.clutch, recomputed.clutch);
    assert.ok(player.minutes <= WORLD_CUP_MAX_MINUTES, player.name + ' minutes ' + player.minutes);
    assert.notEqual(player.hygiene, SEASON_MISLABELED);
  });
  const view = store.derive(DEFAULT_METRIC);
  view.rows.forEach((row) => {
    assert.equal(row.score, compositeScore(row.components, DEFAULT_METRIC));
    assert.equal(row.provenance, OPEN_DATA_PROVENANCE);
  });
  const kante = view.rows.find((row) => /Kant/.test(row.name));
  assert.ok(kante);
  assert.equal(kante.counts.pressures, 183);
  assert.equal(kante.minutes, 621);
  assert.equal(view.explorer.dataset, 'data/wc2018_event_aggregates.json');
  assert.match(view.lesson[0].body, /STATSBOMB_OPEN_DATA/);
  assert.match(view.explorer.receipt[0].detail, /STATSBOMB_OPEN_DATA/);
});

test('BYOD lesson and explorer never claim the World Cup file', () => {
  const store = createStore({
    players: [{
      name: 'Alpha', team: 'Home', position: 'Center Back',
      totalMinutesProxy: 400, pressures: 40, tackles: 8, interceptions: 6,
      defensiveActions: 20, progressiveActions: 10, keyPasses: 1, passesCompleted: 100,
      shotXgSum: 0.1, boxTouches: 2, shotsOnTarget: 0
    }]
  }, {
    provenance: USER_DATA_PROVENANCE,
    source: { dataset: 'club.json', competition: 'USER_DATASET' }
  });
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90 });
  assert.equal(view.provenance, USER_DATA_PROVENANCE);
  assert.doesNotMatch(view.lesson[0].body, /מונדיאל 2018/);
  assert.match(view.lesson[0].body, /USER_LICENSED_DATA/);
  assert.equal(view.explorer.dataset, 'club.json');
  assert.equal(view.explorer.provenance, USER_DATA_PROVENANCE);
  assert.doesNotMatch(view.explorer.honesty, /wc2018_event_aggregates/);
  assert.match(view.explorer.receipt[0].detail, /USER_LICENSED_DATA/);
  const syntheticLesson = buildLesson(view.selected, view.spec, {
    provenance: SYNTHETIC_PROVENANCE,
    source: { dataset: 'data/user-dataset.example.json' }
  });
  assert.match(syntheticLesson[0].body, /SYNTHETIC_EXAMPLE/);
  assert.doesNotMatch(syntheticLesson[0].body, /STATSBOMB_OPEN_DATA/);
});

test('product tree has no factory SaaS, no CI workflows, and no broken root proofs', () => {
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows')), false);
  assert.equal(fs.existsSync(path.join(root, 'lib')), false);
  assert.equal(fs.existsSync(path.join(root, 'proof-big5.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'poc-calibrated.json')), false);
  assert.ok(fs.existsSync(path.join(root, 'attic', 'proof-demo.js')));
  assert.ok(fs.existsSync(path.join(root, 'data', 'wc2018_event_aggregates.json')));
  assert.ok(fs.existsSync(path.join(root, 'data', 'user-dataset.example.json')));
  assert.equal(fs.existsSync(path.join(root, 'data', 'fbref_big5_2024-2025.json')), false);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /DEMO_METRIC/);
  assert.doesNotMatch(readme, /LOCAL_VIDEO/);
  assert.match(readme, /data\/wc2018_event_aggregates\.json/);
});

test('curriculum and explorer stay Hebrew RTL and keep skip/focus semantics', () => {
  assert.match(html, /href="#course"/);
  assert.match(html, /דלגו לשיעור המלא/);
  assert.match(html, /id="outcomeSelect"/);
  assert.match(html, /id="splitSelect"/);
  assert.match(html, /aria-label="צעדי השיעור המלא"/);
  assert.doesNotMatch(html + '\n' + runtime, /https?:\/\//);
});

// --- S1: bootstrap confidence interval for the held-out Spearman rho -------

const RHO = '\u03c1';
const MINUS = '\u2212';
const EMDASH = '\u2014';

test('bootstrapSpearman pins the held-out interval of the shipped file for seed 42', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const ranked = applyMetric(wc, DEFAULT_METRIC);
  const heldOut = ranked
    .filter(row => assignFold(row, 'groups') === 'test')
    .map(row => [row.score, outcomeValue(row, 'assists')]);
  assert.equal(heldOut.length, 120);

  const ci = bootstrapSpearman(heldOut, { iterations: 1000, seed: 42 });
  // Pinned from what the correct algorithm actually produces, not from the
  // backlog: percentile bootstrap (R type 7 percentiles) over 1000
  // mulberry32 resamples of the 120 held-out (score, assists) pairs.
  assert.equal(ci.rho, 0.3);
  assert.equal(ci.lo, 0.137);
  assert.equal(ci.hi, 0.45);
  assert.equal(ci.iterations, 1000);
  assert.equal(ci.seed, 42);
  assert.equal(ci.n, 120);
  assert.ok(ci.lo < ci.rho && ci.rho < ci.hi, 'point estimate sits inside the interval');

  // bit-for-bit: same input, same seed, byte-identical JSON on every run.
  const again = bootstrapSpearman(heldOut, { iterations: 1000, seed: 42 });
  assert.deepEqual(again, ci);
  assert.equal(JSON.stringify(again), JSON.stringify(ci));

  // a different seed moves the interval but never the point estimate
  const other = bootstrapSpearman(heldOut, { iterations: 1000, seed: 7 });
  assert.equal(other.rho, ci.rho);
  assert.notDeepEqual([other.lo, other.hi], [ci.lo, ci.hi]);

  // the validation lab reports exactly the same interval object
  const store = createStore(wc);
  const report = validateMetric(store.players, DEFAULT_METRIC, { outcomeId: 'assists', splitId: 'groups' });
  assert.deepEqual(report.test.ci, ci);
  assert.equal(report.test.rhoLabel, RHO + ' = 0.30 [0.14, 0.45]');
  assert.equal(report.heldOutRhoLabel, report.test.rhoLabel);
  assert.equal(report.train.rhoLabel, RHO + ' = 0.26 [0.10, 0.42]');
  // the verdict quotes the interval, never a bare rho
  assert.ok(report.verdict.includes(report.test.rhoLabel));
});

test('bootstrapSpearman returns rho 1 on perfectly correlated pairs and guards the iteration floor', () => {
  const perfect = [];
  for (let i = 1; i <= 40; i += 1) perfect.push([i, i * 3]);
  const ci = bootstrapSpearman(perfect, { iterations: 500, seed: 7 });
  assert.equal(ci.rho, 1);
  assert.ok(ci.lo >= 0.99, 'lo ' + ci.lo);
  assert.ok(ci.hi >= 0.99, 'hi ' + ci.hi);

  const reversed = perfect.map(pair => [pair[0], -pair[1]]);
  assert.equal(bootstrapSpearman(reversed, { iterations: 500, seed: 7 }).rho, -1);

  assert.equal(BOOTSTRAP_MIN_ITERATIONS, 50);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 49 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 0 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: -1 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 'many' }), RangeError);
  assert.equal(bootstrapSpearman(perfect, { iterations: 50 }).iterations, 50);

  // defaults are 1000 iterations / seed 42
  const defaults = bootstrapSpearman(perfect);
  assert.equal(defaults.iterations, 1000);
  assert.equal(defaults.seed, 42);

  // {score, target} objects are accepted as well as [score, target] pairs
  const objects = perfect.map(pair => ({ score: pair[0], target: pair[1] }));
  assert.deepEqual(bootstrapSpearman(objects, { iterations: 500, seed: 7 }), ci);

  // too few pairs is reported, not faked
  const thin = bootstrapSpearman([[1, 1]], { iterations: 100 });
  assert.equal(thin.rho, null);
  assert.equal(thin.lo, null);
  assert.equal(thin.hi, null);
  assert.equal(thin.n, 1);
});

test('the lab never displays a bare held-out rho again', () => {
  assert.equal(
    formatRhoWithCi({ rho: 0.3, lo: -0.05, hi: 0.58 }),
    RHO + ' = 0.30 [' + MINUS + '0.05, 0.58]'
  );
  assert.equal(formatRhoWithCi(null), RHO + ' = ' + EMDASH);
  assert.match(html, /report\.train\.rhoLabel/);
  assert.match(html, /report\.test\.rhoLabel/);
  assert.match(html, /stats\.rhoLabel/);
  assert.doesNotMatch(html, /report\.test\.rho\b(?!Label)/);
  assert.match(html, /percentile bootstrap/);
  // the PRNG is inline and seeded - no ambient randomness in the runtime
  assert.match(runtime, /function mulberry32/);
  assert.doesNotMatch(runtime + html, /Math\.random/);
});

// --- S2: minutes-weighted shrinkage toward the position mean ---------------

test('shrinkByPosition moves a 90-minute cameo 5/6 of the way to the position mean and a 2700-minute regular only 1/7', () => {
  const rows = [
    { name: 'cameo', positionGroup: 'MF', minutes: 90, pressuresPer90: 40 },
    { name: 'regular', positionGroup: 'MF', minutes: 2700, pressuresPer90: 40 },
    { name: 'anchorA', positionGroup: 'MF', minutes: 2700, pressuresPer90: 10 },
    { name: 'anchorB', positionGroup: 'MF', minutes: 2700, pressuresPer90: 10 }
  ];
  const out = shrinkByPosition(rows, { key: 'pressuresPer90', minutesKey: 'minutes', k: 450 });
  const byName = name => out.find(row => row.name === name);

  // mu_pos is MINUTES-weighted, not a plain average of the four numbers:
  // (90*40 + 2700*40 + 2700*10 + 2700*10) / 8190 = 165600 / 8190
  const mu = byName('cameo').shrinkage.pressuresPer90.positionMean;
  assert.ok(Math.abs(mu - 165600 / 8190) < 1e-12, 'mu ' + mu);
  assert.ok(Math.abs(mu - 20.21978021978022) < 1e-9, 'mu ' + mu);
  assert.notEqual(mu, 25, 'a plain mean would be 25 - this one is minutes-weighted');

  const movedFraction = (row) => {
    const detail = row.shrinkage.pressuresPer90;
    return Math.abs(detail.adjusted - detail.raw) / Math.abs(detail.positionMean - detail.raw);
  };

  // adj = (m*v + k*mu) / (m + k), so the distance travelled toward mu is
  // exactly k/(m+k): 450/540 = 83.33% at 90 minutes, 450/3150 = 14.29% at 2700.
  const cameo = byName('cameo');
  const regular = byName('regular');
  assert.ok(Math.abs(movedFraction(cameo) - 450 / 540) < 1e-12);
  assert.ok(Math.abs(movedFraction(regular) - 450 / 3150) < 1e-12);
  assert.ok(movedFraction(cameo) >= 0.6, 'cameo moved ' + movedFraction(cameo));
  assert.ok(movedFraction(regular) < 0.15, 'regular moved ' + movedFraction(regular));
  assert.equal(cameo.shrinkage.pressuresPer90.priorWeight, 450 / 540);
  assert.equal(regular.shrinkage.pressuresPer90.priorWeight, 450 / 3150);
  assert.equal(cameo.shrinkage.pressuresPer90.ownWeight, 90 / 540);

  // the formula itself, spelled out
  assert.ok(Math.abs(cameo.pressuresPer90 - (90 * 40 + 450 * mu) / (90 + 450)) < 1e-12);
  assert.ok(Math.abs(regular.pressuresPer90 - (2700 * 40 + 450 * mu) / (2700 + 450)) < 1e-12);

  // and the cameo, despite the identical raw 40, now sits below the regular
  assert.ok(cameo.pressuresPer90 < regular.pressuresPer90);
});

test('shrinkByPosition is pure, deterministic, group-local, and refuses nonsense options', () => {
  const rows = [
    { name: 'mf', positionGroup: 'MF', minutes: 900, pressuresPer90: 30 },
    { name: 'gk', positionGroup: 'GK', minutes: 900, pressuresPer90: 2 }
  ];
  const once = shrinkByPosition(rows, { key: 'pressuresPer90' });
  const twice = shrinkByPosition(rows, { key: 'pressuresPer90' });
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(twice), JSON.stringify(once));

  // the caller's rows are never touched
  assert.equal(rows[0].pressuresPer90, 30);
  assert.equal(rows[0].shrinkage, undefined);

  // a group of one has itself as its own mean, so nothing moves
  assert.equal(once.find(row => row.name === 'gk').pressuresPer90, 2);
  assert.equal(once.find(row => row.name === 'mf').pressuresPer90, 30);

  assert.equal(SHRINK_DEFAULT_K, 450);
  assert.equal(once[0].shrinkage.pressuresPer90.k, 450);

  // k = 0 means "trust the player completely" and is an exact no-op
  const wider = [
    { positionGroup: 'MF', minutes: 90, pressuresPer90: 40 },
    { positionGroup: 'MF', minutes: 900, pressuresPer90: 4 }
  ];
  assert.deepEqual(
    shrinkByPosition(wider, { key: 'pressuresPer90', k: 0 }).map(row => row.pressuresPer90),
    [40, 4]
  );

  assert.throws(() => shrinkByPosition(wider, {}), TypeError);
  assert.throws(() => shrinkByPosition(wider, { key: 'pressuresPer90', k: -1 }), RangeError);
  assert.throws(() => shrinkByPosition(wider, { key: 'pressuresPer90', k: 'lots' }), RangeError);
  assert.deepEqual(shrinkByPosition([], { key: 'pressuresPer90' }), []);

  // dotted paths reach into nested per-90 blocks without mutating the source
  const nested = [
    { positionGroup: 'MF', minutes: 90, per90: { pressuresPer90: 40 } },
    { positionGroup: 'MF', minutes: 900, per90: { pressuresPer90: 4 } }
  ];
  const deep = shrinkByPosition(nested, { key: 'per90.pressuresPer90', k: 450 });
  assert.ok(deep[0].per90.pressuresPer90 < 40);
  assert.equal(nested[0].per90.pressuresPer90, 40);
});

test('percentile shares the centre of a tie block and leaves untied values where they were', () => {
  // untied: (below + 1) / n, exactly the old "count of peers <= value"
  assert.equal(percentile(3, [1, 2, 3, 4]), 75);
  assert.equal(percentile(4, [1, 2, 3, 4]), 100);
  assert.equal(percentile(1, [1, 2, 3, 4]), 25);
  // a tie block shares its average rank: 25 zeros and 2 non-zeros in a
  // 27-strong group -> (0 + 26/2) / 27 = 48.1, not 25/27 = 92.6
  const keepers = new Array(25).fill(0).concat([0.5, 1]);
  assert.equal(percentile(0, keepers), 48.1);
  assert.equal(percentile(0.5, keepers), 96.3);
  assert.equal(percentile(1, keepers), 100);
  // a whole group tied is the middle, and a group of one is 100 as before
  assert.equal(percentile(5, [5, 5, 5]), 66.7);
  assert.equal(percentile(5, [5]), 100);
  assert.equal(percentile(5, []), 50);
});

test('position normalisation shrinks the per-90 rates before the caps, and identical evidence stays one tie', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const spec = Object.assign({}, DEFAULT_METRIC, { normalizePosition: true });
  const ranked = applyMetric(wc, spec);

  // --- the backlog's three acceptance criteria, measured -----------------
  // (1)+(2) k/(m+k): 90 min -> 450/540 = 83.3% of the way, 2700 -> 14.3%
  const rows = [
    { name: 'cameo', positionGroup: 'MF', minutes: 90, per90Rates: { pressures: 40 } },
    { name: 'regular', positionGroup: 'MF', minutes: 2700, per90Rates: { pressures: 40 } },
    { name: 'anchor', positionGroup: 'MF', minutes: 2700, per90Rates: { pressures: 10 } }
  ];
  const out = shrinkByPosition(rows, { key: 'per90Rates.pressures', k: SHRINK_DEFAULT_K });
  const moved = (row) => {
    const d = row.shrinkage['per90Rates.pressures'];
    return Math.abs(d.adjusted - d.raw) / Math.abs(d.positionMean - d.raw);
  };
  assert.ok(moved(out[0]) >= 0.6, 'cameo moved ' + moved(out[0]));
  assert.ok(moved(out[1]) < 0.15, 'regular moved ' + moved(out[1]));
  // (3) at most 2 goalkeepers in the shipped top-12
  const top12 = ranked.slice(0, 12);
  const keepersOnTop = top12.filter(row => row.positionGroup === 'GK');
  assert.ok(keepersOnTop.length <= 2, keepersOnTop.length + ' goalkeepers in the top 12');

  // --- the pin: what the corrected pipeline produces with k = 450 ---------
  // Recomputed from the code, not from any table. If percentile changes
  // again (PR #12 replaces its tie rule), this moves and must be recomputed.
  assert.deepEqual(
    top12.map(row => [row.rank, row.name, row.positionGroup, row.score]),
    [
      [1, 'Marcelo Vieira da Silva Júnior', 'DF', 93.93],
      [2, 'Thomas Meunier', 'DF', 92.09],
      [3, 'Gylfi Þór Sigurðsson', 'FW', 88.02],
      [4, 'Mário Figueira Fernandes', 'DF', 85.59],
      [5, 'Joshua Kimmich', 'DF', 83.34],
      [6, 'Salman Mohammed Al Faraj', 'MF', 81.64],
      [7, 'Mathew Ryan', 'GK', 81.47],
      [8, 'Keylor Navas Gamboa', 'GK', 81.1],
      [9, 'Toni Kroos', 'MF', 77.64],
      [10, 'Jordi Alba Ramos', 'DF', 77.46],
      [11, 'Ricardo Iván Rodríguez Araya', 'DF', 77.36],
      [12, 'Victor Moses', 'FW', 77.14]
    ]
  );
  assert.deepEqual(applyMetric(wc, spec).map(row => row.id), ranked.map(row => row.id));

  // --- zero-evidence keepers are NOT ordered by minutes -------------------
  // 25 of the 27 eligible keepers have 0 xG, 0 box touches, 0 shots on
  // target. Shrinking the RATE gives each of them k*mu/(m+k) of the order of
  // 0.0004 xG/90 - a number that round1 on the 0-100 component turns into
  // the same 0.1 for all 25 - and the percentile then hands the block one
  // shared value. An earlier revision shrank the already-capped 0-100
  // component instead and produced 21 distinct percentiles ordered purely by
  // minutes (rho(minutes, Clutch) = -0.90 inside GK).
  const keeperRows = ranked.filter(row => row.positionGroup === 'GK');
  assert.equal(keeperRows.length, 27);
  const noEvidence = keeperRows.filter(row =>
    row.counts.shotXgSum === 0 && row.counts.boxTouches === 0 && row.counts.shotsOnTarget === 0);
  assert.equal(noEvidence.length, 25);
  assert.equal(new Set(noEvidence.map(row => row.components.shrunk.clutch)).size, 1);
  assert.equal(new Set(noEvidence.map(row => row.components.clutch)).size, 1);
  assert.equal(noEvidence[0].components.clutch, 48.1);   // (0 + 26/2) / 27
  const rhoAll = spearmanRaw(keeperRows.map(row => row.minutes), keeperRows.map(row => row.components.clutch));
  assert.ok(Math.abs(rhoAll) < 0.1, 'rho(minutes, Clutch percentile) inside GK = ' + rhoAll);
  // Mathew Ryan (282 minutes) is in the table for his Grit and Involvement
  // percentiles among keepers, not for a Clutch he never showed
  const ryan = ranked.find(row => row.name === 'Mathew Ryan');
  assert.equal(ryan.minutes, 282);
  assert.equal(ryan.components.clutch, 48.1);
  assert.equal(ryan.rank, 7);

  // --- two players both over a cap after shrinkage end equal ---------------
  // Short (300 min) and Long (700 min) both clear every Grit cap even after
  // shrinkage toward a group of five modest regulars; the earlier revision
  // put them 6.96 Grit points apart for the 400 minutes alone.
  const modestRow = (i) => ({ name: 'Modest' + i, team: 'T', position: 'Center Back', totalMinutesProxy: 1000, pressures: 60, tackles: 10, interceptions: 0, defensiveActions: 20, progressiveActions: 15, keyPasses: 1, passesCompleted: 150, shotXgSum: 0, boxTouches: 0, shotsOnTarget: 0 });
  const capped = {
    players: [
      { name: 'Short', team: 'T', position: 'Center Back', totalMinutesProxy: 300, pressures: 200, tackles: 40, interceptions: 40, defensiveActions: 120, progressiveActions: 10, keyPasses: 1, passesCompleted: 100, shotXgSum: 0, boxTouches: 0, shotsOnTarget: 0 },
      { name: 'Long', team: 'T', position: 'Center Back', totalMinutesProxy: 700, pressures: 460, tackles: 90, interceptions: 90, defensiveActions: 280, progressiveActions: 20, keyPasses: 2, passesCompleted: 200, shotXgSum: 0, boxTouches: 0, shotsOnTarget: 0 },
      modestRow(1), modestRow(2), modestRow(3), modestRow(4), modestRow(5)
    ]
  };
  const cappedRows = applyMetric(capped, { grit: 100, involvement: 0, clutch: 0, minMinutes: 90, normalizePosition: true });
  const short = cappedRows.find(row => row.name === 'Short');
  const long = cappedRows.find(row => row.name === 'Long');
  const modest = cappedRows.find(row => row.name === 'Modest1');
  assert.ok(short.shrunkRates.pressures > 18 && long.shrunkRates.pressures > 18, 'both over the cap after shrinkage');
  assert.ok(short.shrunkRates.pressures !== long.shrunkRates.pressures, 'the rates differ');
  assert.ok(modest.shrunkRates.pressures < 18, 'the modest regular stays under the cap');
  assert.equal(short.components.shrunk.grit, 100);
  assert.equal(long.components.shrunk.grit, 100);
  assert.equal(short.components.grit, long.components.grit);
  assert.equal(short.score, long.score);
  assert.ok(modest.components.grit < short.components.grit);

  // --- receipts -------------------------------------------------------------
  const top = ranked[0];
  assert.equal(top.components.normalized, true);
  assert.equal(top.components.shrinkK, 450);
  assert.deepEqual(Object.keys(top.shrinkage).sort(), RATE_KEYS.map(key => 'per90Rates.' + key).sort());
  assert.deepEqual(Object.keys(top.shrunkRates).sort(), RATE_KEYS.slice().sort());
  // the shrunk component is what the percentile ranked: recompute it from
  // the shrunk rates with the same recipe
  keeperRows.concat(top12).forEach((row) => {
    const again = componentsFromRates(row.shrunkRates);
    assert.equal(again.grit, row.components.shrunk.grit, row.name);
    assert.equal(again.involvement, row.components.shrunk.involvement, row.name);
    assert.equal(again.clutch, row.components.shrunk.clutch, row.name);
  });
  assert.equal(typeof JSON.parse(JSON.stringify(top)).components.shrunk.grit, 'number');

  // shrinkage stays off when normalisation is off: the plain ranking is
  // untouched by S2 and no keeper is anywhere near the top.
  const plain = applyMetric(wc, DEFAULT_METRIC);
  assert.equal(plain[0].components.normalized, undefined);
  assert.equal(plain[0].components.shrunk, undefined);
  assert.equal(plain[0].shrunkRates, undefined);
  assert.equal(plain.slice(0, 12).filter(row => row.positionGroup === 'GK').length, 0);
});

// --- S3: provenance ledger for every displayed number ----------------------

// Walks data/wc2018_event_aggregates.json for a path such as
// "players[].per90.pressuresPer90" and reports whether it is a real numeric
// key on that player's record.
function resolveSourceField(fileRow, sourceField) {
  if (String(sourceField).indexOf('players[].') !== 0) return false;
  const parts = String(sourceField).slice('players[].'.length).split('.');
  let cursor = fileRow;
  for (let i = 0; i < parts.length; i += 1) {
    if (!cursor || typeof cursor !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(cursor, parts[i])) return false;
    cursor = cursor[parts[i]];
  }
  return Number.isFinite(cursor);
}

test('every sourceField in the ledger resolves to a real numeric key in the shipped file', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const byId = {};
  wc.players.forEach((row) => { byId[playerKey(row)] = row; });

  assert.equal(store.players.length, 605);
  assert.equal(LEDGER_FIELDS.length, 10);
  assert.ok(LEDGER_FIELDS.every(col => col.usedInScore));

  let checked = 0;
  store.players.forEach((player) => {
    const ledger = explainScore(player.id, DEFAULT_METRIC, store);
    assert.ok(ledger, player.id);
    assert.equal(ledger.components.length, 10);
    ledger.components.forEach((item) => {
      assert.ok(
        resolveSourceField(byId[player.id], item.sourceField),
        item.sourceField + ' does not resolve for ' + player.name
      );
      assert.ok(
        resolveSourceField(byId[player.id], item.countField),
        item.countField + ' does not resolve for ' + player.name
      );
      checked += 1;
    });
    // the pipeline prefers the file's own per90 block, and the ledger says so
    assert.equal(ledger.components[0].sourceField, 'players[].per90.pressuresPer90');
  });
  assert.equal(checked, 6050);
  // the minutes denominator is named too
  assert.equal(explainScore(store.players[0].id, DEFAULT_METRIC, store).minutesField,
    'players[].totalMinutesProxy');
});

test('the ledger impact is the number on screen, and its rounding residual is reported not hidden', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const ranked = applyMetric(wc, DEFAULT_METRIC);
  const scoreById = {};
  ranked.forEach((row) => { scoreById[row.id] = row.score; });

  let maxTotal = 0;
  let maxPillar = 0;
  let maxDisplay = 0;
  let exactWithin1e9 = 0;

  store.players.forEach((player) => {
    const ledger = explainScore(player.id, DEFAULT_METRIC, store);
    const recon = ledger.reconciliation;

    // impact IS the table score for anyone the table shows
    if (scoreById[player.id] != null) {
      assert.equal(ledger.impact, scoreById[player.id], player.name);
      assert.equal(ledger.displayed, true);
      assert.ok(ledger.rank >= 1);
    } else {
      assert.equal(ledger.displayed, false);
      assert.equal(ledger.rank, null);
      assert.equal(ledger.impact, compositeScore(player.components, DEFAULT_METRIC));
    }

    // the ledger closes: contributions + the two roundings == the number shown
    let sum = 0;
    ledger.components.forEach((item) => { sum += item.contribution; });
    assert.ok(Math.abs(sum - recon.componentsSum) < 1e-9);
    assert.ok(Math.abs(recon.componentsSum + recon.total - ledger.impact) < 1e-9, player.name);
    assert.ok(Math.abs(recon.pillarRounding + recon.displayRounding - recon.total) < 1e-9);

    // round1 on each of the three pillars can shift the composite by at most
    // 0.05 (0.4*0.05 + 0.3*0.05 + 0.3*0.05); round2 on the composite by 0.005
    assert.ok(Math.abs(recon.pillarRounding) <= 0.05 + 1e-9, player.name);
    assert.ok(Math.abs(recon.displayRounding) <= 0.005 + 1e-9, player.name);

    maxTotal = Math.max(maxTotal, Math.abs(recon.total));
    maxPillar = Math.max(maxPillar, Math.abs(recon.pillarRounding));
    maxDisplay = Math.max(maxDisplay, Math.abs(recon.displayRounding));
    if (Math.abs(recon.total) <= 1e-9) exactWithin1e9 += 1;
  });

  // THE BACKLOG IS WRONG HERE. It asks for sum(contributions) == the displayed
  // impact to 1e-9 for every player. That cannot hold while the pipeline
  // round1-s each pillar before weighting it: measured over all 605 players
  // the residual reaches 0.0467 (Seung-Woo Lee) and only 8 players land inside
  // 1e-9 by luck. The ledger reports the residual instead of pretending.
  assert.ok(Math.abs(maxTotal - 0.0467390422077969) < 1e-12, 'maxTotal ' + maxTotal);
  assert.equal(exactWithin1e9, 8);
  assert.ok(maxPillar > 0.046 && maxPillar < 0.05);
  // with the default 40/30/30 the composite of one-decimal pillars is already
  // exact to two decimals, so round2 costs nothing here
  assert.ok(maxDisplay < 1e-12, 'maxDisplay ' + maxDisplay);

  // pick weights that do not divide cleanly and round2 starts to bite
  const odd = { grit: 7, involvement: 5, clutch: 3, minMinutes: 270 };
  const kante = store.players.find(row => /Kant/.test(row.name));
  const oddLedger = explainScore(kante.id, odd, store);
  assert.equal(oddLedger.impact, 62.99);
  assert.ok(Math.abs(oddLedger.reconciliation.displayRounding - 0.0033333333333303017) < 1e-12);
  assert.ok(Math.abs(
    oddLedger.reconciliation.componentsSum + oddLedger.reconciliation.total - oddLedger.impact
  ) < 1e-9);
});

test('the ledger is a stable, JSON-serialisable derivation tree for one player', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const kante = store.players.find(row => /Kant/.test(row.name));
  const ledger = explainScore(kante.id, DEFAULT_METRIC, store);

  assert.equal(ledger.impact, 54.92);
  assert.equal(ledger.rank, 54);
  assert.equal(ledger.minutes, 621);
  assert.equal(ledger.normalized, false);
  assert.equal(ledger.dataset, 'data/wc2018_event_aggregates.json');
  assert.equal(ledger.provenance, OPEN_DATA_PROVENANCE);
  assert.deepEqual(ledger.weights, { grit: 40, involvement: 30, clutch: 30, total: 100 });

  assert.deepEqual(ledger.components.map(item => item.name), [
    'pressures', 'tackles', 'interceptions', 'defensiveActions',
    'progressiveActions', 'keyPasses', 'passesCompleted',
    'shotXgSum', 'boxTouches', 'shotsOnTarget'
  ]);
  assert.deepEqual(ledger.components.map(item => item.feeds), [
    'grit', 'grit', 'grit', 'grit',
    'involvement', 'involvement', 'involvement',
    'clutch', 'clutch', 'clutch'
  ]);

  const press = ledger.components[0];
  assert.equal(press.raw, 183);
  assert.equal(press.per90, 26.5217);
  assert.equal(press.cap, 18);
  assert.equal(press.capped, 18);            // 26.52/90 is over the cap
  assert.equal(press.scaled, 100);
  assert.equal(press.recipeWeight, 0.45);
  assert.ok(Math.abs(press.weight - 0.45 * 40 / 100) < 1e-12);
  assert.ok(Math.abs(press.contribution - 18) < 1e-9);
  assert.equal(press.sourceField, 'players[].per90.pressuresPer90');
  assert.equal(press.countField, 'players[].pressures');
  assert.equal(press.sharesCapWith, null);

  // tackles and interceptions share one cap of 6/90; the capped pair is split
  // in proportion to each field's own per-90, so the two scaled values still
  // add up to exactly what componentsFromEvents caps the pair to.
  const tackles = ledger.components[1];
  const intercepts = ledger.components[2];
  assert.equal(tackles.sharesCapWith, 'players[].interceptions');
  assert.equal(intercepts.sharesCapWith, 'players[].tackles');
  assert.equal(tackles.pairedPer90, intercepts.pairedPer90);
  assert.ok(Math.abs(tackles.pairedPer90 - (tackles.per90 + intercepts.per90)) < 1e-12);
  const pairScaled = Math.min(tackles.pairedPer90, 6) / 6 * 100;
  assert.ok(Math.abs(tackles.scaled + intercepts.scaled - pairScaled) < 1e-9);
  assert.ok(tackles.scaled < intercepts.scaled, 'he intercepts more than he tackles');

  assert.deepEqual(ledger.pillars.map(item => [item.name, item.value, item.weight]), [
    ['grit', 94.4, 40], ['involvement', 56.2, 30], ['clutch', 1, 30]
  ]);
  assert.equal(ledger.pillars[0].transform, 'round1');

  // stable and serialisable
  const json = JSON.stringify(ledger);
  assert.equal(JSON.stringify(explainScore(kante.id, DEFAULT_METRIC, store)), json);
  assert.deepEqual(JSON.parse(json), ledger);
  assert.doesNotMatch(json, /NaN|Infinity/);

  // unknown player or missing store is reported, never invented
  assert.equal(explainScore('no-such-player', DEFAULT_METRIC, store), null);
  assert.equal(explainScore(kante.id, DEFAULT_METRIC, null), null);
  assert.equal(explainScore(null, DEFAULT_METRIC, store), null);

  // under normalisation the pillars are no longer a plain round1 of the
  // components, and the ledger names the transform instead of hiding it
  const normalised = explainScore(kante.id,
    Object.assign({}, DEFAULT_METRIC, { normalizePosition: true }), store);
  assert.equal(normalised.normalized, true);
  assert.equal(normalised.pillars[0].transform,
    'shrinkByPosition(k=450) on each per-90 rate, then caps, scale, round1, then within-position percentile (average rank for ties)');
  // and the ledger shows the rate the caps really saw next to the raw one
  assert.ok(normalised.components.every(item => typeof item.shrunkPer90 === 'number'));
  assert.ok(ledger.components.every(item => item.shrunkPer90 === null));
  assert.ok(Math.abs(
    normalised.reconciliation.componentsSum + normalised.reconciliation.total - normalised.impact
  ) < 1e-9);
});

test('the lesson table and the counts explorer are drawn from the ledger', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const kante = store.players.find(row => /Kant/.test(row.name));
  const view = store.derive(Object.assign({}, DEFAULT_METRIC, { selectedId: kante.id }));

  assert.ok(view.ledger);
  assert.equal(view.ledger.playerId, view.selected.id);
  assert.equal(view.ledger.impact, view.selected.score);
  assert.equal(view.ledger.rank, view.selected.rank);

  // the explorer row now says which path the pipeline really read
  const press = view.explorer.rows.find(row => row.key === 'pressures');
  assert.equal(press.filePath, 'players[].pressures');
  assert.equal(press.sourceField, 'players[].per90.pressuresPer90');

  // and the screen reads its numbers off the ledger, not off a parallel table
  assert.match(html, /ledger: current\.ledger/);
  assert.match(html, /ledger\.components/);
  assert.match(html, /data-source-field=/);
  assert.match(html, /row\.sourceField/);
  assert.match(html, /reconciliation\.componentsSum/);
  assert.match(html, /reconciliation\.total/);
  assert.match(html, /ledger\.impact/);
});

// --- verification round: findings 1-5 --------------------------------------

test('the ledger reconciliation binds to numbers the test recomputes itself', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const ranked = applyMetric(wc, DEFAULT_METRIC);
  const byId = {};
  ranked.forEach((row) => { byId[row.id] = row; });
  const total = DEFAULT_METRIC.grit + DEFAULT_METRIC.involvement + DEFAULT_METRIC.clutch;
  const round1 = v => Math.round(v * 10) / 10;
  const round2 = v => Math.round(v * 100) / 100;

  let checked = 0;
  store.players.forEach((player) => {
    const ledger = explainScore(player.id, DEFAULT_METRIC, store);
    const recon = ledger.reconciliation;

    // pillar.fromComponents recomputed from the components array
    const fromComponents = { grit: 0, involvement: 0, clutch: 0 };
    ledger.components.forEach((item) => {
      // scaled recomputed from per90 and cap (the pair split for tackles/
      // interceptions is checked separately below)
      if (!item.sharesCapWith) {
        const scaled = Math.min(item.cap, Math.max(0, item.per90)) / item.cap * 100;
        assert.ok(Math.abs(scaled - item.scaled) < 1e-9, item.name);
      }
      fromComponents[item.feeds] += item.scaled * item.recipeWeight;
    });
    const pair = ledger.components.filter(item => item.sharesCapWith);
    const pairScaled = Math.min(6, pair[0].per90 + pair[1].per90) / 6 * 100;
    assert.ok(Math.abs(pair[0].scaled + pair[1].scaled - pairScaled) < 1e-9);

    // pillar value = round1(fromComponents) - the component the table shows
    let pillarSum = 0;
    ledger.pillars.forEach((pillar) => {
      assert.ok(Math.abs(pillar.fromComponents - fromComponents[pillar.name]) < 1e-9, player.name + ' ' + pillar.name);
      assert.equal(pillar.value, round1(fromComponents[pillar.name]), player.name + ' ' + pillar.name);
      assert.equal(pillar.value, player.components[pillar.name]);
      pillarSum += pillar.value * DEFAULT_METRIC[pillar.name] / total;
    });
    // componentsSum recomputed from scaled x recipeWeight x pillar share
    let componentsSum = 0;
    ['grit', 'involvement', 'clutch'].forEach((key) => {
      componentsSum += fromComponents[key] * DEFAULT_METRIC[key] / total;
    });
    assert.ok(Math.abs(recon.componentsSum - componentsSum) < 1e-9, player.name);
    // pillarSum is the weighted sum of the ROUNDED pillars, never the same
    // number as componentsSum unless the roundings happen to cancel
    assert.ok(Math.abs(recon.pillarSum - pillarSum) < 1e-9, player.name);
    assert.ok(Math.abs(recon.pillarRounding - (pillarSum - componentsSum)) < 1e-9, player.name);
    // impact = round2(pillarSum) = the table
    assert.equal(ledger.impact, round2(pillarSum), player.name);
    assert.ok(Math.abs(recon.displayRounding - (ledger.impact - pillarSum)) < 1e-9, player.name);
    if (byId[player.id]) assert.equal(ledger.impact, byId[player.id].score);
    checked += 1;
  });
  assert.equal(checked, 605);

  // among DISPLAYED players (>= 270 minutes) the largest residual is
  // Hector Moreno's 0.04117375; Seung-Woo Lee's 0.0467 is below minMinutes
  let worst = null;
  store.players.forEach((player) => {
    const ledger = explainScore(player.id, DEFAULT_METRIC, store);
    if (ledger.displayed && (!worst || Math.abs(ledger.reconciliation.total) > Math.abs(worst.reconciliation.total))) worst = ledger;
  });
  assert.match(worst.name, /Moreno/);
  assert.equal(worst.rank, 194);
  assert.ok(Math.abs(worst.reconciliation.total - 0.04117375) < 1e-9, String(worst.reconciliation.total));
  const lee = store.players.find(row => /Seung-Woo Lee/.test(row.name));
  assert.ok(lee.minutes < DEFAULT_METRIC.minMinutes);
  assert.equal(explainScore(lee.id, DEFAULT_METRIC, store).displayed, false);
});

test('derive never runs the bootstrap; validationInterval does, once per spec, and the lab wires it debounced', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  assert.equal(store.bootstrapRuns, 0);

  const first = store.derive(DEFAULT_METRIC);
  store.derive(Object.assign({}, DEFAULT_METRIC, { grit: 41 }));
  store.derive(Object.assign({}, DEFAULT_METRIC, { minMinutes: 300 }));
  assert.equal(store.bootstrapRuns, 0, 'derive ran the bootstrap');
  // before the interval exists the label says so instead of showing a bare rho
  assert.equal(first.validation.intervalReady, false);
  assert.equal(first.validation.test.ci.reason, 'pending');
  assert.equal(first.validation.test.rhoLabel, RHO + ' = 0.30 [רווח בטחון בחישוב…]');
  assert.equal(first.validation.test.rho, 0.3);

  const report = store.validationInterval(DEFAULT_METRIC);
  assert.equal(store.bootstrapRuns, 2, 'one bootstrap per fold');
  assert.equal(report.intervalReady, true);
  assert.deepEqual(report.test.ci, bootstrapSpearman(
    applyMetric(wc, DEFAULT_METRIC)
      .filter(row => assignFold(row, 'groups') === 'test')
      .map(row => [row.score, outcomeValue(row, 'assists')]),
    { iterations: 1000, seed: 42 }
  ));
  assert.equal(report.test.rhoLabel, RHO + ' = 0.30 [0.14, 0.45]');
  // memoised: the same spec never pays twice, and derive now sees it for free
  store.validationInterval(Object.assign({}, DEFAULT_METRIC, { selectedId: 'x' }));
  assert.equal(store.bootstrapRuns, 2);
  const again = store.derive(DEFAULT_METRIC);
  assert.equal(store.bootstrapRuns, 2);
  assert.equal(again.validation.intervalReady, true);
  assert.deepEqual(again.validation.test.ci, report.test.ci);
  assert.equal(again.validation.verdict, report.verdict);
  // A moved weight changes the fold pairs, so memoising cannot spare a drag
  // the cost: 232 of the 240 displayed scores move for grit 40 -> 41 alone.
  // That is why the interval is debounced out of derive() rather than cached
  // inside it.
  const base = applyMetric(wc, DEFAULT_METRIC);
  const nudged = {};
  applyMetric(wc, Object.assign({}, DEFAULT_METRIC, { grit: 41 }))
    .forEach((row) => { nudged[row.id] = row.score; });
  assert.equal(base.length, 240);
  assert.equal(base.filter(row => nudged[row.id] !== row.score).length, 232);
  store.validationInterval(Object.assign({}, DEFAULT_METRIC, { grit: 41 }));
  assert.equal(store.bootstrapRuns, 4);

  // the page: interval is scheduled after derive, debounced, and on change
  assert.match(html, /store\.validationInterval\(/);
  assert.match(html, /INTERVAL_DEBOUNCE_MS = 300/);
  assert.match(html, /addEventListener\('change', function \(\) \{ scheduleInterval\(0\); \}\)/);
  assert.match(html, /intervalReady/);
  assert.match(html, /ci\.reason === 'pending'/);
  assert.match(html, /קטן מדי לרווח/);
  assert.match(html, /percentile bootstrap/);

  // the bootstrap options are validated at the edge: a bad iterations option
  // falls back with a note instead of throwing out of validateMetric
  const bad = validateMetric(store.players, DEFAULT_METRIC, { iterations: 10, bootstrap: false });
  assert.equal(bad.bootstrap.iterations, 1000);
  assert.equal(bad.bootstrap.notes.length, 1);
  assert.match(bad.bootstrap.notes[0], /iterations 10/);
  assert.doesNotThrow(() => createStore(wc, { bootstrap: { iterations: 10 } }).derive(DEFAULT_METRIC));
  const badStore = createStore(wc, { bootstrap: { iterations: 10 } });
  assert.equal(badStore.validationInterval(DEFAULT_METRIC).bootstrap.iterations, 1000);
});

test('bootstrapSpearman refuses non-integer or oversized iterations, applies one seed rule, floors n, and counts degenerate replicates', () => {
  const perfect = [];
  for (let i = 1; i <= 40; i += 1) perfect.push([i, i * 3]);

  // iterations: integer in [50, 20000]
  assert.equal(BOOTSTRAP_MIN_ITERATIONS, 50);
  assert.equal(BOOTSTRAP_MAX_ITERATIONS, 20000);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 50.9 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 49.9 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 20001 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 1e7 }), RangeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: Infinity }), RangeError);
  assert.equal(bootstrapSpearman(perfect, { iterations: 20000 }).iterations, 20000);
  assert.equal(bootstrapSpearman(perfect, { iterations: '100' }).iterations, 100);

  // seed: null / undefined / false / '' are all the default 42; a number and
  // its string are the same stream; other types are refused
  const byDefault = bootstrapSpearman(perfect, { iterations: 100 });
  assert.equal(byDefault.seed, 42);
  assert.deepEqual(bootstrapSpearman(perfect, { iterations: 100, seed: null }), byDefault);
  assert.deepEqual(bootstrapSpearman(perfect, { iterations: 100, seed: undefined }), byDefault);
  assert.deepEqual(bootstrapSpearman(perfect, { iterations: 100, seed: false }), byDefault);
  assert.deepEqual(bootstrapSpearman(perfect, { iterations: 100, seed: '' }), byDefault);
  assert.deepEqual(
    Object.assign({}, bootstrapSpearman(perfect, { iterations: 100, seed: '42' }), { seed: 42 }),
    byDefault
  );
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 100, seed: true }), TypeError);
  assert.throws(() => bootstrapSpearman(perfect, { iterations: 100, seed: {} }), TypeError);

  // n floor: at minMinutes = 600 the shipped held-out fold is 5 players
  assert.equal(BOOTSTRAP_MIN_N, 10);
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const thin = validateMetric(store.players, Object.assign({}, DEFAULT_METRIC, { minMinutes: 600 }), {});
  assert.equal(thin.test.n, 5);
  assert.equal(thin.test.ci.n, 5);
  assert.equal(thin.test.ci.rho, 0.866);
  assert.equal(thin.test.ci.lo, null);
  assert.equal(thin.test.ci.hi, null);
  assert.equal(thin.test.ci.reason, 'n<10');
  assert.equal(thin.test.rhoLabel, RHO + ' = 0.87 [n=5 קטן מדי לרווח]');
  assert.match(thin.verdict, /n=5 קטן מ-10/);
  assert.equal(thin.intervalReady, true);
  // the pending state is a different reason and never claims the floor
  assert.notEqual(validateMetric(store.players, DEFAULT_METRIC, { bootstrap: false }).test.ci.reason, 'n<10');

  // degenerate replicates are counted and dropped, not mapped to rho = 0:
  // n = 10 real pairs with 7 zero-assist players give 8 one-sided resamples
  const ten = validateMetric(store.players, Object.assign({}, DEFAULT_METRIC, { minMinutes: 550 }), {});
  assert.equal(ten.test.n, 10);
  assert.equal(ten.test.ci.degenerateCount, 8);
  assert.equal(ten.test.ci.effectiveIterations, 992);
  assert.equal(ten.test.ci.lo, -0.265);
  assert.equal(ten.test.ci.hi, 0.905);
  // the pinned n = 120 interval had no degenerate replicate to begin with
  const full = validateMetric(store.players, DEFAULT_METRIC, {});
  assert.equal(full.test.ci.degenerateCount, 0);
  assert.equal(full.test.ci.effectiveIterations, 1000);
  assert.deepEqual([full.test.ci.lo, full.test.ci.hi], [0.137, 0.45]);
  // all-constant targets: every replicate is degenerate and the result says so
  const flat = bootstrapSpearman(perfect.map(pair => [pair[0], 1]), { iterations: 100 });
  assert.equal(flat.degenerateCount, 100);
  assert.equal(flat.effectiveIterations, 0);
  assert.equal(flat.lo, null);
  assert.equal(flat.reason, 'all replicates degenerate');
});

test('a BYOD file without the per90 block reports null for fields it does not contain', () => {
  const players = [
    { name: 'Only Two', team: 'Home', position: 'Center Back', minutes: 400, pressures: 40, passesCompleted: 100 },
    { name: 'Full Row', team: 'Away', position: 'Center Forward', minutes: 400, pressures: 10, tackles: 1, interceptions: 0, defensiveActions: 4, progressiveActions: 20, keyPasses: 6, passesCompleted: 50, shotXgSum: 2, boxTouches: 20, shotsOnTarget: 4 }
  ];
  const store = createStore({ players: players }, { provenance: USER_DATA_PROVENANCE });
  const thin = explainScore(playerKey(players[0]), { grit: 40, involvement: 30, clutch: 30, minMinutes: 90 }, store);
  const named = thin.components.filter(item => item.sourceField != null);
  assert.deepEqual(named.map(item => item.sourceField), ['players[].pressures', 'players[].passesCompleted']);
  assert.deepEqual(named.map(item => item.raw), [40, 100]);
  thin.components.filter(item => item.sourceField == null).forEach((item) => {
    assert.equal(item.raw, null, item.name);
    assert.equal(item.inFile, false);
    assert.equal(item.countField, null);
    assert.equal(item.per90, 0, 'the pipeline used 0 for ' + item.name);
    assert.equal(item.contribution, 0);
  });
  assert.equal(thin.components.filter(item => item.sourceField == null).length, 8);
  assert.equal(thin.minutesField, 'players[].minutes');
  // the ledger still closes on the score the table shows
  const view = store.derive({ grit: 40, involvement: 30, clutch: 30, minMinutes: 90, selectedId: playerKey(players[0]) });
  assert.equal(view.ledger.impact, view.selected.score);
  assert.ok(Math.abs(view.ledger.reconciliation.componentsSum + view.ledger.reconciliation.total - view.ledger.impact) < 1e-9);
  // the counts explorer says the same
  const explorerRow = view.explorer.rows.find(row => row.key === 'shotXgSum');
  assert.equal(explorerRow.sourceField, null);
  assert.equal(explorerRow.inFile, false);
  assert.equal(view.explorer.rows.find(row => row.key === 'pressures').inFile, true);
  // the full row resolves every field through the count path (no per90 block)
  const full = explainScore(playerKey(players[1]), { grit: 40, involvement: 30, clutch: 30, minMinutes: 90 }, store);
  assert.ok(full.components.every(item => item.sourceField === 'players[].' + item.name));
  // a CSV upload with a subset of columns takes the same path
  const csv = parseUserDataset('name,team,position,minutes,pressures,passesCompleted\nCsv,Home,Left Back,300,20,80', { attested: true });
  const csvStore = createStore({ players: csv.players }, { provenance: USER_DATA_PROVENANCE });
  const csvLedger = explainScore(csvStore.players[0].id, DEFAULT_METRIC, csvStore);
  assert.equal(csvLedger.components.filter(item => item.sourceField == null).length, 8);
  assert.equal(csvLedger.minutesField, 'players[].totalMinutesProxy');
  // and the page prints "not in the file" rather than a <code> path
  assert.match(html, /row\.sourceField == null/);
  assert.match(html, /לא בקובץ/);
  assert.match(html, /row\.inFile === false/);
  // the shipped file resolves everything, so nothing there is null
  const wc = require('../data/wc2018_event_aggregates.json');
  const wcStore = createStore(wc);
  wcStore.players.forEach((player) => {
    const ledger = explainScore(player.id, DEFAULT_METRIC, wcStore);
    assert.ok(ledger.components.every(item => item.sourceField != null && item.raw != null && item.inFile), player.name);
  });
});
