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
  rankInterval,
  bootstrapSpearmanCi,
  permutationPValue,
  pearson,
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
  LEARNING_STORAGE_KEY,
  emptyLearningState,
  serializeLearningState,
  parseLearningState,
  loadLearningState,
  saveLearningState,
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
  WC2018_GROUPS,
  OUTCOMES,
  auditOutcome,
  LEAKY_RHO,
  USER_DATA_PROVENANCE,
  SYNTHETIC_PROVENANCE,
  OPEN_DATA_PROVENANCE,
  selectedWeightSwing,
  bestHelpfulBump,
  nearNumber,
  COURSE_QUIZ,
  quizMarkedCorrect,
  matchesMarkedQuiz
} = require('../demo.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'demo.js'), 'utf8');
const uiRuntime = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');
const offerHtml = fs.readFileSync(path.join(root, 'offer.html'), 'utf8');

test('product runtime has no video theater, no demo fixtures, and no outbound network', () => {
  const productRuntime = `${html}\n${runtime}\n${uiRuntime}`;
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
  assert.doesNotMatch(html + '\n' + runtime + '\n' + uiRuntime, /https?:\/\//);
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

test('rankInterval is deterministic for the same seed and wider for low-minute players', () => {
  function player(name, team, minutes, rates) {
    const f = minutes / 90;
    return {
      name: name, team: team, position: 'Center Defensive Midfield',
      totalMinutesProxy: minutes,
      pressures: Math.round(rates.press * f),
      tackles: Math.round(rates.tack * f),
      interceptions: Math.round(rates.inter * f),
      defensiveActions: Math.round(rates.def * f),
      progressiveActions: Math.round(rates.prog * f),
      keyPasses: Math.round(rates.key * f),
      passesCompleted: Math.round(rates.pass * f),
      shotXgSum: Number((rates.xg * f).toFixed(3)),
      boxTouches: Math.round(rates.box * f),
      shotsOnTarget: Math.round(rates.sot * f)
    };
  }
  // Stay below per90 caps so Poisson noise moves scaled components.
  const base = { press: 10, tack: 1.2, inter: 1.0, def: 7, prog: 8, key: 0.8, pass: 40, xg: 0.05, box: 1, sot: 0.3 };
  function bump(delta) { return Object.assign({}, base, { press: base.press + delta }); }
  const dataset = {
    players: [
      player('LowMin', 'France', 120, base),
      player('HighMin', 'Germany', 600, base),
      player('P1', 'Spain', 500, bump(4)),
      player('P2', 'Brazil', 500, bump(3)),
      player('P3', 'England', 500, bump(2)),
      player('P4', 'Belgium', 500, bump(1)),
      player('P5', 'Croatia', 500, bump(-1)),
      player('P6', 'Uruguay', 500, bump(-2)),
      player('P7', 'Portugal', 500, bump(-3)),
      player('P8', 'Argentina', 500, bump(-4)),
      player('P9', 'Mexico', 500, bump(-5)),
      player('P10', 'Switzerland', 500, bump(-6))
    ]
  };
  const store = createStore(dataset);
  const spec = { grit: 80, involvement: 15, clutch: 5, minMinutes: 90 };
  const seed = 'scoutai-rank|demo-width';
  const first = rankInterval(store.players, spec, { seed: seed, samples: 250 });
  const second = rankInterval(store.players, spec, { seed: seed, samples: 250 });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const low = first.find(row => row.name === 'LowMin');
  const high = first.find(row => row.name === 'HighMin');
  assert.ok(low && high);
  assert.ok(low.hi - low.lo > high.hi - high.lo);
  assert.ok(low.top10Share >= 0 && low.top10Share <= 1);
  assert.match(html, /מרווח 90%/);
});

test('fragilityReport tags weight-100 bump as blocked instead of blaming minutes', () => {
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
  const report = fragilityReport(dataset, { grit: 100, involvement: 0, clutch: 0, minMinutes: 270 }, 10);
  const gritVar = report.find(item => item.key === 'grit');
  assert.ok(gritVar);
  assert.equal(gritVar.blocked, true);
  assert.notEqual(gritVar.label, 'Grit +10');
  assert.match(gritVar.label, /אין הפרעה אפשרית במשקל 100/);
  assert.equal(gritVar.swings.length, 0);
  assert.match(html, /אין הפרעה אפשרית במשקל 100/);
  // Minutes-threshold copy stays for real empty swings; blocked branch must not reuse it.
  assert.match(html, /variant\.blocked/);
  assert.match(html, /נסו סף דקות אחר/);
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
  assert.equal(evaluateCurriculum(gritView).length, 8);
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
        name: 'MF-mid-a', team: 'Brazil', position: 'Center Midfield',
        totalMinutesProxy: 450, pressures: 70, tackles: 10, interceptions: 8,
        defensiveActions: 40, progressiveActions: 15, keyPasses: 1, passesCompleted: 140,
        shotXgSum: 0.08, boxTouches: 2, shotsOnTarget: 0
      },
      {
        name: 'MF-mid-b', team: 'Spain', position: 'Center Midfield',
        totalMinutesProxy: 440, pressures: 55, tackles: 8, interceptions: 6,
        defensiveActions: 30, progressiveActions: 12, keyPasses: 1, passesCompleted: 120,
        shotXgSum: 0.07, boxTouches: 1, shotsOnTarget: 0
      },
      {
        name: 'MF-mid-c', team: 'Belgium', position: 'Left Center Midfield',
        totalMinutesProxy: 420, pressures: 40, tackles: 5, interceptions: 4,
        defensiveActions: 20, progressiveActions: 11, keyPasses: 1, passesCompleted: 100,
        shotXgSum: 0.06, boxTouches: 1, shotsOnTarget: 0
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

test('mid-rank percentile: five same-position zero-clutch peers each get 50 with tiedPeers===5', () => {
  const peers = {
    players: [1, 2, 3, 4, 5].map(function (n) {
      return {
        name: 'Zero-MF-' + n,
        team: 'France',
        position: 'Center Midfield',
        totalMinutesProxy: 400,
        pressures: 10 + n,
        tackles: 2,
        interceptions: 1,
        defensiveActions: 8,
        progressiveActions: 5,
        keyPasses: 0,
        passesCompleted: 50,
        shotXgSum: 0,
        boxTouches: 0,
        shotsOnTarget: 0
      };
    })
  };
  const rows = applyMetric(peers, {
    grit: 40, involvement: 30, clutch: 30, minMinutes: 270, normalizePosition: true
  });
  assert.equal(rows.length, 5);
  rows.forEach(function (row) {
    assert.equal(row.components.clutch, 50);
    assert.equal(row.components.ties.clutch.tiedPeers, 5);
    assert.equal(row.components.ties.clutch.groupN, 5);
  });
});

test('position mid-rank: no zero-xg GK in top 12 on shipped data at 40/30/30 + normalize', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const rows = applyMetric(wc, {
    grit: 40, involvement: 30, clutch: 30, minMinutes: 270, normalizePosition: true
  });
  assert.ok(rows.slice(0, 12).every(r => !(r.positionGroup === 'GK' && r.components.raw.xg90 === 0)));
  const zeroStuck = rows.filter(r =>
    r.positionGroup === 'GK' &&
    r.components.raw.xg90 === 0 &&
    r.components.raw.boxTouches90 === 0 &&
    r.components.raw.shotsOnTarget90 === 0
  );
  assert.ok(zeroStuck.length > 0);
  assert.ok(zeroStuck.every(r => r.components.clutch <= 50));
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
  const claim = { roseComponent: 'grit', costGroup: 'FW' };
  const passed = evaluateExercise(wc, DEFENDER_EXERCISE.hint, claim);
  assert.equal(failed.id, 'defenders-sensible');
  assert.equal(failed.passed, false);
  assert.ok(failed.checks.some(item => item.id === 'defenders-surface' && item.pass === false));
  assert.ok(failed.checks.some(item => item.id === 'not-just-attackers' && item.pass === false));
  assert.equal(passed.passed, true);
  assert.ok(passed.dfNow > failed.dfNow);
  assert.ok(passed.checks.every(item => item.pass));
  assert.ok(passed.checks.some(item => item.id === 'tradeoff-defence' && item.pass === true));
  const gritOnly = applyMetric(DEFENDERS, { grit: 80, involvement: 15, clutch: 5, minMinutes: 270 });
  const stopper = gritOnly.find(row => row.name === 'Stopper');
  const poacher = gritOnly.find(row => row.name === 'Poacher');
  assert.ok(stopper.rank < poacher.rank);
  assert.equal(stopper.positionGroup, 'DF');
  assert.match(html, /תרגיל מודרך/);
  assert.match(html, /בדיקה עצמית/);
  assert.match(html, /הצהרת פשרה/);
  assert.match(html, /defenceText/);
});

test('learning state serialize/parse round-trips and corrupt input yields empty default', () => {
  const sample = {
    answers: { unusedField: 'dribbles', per90: '12.5', commercial: 'no' },
    defence: 'הגנה בעברית — למה Grit עלה ו־FW שילמו.',
    roseComponent: 'grit',
    costGroup: 'FW'
  };
  const raw = serializeLearningState(sample);
  const again = parseLearningState(raw);
  assert.equal(again.answers.unusedField, 'dribbles');
  assert.equal(again.answers.per90, '12.5');
  assert.equal(again.defence, sample.defence);
  assert.equal(again.roseComponent, 'grit');
  assert.equal(again.costGroup, 'FW');
  assert.equal(LEARNING_STORAGE_KEY, 'scoutai.learning.v1');
  const empty = emptyLearningState();
  assert.equal(parseLearningState('not-json{{{').defence, empty.defence);
  assert.equal(parseLearningState(null).roseComponent, '');
  assert.equal(parseLearningState(undefined).costGroup, '');
  assert.equal(parseLearningState('{]').answers.commercial, '');
  assert.doesNotThrow(() => parseLearningState(Buffer.from([0xff, 0xfe]).toString('binary')));
  const mem = {
    data: Object.create(null),
    getItem(key) { return this.data[key]; },
    setItem(key, value) { this.data[key] = String(value); }
  };
  assert.equal(saveLearningState(mem, sample), true);
  assert.equal(loadLearningState(mem).defence, sample.defence);
  assert.equal(loadLearningState(null).defence, '');
  assert.equal(saveLearningState({ setItem() { throw new Error('quota'); } }, sample), false);
});

test('evaluateExercise rejects no-cost-to-forwards claim with both live median numbers', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const bad = evaluateExercise(wc, DEFENDER_EXERCISE.hint, {
    roseComponent: 'grit',
    costGroup: 'no cost to forwards'
  });
  assert.equal(bad.passed, false);
  const trade = bad.checks.find(item => item.id === 'tradeoff-defence');
  assert.ok(trade);
  assert.equal(trade.pass, false);
  assert.match(String(trade.detail), new RegExp(String(bad.medianDf)));
  assert.match(String(trade.detail), new RegExp(String(bad.medianFw)));
  assert.ok(bad.medianDf != null && bad.medianFw != null);
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
  const defence = 'הגנה מילה-במילה: בחרתי Grit כי בלמים לא חיו על xG, ו־FW שילמו בחציון.';
  const bundle = exportMetricBundle(view.spec, view.selected, {
    compared: view.compared,
    learning: {
      defence: defence,
      passed: true,
      roseComponent: 'grit',
      costGroup: 'FW',
      record: [{ id: 'tradeoff-defence', pass: true, label: 'פשרה' }]
    }
  });
  assert.equal(bundle.commercial, false);
  assert.equal(bundle.generatedLocally, true);
  assert.equal(bundle.provenance, 'STATSBOMB_OPEN_DATA');
  assert.equal(bundle.source.competitionId, 43);
  assert.equal(bundle.learning.defence, defence);
  assert.equal(bundle.learning.passed, true);
  assert.equal(bundle.commercial, false);
  assert.match(bundle.methodologyHe, /לא כהמלצת סקאוטינג/);
  assert.match(bundle.methodologyHe, /אוסר שימוש מסחרי/);
  assert.match(bundle.methodologyHe, /מונדיאל 2018/);
  assert.match(bundle.citationEn, /Non-commercial/);
  assert.doesNotMatch(bundle.methodologyHe, /https?:\/\//);
  assert.doesNotMatch(JSON.stringify(bundle), /https?:\/\//);
  assert.match(methodologyParagraph(view.spec, view.selected), /משקלות ידניות/);
  assert.match(html, /ייצוא המדד/);
  assert.match(html, /scoutai-metric\.json/);
  assert.match(html, /ההגנה שלכם/);
  assert.match(offerHtml, /כותב בעצמו|הגנה/);
});

test('glossary names the StatsBomb event types that feed the score and the ones that do not', () => {
  const types = EVENT_GLOSSARY.map(item => item.type);
  for (const needed of ['Pressure', 'Duel / Tackle', 'Interception', 'Ball Recovery', 'Block', 'Pass', 'Carry', 'Shot + statsbomb_xg']) {
    assert.ok(types.includes(needed), needed);
  }
  assert.ok(EVENT_GLOSSARY.some(item => item.usedInScore === false && /Dribble/.test(item.type)));
  assert.ok(EVENT_GLOSSARY.some(item => item.feeds === 'סף דקות'));
  assert.match(html, /מילון סוגי אירועים/);
  assert.match(html + '\n' + runtime + '\n' + uiRuntime, /לא בנוסחה/);
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
  assert.equal(pearson([1, 1, 1], [2, 2, 2]), null);
  assert.equal(spearman([5, 5, 5], [1, 2, 3]), null);
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
  // assists validation.test.rho ≈ 0.30 on the 40/30/30 group split (n=120).
  assert.ok(report.test.rho >= 0.25 && report.test.rho <= 0.35);
  assert.ok(report.audit.maxRho < 0.95);
  // goals: conceptual Clutch overlap remains, but leaky now means measured
  // copy (|ρ|≥LEAKY_RHO vs a scoring-input count), which goals does not meet.
  const goalsReport = validateMetric(store.players, DEFAULT_METRIC, { outcomeId: 'goals', splitId: 'groups' });
  assert.equal(goalsReport.leaky, false);
  assert.ok(goalsReport.test.componentRho.clutch > goalsReport.test.componentRho.grit);
  assert.match(html, /מעבדת אימות/);
  assert.match(html, /אין בריפו עונה שנייה/);
  assert.match(html, /id="validateAudit"/);
});

test('measured outcome audit flags duelsWon as a tackles copy and keeps assists clean', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const duels = validateMetric(store.players, DEFAULT_METRIC, { outcomeId: 'duelsWon' });
  assert.equal(duels.leaky, true);
  assert.equal(duels.audit.maxRho, 1);
  assert.equal(duels.audit.maxField, 'tackles');
  assert.equal(duels.audit.identicalRows, 605);
  assert.equal(duels.train.rho, null);
  assert.equal(duels.test.rho, null);
  assert.equal(duels.test.redacted, true);
  assert.match(duels.verdict, /דליפה נמדדת|מוסתר/);
  const assistsAudit = auditOutcome(store.players, 'assists');
  assert.equal(assistsAudit.leaky, false);
  assert.ok(assistsAudit.maxRho < 0.95);
  assert.ok(assistsAudit.maxRho < 0.5);
  assert.equal(LEAKY_RHO, 0.95);
  // Guard: no declared-clean outcome may hide a measured copy.
  OUTCOMES.forEach(function (item) {
    const audit = auditOutcome(store.players, item.id);
    if (audit.leaky === false) {
      assert.ok(
        audit.maxRho == null || Math.abs(audit.maxRho) <= 0.95,
        item.id + ' declared/measured clean but overlap ' + audit.maxRho
      );
    }
  });
  // Static OUTCOMES.leaky:false must not disagree with a measured copy.
  OUTCOMES.forEach(function (item) {
    const audit = auditOutcome(store.players, item.id);
    if (item.leaky === false) {
      assert.ok(!(audit.maxRho != null && Math.abs(audit.maxRho) > 0.95),
        item.id + ' has leaky:false but measured overlap ' + audit.maxRho);
    }
  });
});

test('holdout baselines: minutes, best component, seeded null band, and Hebrew לא עוקף', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const opts = { outcomeId: 'assists', splitId: 'groups', seed: 'scoutai-demo-001' };
  const v = validateMetric(store.players, DEFAULT_METRIC, opts);
  assert.equal(v.test.rho, 0.3);
  assert.equal(v.test.n, 120);
  assert.ok(v.baselines);
  assert.equal(v.baselines.minutes.rho, 0.31);
  assert.ok(v.test.rho <= v.baselines.minutes.rho);
  assert.equal(v.beatsMinutes, false);
  assert.match(v.verdict, /לא עוקף/);
  assert.ok(v.baselines.bestComponent);
  assert.equal(v.baselines.bestComponent.id, 'clutch');
  assert.equal(v.baselines.bestComponent.rho, v.test.componentRho.clutch);
  assert.ok(v.baselines.nullBand);
  assert.equal(v.baselines.nullBand.seed, 'scoutai-demo-001');
  assert.ok(Number.isFinite(v.baselines.nullBand.p50));
  assert.ok(Number.isFinite(v.baselines.nullBand.p95));
  assert.ok(v.baselines.nullBand.p95 >= v.baselines.nullBand.p50);
  const again = validateMetric(store.players, DEFAULT_METRIC, opts);
  assert.deepEqual(again.baselines.nullBand, v.baselines.nullBand);
  assert.ok(v.baselines.defenderHint);
  assert.ok(v.baselines.defenderHint.rho < 0,
    'defender-hint metric vs assists on same fold should be negative (goal mismatch)');
  assert.match(html, /נקודות ייחוס/);
  assert.match(runtime + '\n' + uiRuntime, /ansBeats/);
  assert.match(html, /לא עוקף דקות/);
});

test('unused outcomes stay available and SAMPLE folds France to train and Brazil to test', () => {
  const store = createStore(SAMPLE);
  // א4: missing outcome column is null, not fabricated 0 (SAMPLE has no goals field).
  assert.equal(outcomeValue(store.players.find(row => row.name === 'Finisher'), 'goals'), null);
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
  const view = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, {
    selectedId: "N'Golo Kanté|France",
    weightsLocked: true
  }));
  const press = view.explorer.rows.find(row => row.key === 'pressures');
  assert.ok(press);
  const liveBeats = !!(view.validation && view.validation.beatsMinutes);
  // Binding to the selected player is intentional (א6): fixed "45" / Kanté-only
  // cap / generic bump answers no longer graduate every selectedId.
  const kanteAnswers = {
    unusedField: 'dribbles',
    per90: String(press.per90),
    cappedField: 'pressures',
    weightsManual: 'yes',
    fragilityPredict: bestHelpfulBump(selectedWeightSwing(store.players, view.spec, view.selected.id, 10)),
    splitIsSeason: 'no',
    whatMatters: 'test',
    unusedTerm: 'dribble',
    commercial: 'no',
    beatsMinutes: liveBeats ? 'yes' : 'no',
    roseComponent: 'grit',
    costGroup: 'FW'
  };
  const missingBeat = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: Object.assign({}, kanteAnswers, { beatsMinutes: '' })
  });
  assert.equal(missingBeat.find(item => item.id === 'holdout').passed, false,
    'holdout must fail until beatsMinutes matches live baselines');
  const passed = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: kanteAnswers
  });
  assert.ok(passed.every(item => item.passed), passed.filter(item => !item.passed).map(item => item.id).join(','));
  const wrongBeat = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: Object.assign({}, kanteAnswers, {
      beatsMinutes: liveBeats ? 'no' : 'yes'
    })
  });
  assert.equal(wrongBeat.find(item => item.id === 'holdout').passed, false);
  const seasonLie = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: Object.assign({}, kanteAnswers, { splitIsSeason: 'yes' })
  });
  assert.equal(seasonLie.find(item => item.id === 'holdout').passed, false);
  assert.match(html, /שיעור מלא: מאירוע למדד מאומת/);
  assert.match(html, /id="course"/);
  assert.match(html, /id="explorer"/);
  assert.match(html, /id="validate"/);
  assert.match(CURRICULUM_LESSONS.find(item => item.id === 'holdout').body, /דקות בלבד|רצועת אפס|נקודות ייחוס|פרמוטציה/);
  assert.match(CURRICULUM_LESSONS.find(item => item.id === 'holdout').body, /נעל את המשקלים/);
  assert.match(CURRICULUM_LESSONS.find(item => item.id === 'holdout').exercise, /עוקף/);
  assert.match(CURRICULUM_LESSONS.find(item => item.id === 'holdout').exercise, /נעלו משקלים/);
  assert.match(html, /נעל את המשקלים האלה/);
  assert.match(html, /id="lockWeights"/);
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

test('curriculum self-checks bind to selected player: Kanté sheet fails on Kane for per90/caps/fragility', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const kanteView = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, {
    selectedId: "N'Golo Kanté|France",
    weightsLocked: true
  }));
  const press = kanteView.explorer.rows.find(row => row.key === 'pressures');
  const kanteSheet = {
    unusedField: 'dribbles',
    per90: String(press.per90),
    cappedField: 'pressures',
    weightsManual: 'yes',
    fragilityPredict: bestHelpfulBump(selectedWeightSwing(store.players, kanteView.spec, kanteView.selected.id, 10)),
    splitIsSeason: 'no',
    whatMatters: 'test',
    unusedTerm: 'dribble',
    commercial: 'no',
    beatsMinutes: (!!(kanteView.validation && kanteView.validation.beatsMinutes) ? 'yes' : 'no'),
    roseComponent: 'grit',
    costGroup: 'FW'
  };
  const kantePass = evaluateCurriculum({
    spec: kanteView.spec,
    selected: kanteView.selected,
    explorer: kanteView.explorer,
    validation: kanteView.validation,
    exercise: kanteView.exercise,
    players: store.players,
    fragility: kanteView.fragility,
    answers: kanteSheet
  });
  assert.ok(kantePass.every(item => item.passed), 'Kanté sheet must graduate on Kanté');

  const kaneView = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, { selectedId: 'Harry Kane|England' }));
  const cross = evaluateCurriculum({
    spec: kaneView.spec,
    selected: kaneView.selected,
    explorer: kaneView.explorer,
    validation: kaneView.validation,
    exercise: kaneView.exercise,
    players: store.players,
    fragility: kaneView.fragility,
    answers: kanteSheet
  });
  assert.equal(cross.find(item => item.id === 'per90').passed, false);
  assert.equal(cross.find(item => item.id === 'caps').passed, false);
  assert.equal(cross.find(item => item.id === 'fragility').passed, false);
});

test('per90 check accepts selected-derived value and rejects stale constant when wrong', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const view = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, { selectedId: "N'Golo Kanté|France" }));
  const press = view.explorer.rows.find(row => row.key === 'pressures');
  assert.equal(press.per90, 26.52);
  assert.equal(nearNumber('26.52', press.per90, 0.05), true);
  assert.equal(nearNumber('45', press.per90, 0.05), false);

  const base = {
    unusedField: 'dribbles',
    cappedField: 'pressures',
    weightsManual: 'yes',
    fragilityPredict: bestHelpfulBump(selectedWeightSwing(store.players, view.spec, view.selected.id, 10)),
    splitIsSeason: 'no',
    whatMatters: 'test',
    unusedTerm: 'dribble',
    commercial: 'no',
    beatsMinutes: (!!(view.validation && view.validation.beatsMinutes) ? 'yes' : 'no'),
    roseComponent: 'grit',
    costGroup: 'FW'
  };
  const ok = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: Object.assign({}, base, { per90: String(press.per90) })
  });
  assert.equal(ok.find(item => item.id === 'per90').passed, true);

  const stale = evaluateCurriculum({
    spec: view.spec,
    selected: view.selected,
    explorer: view.explorer,
    validation: view.validation,
    exercise: view.exercise,
    players: store.players,
    fragility: view.fragility,
    answers: Object.assign({}, base, { per90: '45' })
  });
  assert.equal(stale.find(item => item.id === 'per90').passed, false);

  const kane = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, { selectedId: 'Harry Kane|England' }));
  const kanePress = kane.explorer.rows.find(row => row.key === 'pressures');
  const kaneOk = evaluateCurriculum({
    spec: kane.spec,
    selected: kane.selected,
    explorer: kane.explorer,
    validation: kane.validation,
    exercise: kane.exercise,
    players: store.players,
    fragility: kane.fragility,
    answers: Object.assign({}, base, {
      per90: String(kanePress.per90),
      cappedField: kane.explorer.capped[0].key,
      fragilityPredict: bestHelpfulBump(selectedWeightSwing(store.players, kane.spec, kane.selected.id, 10))
    })
  });
  assert.equal(kaneOk.find(item => item.id === 'per90').passed, true);
  assert.equal(nearNumber('45', kanePress.per90, 0.05), false);
});

test('curriculum and explorer stay Hebrew RTL and keep skip/focus semantics', () => {
  assert.match(html, /href="#course"/);
  assert.match(html, /דלגו לשיעור המלא/);
  assert.match(html, /id="outcomeSelect"/);
  assert.match(html, /id="splitSelect"/);
  assert.match(html, /aria-label="צעדי השיעור המלא"/);
  assert.doesNotMatch(html + '\n' + runtime + '\n' + uiRuntime, /https?:\/\//);
});


test('holdout lock: revealed:false exposes n but rho null; attempts unique; CI/p deterministic', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const opts = { outcomeId: 'assists', splitId: 'groups', seed: 'scoutai-demo-001' };
  const hidden = validateMetric(store.players, DEFAULT_METRIC, Object.assign({}, opts, { revealed: false }));
  assert.equal(hidden.test.n, 120);
  assert.equal(hidden.test.rho, null);
  assert.equal(hidden.revealed, false);
  assert.equal(hidden.baselines.rhoCi, null);

  const first = validateMetric(store.players, DEFAULT_METRIC, opts);
  const second = validateMetric(store.players, DEFAULT_METRIC, opts);
  assert.deepEqual(first.baselines.rhoCi, second.baselines.rhoCi);
  assert.ok(first.baselines.rhoCi.lo <= 0.30 && first.baselines.rhoCi.hi >= 0.30);
  assert.equal(first.test.rho, 0.3);
  assert.ok(first.baselines.permutationP < 0.01);
  assert.equal(first.baselines.permutationP, second.baselines.permutationP);
  const band = first.baselines.signedNullBand;
  assert.ok(band.lo < 0 && band.hi > 0, 'signed null band surrounds 0');

  const a = store.derive(Object.assign({}, DEFAULT_METRIC));
  assert.equal(a.validation.revealed, false);
  assert.equal(a.validation.test.rho, null);
  assert.equal(a.validation.lock.attempts, 1);
  const b = store.derive(Object.assign({}, DEFAULT_METRIC, { grit: 55, involvement: 25, clutch: 20 }));
  assert.equal(b.validation.lock.attempts, 2);
  const c = store.derive(Object.assign({}, DEFAULT_METRIC));
  assert.equal(c.validation.lock.attempts, 2, 'same normalized triple does not increment');
  const locked = store.derive(Object.assign({}, DEFAULT_METRIC, { weightsLocked: true }));
  assert.equal(locked.validation.revealed, true);
  assert.equal(locked.validation.test.rho, 0.3);
  assert.equal(locked.validation.lock.attempts, 2);
  assert.match(locked.validation.verdict, /CI|בוטסטרפ/);
  assert.match(locked.validation.verdict, /פרמוטציה|p=/);

  const hash = serializeMetricHash(locked.spec);
  assert.match(hash, /lock=1/);
  assert.match(hash, /att=2/);
  const parsed = parseMetricHash(hash);
  assert.equal(parsed.weightsLocked, true);
  assert.equal(parsed.weightAttempts, 2);
});

test('holdout lock curriculum requires weightsLocked before beats-minutes passes', () => {
  const wc = require('../data/wc2018_event_aggregates.json');
  const store = createStore(wc);
  const unlocked = store.derive(Object.assign({}, DEFENDER_EXERCISE.hint, {
    selectedId: "N'Golo Kanté|France"
  }));
  const sheet = evaluateCurriculum({
    spec: unlocked.spec,
    selected: unlocked.selected,
    explorer: unlocked.explorer,
    validation: unlocked.validation,
    exercise: unlocked.exercise,
    players: store.players,
    fragility: unlocked.fragility,
    answers: {
      unusedField: 'dribbles',
      per90: '1',
      cappedField: 'pressures',
      weightsManual: 'yes',
      fragilityPredict: 'grit',
      splitIsSeason: 'no',
      whatMatters: 'test',
      unusedTerm: 'dribble',
      commercial: 'no',
      beatsMinutes: 'no'
    }
  });
  assert.equal(sheet.find(item => item.id === 'holdout').passed, false);
  assert.equal(
    sheet.find(item => item.id === 'holdout').checks.find(c => c.id === 'weights-locked').pass,
    false
  );
});
