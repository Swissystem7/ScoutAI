(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIDemo = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hashSeed(seed) {
    const text = String(seed || 'scoutai-demo-001');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createDemoFixture(seed) {
    const hash = hashSeed(seed);
    const value = (offset, span) => offset + (hash % span);
    return {
      seed: String(seed || 'scoutai-demo-001'),
      video: { provenance: 'LOCAL_VIDEO', analyzed: false, uploaded: false },
      service: { provenance: 'VERIFIED_ANALYSIS_SERVICE', available: false },
      metrics: [
        { id: 'pace-demo', label: 'קצב המחשה', value: value(61, 25), unit: '/100', provenance: 'DEMO_METRIC', measured: false },
        { id: 'control-demo', label: 'שליטה להמחשה', value: value(55, 31), unit: '/100', provenance: 'DEMO_METRIC', measured: false },
        { id: 'work-demo', label: 'עבודה להמחשה', value: value(58, 28), unit: '/100', provenance: 'DEMO_METRIC', measured: false }
      ],
      timeline: [
        { at: '00:12', label: 'אירוע fixture א', provenance: 'DEMO_METRIC' },
        { at: `00:${30 + (hash % 20)}`, label: 'אירוע fixture ב', provenance: 'DEMO_METRIC' },
        { at: `01:${10 + (hash % 30)}`, label: 'אירוע fixture ג', provenance: 'DEMO_METRIC' }
      ]
    };
  }

  function flattenCalibrated(data) {
    if (Array.isArray(data)) return data.slice();
    const men = data && Array.isArray(data.men) ? data.men : [];
    const women = data && Array.isArray(data.women) ? data.women : [];
    return men.concat(women);
  }

  function attachBreakdowns(rows, top30) {
    const extras = Array.isArray(top30) ? top30 : [];
    const byId = new Map(extras.map(function (item) {
      return [String(item.id), item];
    }));
    return rows.map(function (row) {
      const extra = byId.get(String(row.id));
      return {
        id: row.id,
        name: row.name,
        team: row.team,
        comp: row.comp,
        category: row.category,
        minutes: row.minutes,
        index: row.index,
        rank: row.rank,
        breakdown: row.breakdown || (extra && extra.breakdown) || null,
        explanation: row.explanation || (extra && extra.explanation) || null,
        provenance: 'STATSBOMB_OPEN_DATA'
      };
    });
  }

  const WORLD_CUP_MAX_MINUTES = 480;
  const SEASON_MISLABELED = 'season data, mislabeled';

  function isWorldCupLabel(comp) {
    return /world\s*cup/i.test(String(comp || ''));
  }

  function minutesImpossibleForCompetition(row) {
    const minutes = Number(row && row.minutes);
    if (!Number.isFinite(minutes)) return false;
    return isWorldCupLabel(row.comp) && minutes > WORLD_CUP_MAX_MINUTES;
  }

  function flagImpossibleMinutes(rows) {
    return rows.map(function (row) {
      if (!minutesImpossibleForCompetition(row)) return row;
      return Object.assign({}, row, {
        labeledComp: row.comp,
        comp: SEASON_MISLABELED,
        hygiene: SEASON_MISLABELED
      });
    });
  }

  function rankPlayers(rows) {
    return rows
      .slice()
      .filter(function (row) { return row && row.name; })
      .sort(function (a, b) {
        const scoreDelta = Number(b.index) - Number(a.index);
        if (scoreDelta !== 0) return scoreDelta;
        return String(a.name).localeCompare(String(b.name));
      })
      .map(function (row, i) {
        return Object.assign({}, row, { rank: i + 1, provenance: 'STATSBOMB_OPEN_DATA' });
      });
  }

  function preparePocRows(calibrated, top30) {
    return flagImpossibleMinutes(rankPlayers(attachBreakdowns(flattenCalibrated(calibrated), top30)));
  }

  function formatBreakdown(breakdown) {
    if (!breakdown || typeof breakdown !== 'object') return '';
    const parts = [];
    Object.keys(breakdown).forEach(function (key) {
      const item = breakdown[key];
      if (!item || typeof item !== 'object' || item.value == null) return;
      const weight = item.weight != null ? ' ×' + item.weight : '';
      parts.push(key + ' ' + item.value + weight);
    });
    return parts.join(' · ');
  }

  const DEFAULT_METRIC = Object.freeze({
    grit: 40,
    involvement: 30,
    clutch: 30,
    minMinutes: 270,
    normalizePosition: false,
    selectedId: '',
    compareId: ''
  });

  function clamp(value, lo, hi) {
    const n = Number(value);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function round1(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function playerKey(row) {
    if (row && row.id != null && String(row.id)) return String(row.id);
    return String(row && row.name || '') + '|' + String(row && row.team || '');
  }

  function positionGroup(position) {
    const text = String(position || '');
    if (/goalkeeper/i.test(text)) return 'GK';
    if (/midfield/i.test(text)) return 'MF';
    if (/back|defen/i.test(text)) return 'DF';
    if (/forward|wing|striker/i.test(text)) return 'FW';
    return 'OT';
  }

  function per90(value, minutes) {
    const mins = Number(minutes) || 0;
    if (mins <= 0) return 0;
    return (Number(value) || 0) * 90 / mins;
  }

  function scaleCap(value, cap) {
    if (!cap) return 0;
    return clamp((Number(value) || 0) / cap * 100, 0, 100);
  }

  function rawPer90(player, totalKey, per90Key) {
    const minutes = player.totalMinutesProxy || player.minutes || 0;
    if (player.per90 && Number.isFinite(Number(player.per90[per90Key]))) {
      return Number(player.per90[per90Key]);
    }
    return per90(player[totalKey], minutes);
  }

  function componentsFromEvents(player) {
    const press = rawPer90(player, 'pressures', 'pressuresPer90');
    const tackles = rawPer90(player, 'tackles', 'tacklesPer90');
    const intercepts = rawPer90(player, 'interceptions', 'interceptionsPer90');
    const defense = rawPer90(player, 'defensiveActions', 'defensiveActionsPer90');
    const grit = round1(scaleCap(press, 18) * 0.45 + scaleCap(tackles + intercepts, 6) * 0.3 + scaleCap(defense, 14) * 0.25);

    const prog = rawPer90(player, 'progressiveActions', 'progressiveActionsPer90');
    const keyPasses = rawPer90(player, 'keyPasses', 'keyPassesPer90');
    const passes = rawPer90(player, 'passesCompleted', 'passesCompletedPer90');
    const involvement = round1(scaleCap(prog, 22) * 0.5 + scaleCap(keyPasses, 4) * 0.3 + scaleCap(passes, 80) * 0.2);

    const xg = rawPer90(player, 'shotXgSum', 'shotXgSumPer90');
    const box = rawPer90(player, 'boxTouches', 'boxTouchesPer90');
    const onTarget = rawPer90(player, 'shotsOnTarget', 'shotsOnTargetPer90');
    const clutch = round1(scaleCap(xg, 0.6) * 0.4 + scaleCap(box, 8) * 0.35 + scaleCap(onTarget, 2) * 0.25);

    return {
      grit: grit,
      involvement: involvement,
      clutch: clutch,
      raw: {
        pressures90: round2(press),
        tacklesInt90: round2(tackles + intercepts),
        defensive90: round2(defense),
        progressive90: round2(prog),
        keyPasses90: round2(keyPasses),
        passes90: round2(passes),
        xg90: round2(xg),
        boxTouches90: round2(box),
        shotsOnTarget90: round2(onTarget)
      }
    };
  }

  function percentile(value, peers) {
    if (!peers.length) return 50;
    let below = 0;
    for (let i = 0; i < peers.length; i += 1) {
      if (peers[i] <= value) below += 1;
    }
    return round1(below / peers.length * 100);
  }

  function normalizeByPosition(rows) {
    const groups = {};
    rows.forEach(function (row) {
      const key = row.positionGroup || 'OT';
      if (!groups[key]) groups[key] = { grit: [], involvement: [], clutch: [] };
      groups[key].grit.push(row.components.grit);
      groups[key].involvement.push(row.components.involvement);
      groups[key].clutch.push(row.components.clutch);
    });
    return rows.map(function (row) {
      const peers = groups[row.positionGroup || 'OT'];
      return Object.assign({}, row, {
        components: {
          grit: percentile(row.components.grit, peers.grit),
          involvement: percentile(row.components.involvement, peers.involvement),
          clutch: percentile(row.components.clutch, peers.clutch),
          raw: row.components.raw,
          normalized: true
        }
      });
    });
  }

  function normalizeMetricSpec(spec) {
    const src = spec || {};
    return {
      grit: clamp(src.grit, 0, 100),
      involvement: clamp(src.involvement, 0, 100),
      clutch: clamp(src.clutch, 0, 100),
      minMinutes: clamp(src.minMinutes, 0, 900),
      normalizePosition: !!src.normalizePosition,
      selectedId: src.selectedId ? String(src.selectedId) : '',
      compareId: src.compareId ? String(src.compareId) : ''
    };
  }

  function compositeScore(components, spec) {
    const weights = normalizeMetricSpec(spec);
    const total = weights.grit + weights.involvement + weights.clutch;
    if (!total) return 0;
    return round2(
      (components.grit * weights.grit +
        components.involvement * weights.involvement +
        components.clutch * weights.clutch) / total
    );
  }

  const LAB_PATHS = Object.freeze({
    events: 'data/wc2018_event_aggregates.json',
    calibrated: 'poc-calibrated.json',
    top30: 'poc-top30.json'
  });

  function eventPlayers(dataset) {
    if (Array.isArray(dataset)) return dataset;
    if (dataset && Array.isArray(dataset.players)) return dataset.players;
    return [];
  }

  function preparePlayer(row) {
    return {
      id: playerKey(row),
      name: row.name,
      team: row.team,
      comp: row.comp || row.competition || 'WorldCup2018',
      category: row.category,
      position: row.position || '',
      positionGroup: positionGroup(row.position),
      minutes: row.totalMinutesProxy || row.minutes || 0,
      matchesPlayed: row.matchesPlayed,
      components: componentsFromEvents(row),
      provenance: 'STATSBOMB_OPEN_DATA'
    };
  }

  function scorePrepared(prepared, spec) {
    const metric = normalizeMetricSpec(spec);
    const eligible = prepared.filter(function (row) {
      return row && row.name && row.minutes >= metric.minMinutes;
    });
    const adjusted = metric.normalizePosition ? normalizeByPosition(eligible) : eligible;
    return adjusted
      .map(function (row) {
        const score = compositeScore(row.components, metric);
        return Object.assign({}, row, { score: score, index: score });
      })
      .sort(function (a, b) {
        const delta = b.score - a.score;
        if (delta !== 0) return delta;
        return String(a.name).localeCompare(String(b.name));
      })
      .map(function (row, i) {
        return Object.assign({}, row, { rank: i + 1 });
      });
  }

  function attachDeltas(current, baseline) {
    const byId = {};
    (baseline || []).forEach(function (row) { byId[row.id] = row; });
    return current.map(function (row) {
      const prev = byId[row.id];
      return Object.assign({}, row, {
        baselineScore: prev ? prev.score : null,
        baselineRank: prev ? prev.rank : null,
        deltaScore: prev ? round2(row.score - prev.score) : null,
        deltaRank: prev ? prev.rank - row.rank : null
      });
    });
  }

  function lessonContributions(row, spec) {
    if (!row || !row.components) return [];
    const metric = normalizeMetricSpec(spec);
    const total = metric.grit + metric.involvement + metric.clutch || 1;
    return [
      { key: 'grit', label: 'Grit', value: row.components.grit, weight: metric.grit, share: round2(row.components.grit * metric.grit / total) },
      { key: 'involvement', label: 'Involvement', value: row.components.involvement, weight: metric.involvement, share: round2(row.components.involvement * metric.involvement / total) },
      { key: 'clutch', label: 'Clutch', value: row.components.clutch, weight: metric.clutch, share: round2(row.components.clutch * metric.clutch / total) }
    ];
  }

  function lessonMapping(row) {
    const raw = row && row.components && row.components.raw || {};
    return [
      { factor: 'לחיצות /90', value: raw.pressures90, feeds: 'Grit' },
      { factor: 'תיקולים+חטיפות /90', value: raw.tacklesInt90, feeds: 'Grit' },
      { factor: 'פעולות הגנה /90', value: raw.defensive90, feeds: 'Grit' },
      { factor: 'התקדמות /90', value: raw.progressive90, feeds: 'Involvement' },
      { factor: 'מסירות מפתח /90', value: raw.keyPasses90, feeds: 'Involvement' },
      { factor: 'מסירות /90', value: raw.passes90, feeds: 'Involvement' },
      { factor: 'xG /90', value: raw.xg90, feeds: 'Clutch' },
      { factor: 'נגיעות ברחבה /90', value: raw.boxTouches90, feeds: 'Clutch' },
      { factor: 'בעיטות למסגרת /90', value: raw.shotsOnTarget90, feeds: 'Clutch' }
    ];
  }

  function fragilityFromPrepared(prepared, spec, delta) {
    const step = delta == null ? 10 : delta;
    const baseRows = scorePrepared(prepared, spec);
    const byId = {};
    baseRows.forEach(function (row) { byId[row.id] = row; });
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    return ['grit', 'involvement', 'clutch'].map(function (key) {
      const ranked = scorePrepared(prepared, bumpSpec(spec, key, step));
      const swings = ranked
        .map(function (row) {
          const prev = byId[row.id];
          return {
            id: row.id,
            name: row.name,
            team: row.team,
            from: prev ? prev.rank : null,
            to: row.rank,
            deltaRank: prev ? prev.rank - row.rank : 0
          };
        })
        .filter(function (row) { return row.deltaRank; })
        .sort(function (a, b) { return Math.abs(b.deltaRank) - Math.abs(a.deltaRank); })
        .slice(0, 5);
      return { key: key, label: labels[key] + ' +' + step, swings: swings };
    });
  }

  function createStore(rawPlayers) {
    const players = eventPlayers(rawPlayers).map(preparePlayer);
    function derive(spec, baselineSpec) {
      const metric = normalizeMetricSpec(spec);
      let rows = scorePrepared(players, metric);
      if (baselineSpec) rows = attachDeltas(rows, scorePrepared(players, baselineSpec));
      const selected = rows.find(function (row) { return row.id === metric.selectedId; }) || rows[0] || null;
      if (selected && !metric.selectedId) metric.selectedId = selected.id;
      const compared = findPrepared(rows, players, metric.compareId);
      const fragility = fragilityFromPrepared(players, metric, 10);
      return {
        spec: metric,
        rows: rows,
        selected: selected,
        compared: compared,
        lesson: buildLesson(selected, metric),
        contributions: lessonContributions(selected, metric),
        mapping: lessonMapping(selected),
        fragility: fragility,
        formula: formatFormula(metric),
        exercise: evaluateExercise(players, metric),
        radar: buildCompareRadar(selected, compared),
        glossary: EVENT_GLOSSARY,
        exportBundle: exportMetricBundle(metric, selected, { compared: compared })
      };
    }
    return { players: players, derive: derive };
  }

  function applyMetric(dataset, spec, baselineSpec) {
    return createStore(dataset).derive(spec, baselineSpec || null).rows;
  }

  function readJson(fetchImpl, path) {
    return fetchImpl(path).then(function (response) {
      if (!response.ok) throw new Error('failed to load ' + path);
      return response.json();
    });
  }

  function loadLabSources(fetchImpl) {
    const load = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!load) return Promise.reject(new Error('fetch is not available'));
    return Promise.all([
      readJson(load, LAB_PATHS.events),
      readJson(load, LAB_PATHS.calibrated).catch(function () { return null; }),
      readJson(load, LAB_PATHS.top30).catch(function () { return null; })
    ]).then(function (files) {
      return {
        store: createStore(files[0]),
        pocRows: files[1] ? preparePocRows(files[1], files[2]) : []
      };
    });
  }

  function serializeMetricHash(spec) {
    const metric = normalizeMetricSpec(spec);
    const parts = [
      'g=' + Math.round(metric.grit),
      'i=' + Math.round(metric.involvement),
      'c=' + Math.round(metric.clutch),
      'min=' + Math.round(metric.minMinutes),
      'npos=' + (metric.normalizePosition ? '1' : '0')
    ];
    if (metric.selectedId) parts.push('sel=' + encodeURIComponent(metric.selectedId));
    if (metric.compareId) parts.push('cmp=' + encodeURIComponent(metric.compareId));
    return parts.join('&');
  }

  function parseMetricHash(hash) {
    const text = String(hash || '').replace(/^#/, '');
    if (!text) return normalizeMetricSpec(DEFAULT_METRIC);
    const params = {};
    text.split('&').forEach(function (pair) {
      const parts = pair.split('=');
      if (parts.length < 2) return;
      params[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('='));
    });
    return normalizeMetricSpec({
      grit: params.g,
      involvement: params.i,
      clutch: params.c,
      minMinutes: params.min,
      normalizePosition: params.npos === '1' || params.npos === 'true',
      selectedId: params.sel || '',
      compareId: params.cmp || ''
    });
  }

  function formatFormula(spec) {
    const metric = normalizeMetricSpec(spec);
    const total = metric.grit + metric.involvement + metric.clutch;
    return 'ציון = (' + metric.grit + '×Grit + ' + metric.involvement + '×Involvement + ' +
      metric.clutch + '×Clutch) / ' + (total || 1);
  }

  const COMPONENT_RECIPE = Object.freeze({
    grit: Object.freeze([
      { key: 'pressures90', label: 'לחיצות /90', cap: 18, weight: 0.45 },
      { key: 'tacklesInt90', label: 'תיקולים+חטיפות /90', cap: 6, weight: 0.3 },
      { key: 'defensive90', label: 'פעולות הגנה /90', cap: 14, weight: 0.25 }
    ]),
    involvement: Object.freeze([
      { key: 'progressive90', label: 'התקדמות /90', cap: 22, weight: 0.5 },
      { key: 'keyPasses90', label: 'מסירות מפתח /90', cap: 4, weight: 0.3 },
      { key: 'passes90', label: 'מסירות /90', cap: 80, weight: 0.2 }
    ]),
    clutch: Object.freeze([
      { key: 'xg90', label: 'xG /90', cap: 0.6, weight: 0.4 },
      { key: 'boxTouches90', label: 'נגיעות ברחבה /90', cap: 8, weight: 0.35 },
      { key: 'shotsOnTarget90', label: 'בעיטות למסגרת /90', cap: 2, weight: 0.25 }
    ])
  });

  const RADAR_AXES = Object.freeze(
    COMPONENT_RECIPE.grit
      .concat(COMPONENT_RECIPE.involvement, COMPONENT_RECIPE.clutch)
      .map(function (axis, index) {
        const feeds = index < 3 ? 'Grit' : index < 6 ? 'Involvement' : 'Clutch';
        return Object.freeze({
          key: axis.key,
          label: axis.label,
          cap: axis.cap,
          weight: axis.weight,
          feeds: feeds
        });
      })
  );

  const EVENT_GLOSSARY = Object.freeze([
    {
      type: 'Pressure',
      he: 'לחיצה',
      feeds: 'Grit',
      usedInScore: true,
      body: 'אירוע Pressure ב-StatsBomb: שחקן סוגר על מחזיק הכדור. נספר ללחיצות, ואז ל-90 דקות, ואז ל-Grit.'
    },
    {
      type: 'Duel / Tackle',
      he: 'דו-קרב / תיקול',
      feeds: 'Grit',
      usedInScore: true,
      body: 'Duel מסוג Tackle שהסתיים ב-Won/Success. נספר לתיקולים ולפעולות הגנה. תיקול שנכשל אינו נכנס.'
    },
    {
      type: 'Interception',
      he: 'חטיפה',
      feeds: 'Grit',
      usedInScore: true,
      body: 'אירוע Interception: ניתוק מסירה. נספר לחטיפות ולפעולות הגנה.'
    },
    {
      type: 'Ball Recovery',
      he: 'שחזור כדור',
      feeds: 'Grit',
      usedInScore: true,
      body: 'Ball Recovery נספר לפעולות הגנה בלבד, בלי תיקול או חטיפה נפרדים.'
    },
    {
      type: 'Block',
      he: 'חסימה',
      feeds: 'Grit',
      usedInScore: true,
      body: 'Block נספר לפעולות הגנה. אין רכיב Block נפרד בנוסחה — הוא חלק מהתקרה של defensiveActions.'
    },
    {
      type: 'Pass',
      he: 'מסירה',
      feeds: 'Involvement',
      usedInScore: true,
      body: 'Pass בלי outcome נספר כהושלמה. shot_assist או goal_assist נספרים כמסירת מפתח. מסירה שמתקדמת במגרש נספרת גם כהתקדמות.'
    },
    {
      type: 'Carry',
      he: 'הובלת כדור',
      feeds: 'Involvement',
      usedInScore: true,
      body: 'Carry שמתקדם במגרש נספר ל-progressiveActions יחד עם מסירות מתקדמות. אין הפרדה בין מסירה להובלה ברכיב.'
    },
    {
      type: 'Shot + statsbomb_xg',
      he: 'בעיטה ו-xG',
      feeds: 'Clutch',
      usedInScore: true,
      body: 'Shot תורם את statsbomb_xg לסכום ה-xG. Outcome Saved או Goal נספר כבעיטה למסגרת. התווית Clutch היא לימודית — זה לא מודל רגעים מכריעים.'
    },
    {
      type: 'location (penalty box)',
      he: 'מיקום ברחבה',
      feeds: 'Clutch',
      usedInScore: true,
      body: 'כל אירוע שנרשם בתוך רחבת ה-16 נספר כנגיעה ברחבה. זה קירוב גס, לא נגיעת כדור מאומתת.'
    },
    {
      type: 'Starting XI / Substitution',
      he: 'הרכב וחילוף',
      feeds: 'סף דקות',
      usedInScore: false,
      body: 'הדקות הן פרוקסי מקומי מאירועי הרכב וחילוף, לא שעון רשמי של פיפ״א. לכן יש סף דקות — מדגם קטן משקר.'
    },
    {
      type: 'Dribble / Goal / Assist',
      he: 'כדרור, שער, בישול',
      feeds: 'לא בנוסחה',
      usedInScore: false,
      body: 'הספירות האלה קיימות בקובץ המצטבר (dribbles, goals, assists, duelsWon, bigChanceProxy) אבל אינן נכנסות ל-Grit/Involvement/Clutch. שקיפות: מה שנאסף לא בהכרח מה שמחושב.'
    }
  ]);

  const DEFENDER_EXERCISE = Object.freeze({
    id: 'defenders-sensible',
    title: 'תרגיל מודרך: מדד שמדרג בלמים באופן הגיוני',
    prompt: 'מדד ברירת המחדל 40/30/30 מעדיף חלוצים, כי Clutch נבנה מ-xG, נגיעות ברחבה ובעיטות למסגרת. בנו מדד שבו בלמים (בלם/מגן, לא קשר הגנתי) עולים בלי להעמיד פנים שזה מודל מדעי.',
    hint: Object.freeze({
      grit: 70,
      involvement: 20,
      clutch: 10,
      minMinutes: 270,
      normalizePosition: true
    })
  });

  function medianRank(rows, group) {
    const ranks = rows
      .filter(function (row) { return row.positionGroup === group; })
      .map(function (row) { return row.rank; })
      .sort(function (a, b) { return a - b; });
    if (!ranks.length) return null;
    return ranks[Math.floor((ranks.length - 1) / 2)];
  }

  function countGroup(rows, group) {
    return rows.filter(function (row) { return row.positionGroup === group; }).length;
  }

  function asPrepared(input) {
    if (Array.isArray(input)) return input;
    return createStore(input).players;
  }

  function evaluateExercise(prepared, spec) {
    const players = asPrepared(prepared);
    const metric = normalizeMetricSpec(spec);
    const current = scorePrepared(players, metric);
    const baseline = scorePrepared(players, DEFAULT_METRIC);
    const windowSize = Math.min(12, current.length);
    const nowTop = current.slice(0, windowSize);
    const baseTop = baseline.slice(0, windowSize);
    const dfNow = countGroup(nowTop, 'DF');
    const dfBase = countGroup(baseTop, 'DF');
    const fwNow = countGroup(nowTop, 'FW');
    const medianDf = medianRank(current, 'DF');
    const medianFw = medianRank(current, 'FW');
    const checks = [
      {
        id: 'minutes',
        label: 'סף דקות לפחות 270 — כדי לא לדרג מחליף של משחק אחד',
        pass: metric.minMinutes >= 270,
        detail: 'סף נוכחי: ' + metric.minMinutes + ' דקות.'
      },
      {
        id: 'grit-over-clutch',
        label: 'Grit גבוה מ-Clutch — בלם לא נמדד בעיקר ב-xG',
        pass: metric.grit > metric.clutch,
        detail: 'Grit ' + metric.grit + ' מול Clutch ' + metric.clutch + '.'
      },
      {
        id: 'defenders-surface',
        label: 'יותר בלמים ב-12 הראשונים מאשר במדד הבסיס 40/30/30',
        pass: dfNow > dfBase,
        detail: 'עכשיו ' + dfNow + ' בלמים בחלון, בבסיס היו ' + dfBase + '.'
      },
      {
        id: 'fair-comparison',
        label: 'נרמול עמדה או משקל מאמץ דומיננטי (Grit ≥ 60)',
        pass: metric.normalizePosition || metric.grit >= 60,
        detail: metric.normalizePosition
          ? 'נרמול עמדה דולק: בלם מושווה לבלמים, לא לחלוץ.'
          : 'בלי נרמול צריך Grit גבוה, אחרת xG של חלוצים שולט.'
      },
      {
        id: 'not-just-attackers',
        label: 'בחלון העליון יש לפחות אותו מספר בלמים כמו חלוצים',
        pass: windowSize === 0 || dfNow >= fwNow,
        detail: 'בלמים ' + dfNow + ' · חלוצים ' + fwNow +
          (medianDf != null && medianFw != null ? ' · חציון דירוג DF #' + medianDf + ' / FW #' + medianFw : '') + '.'
      }
    ];
    const passed = checks.every(function (item) { return item.pass; });
    return {
      id: DEFENDER_EXERCISE.id,
      title: DEFENDER_EXERCISE.title,
      prompt: DEFENDER_EXERCISE.prompt,
      hint: DEFENDER_EXERCISE.hint,
      checks: checks,
      passed: passed,
      windowSize: windowSize,
      dfNow: dfNow,
      dfBase: dfBase,
      fwNow: fwNow,
      medianDf: medianDf,
      medianFw: medianFw,
      summary: passed
        ? 'עברתם את הבדיקה העצמית. זה עדיין מדד ידני — לא הוכחה שמצאתם בלם טוב.'
        : 'עוד לא. המדד עדיין מתנהג כמו מדד חלוצים, או שהמדגם קטן מדי.'
    };
  }

  function radarValues(row) {
    const raw = row && row.components && row.components.raw || {};
    return RADAR_AXES.map(function (axis) {
      const value = Number(raw[axis.key]);
      return {
        key: axis.key,
        label: axis.label,
        feeds: axis.feeds,
        cap: axis.cap,
        raw: Number.isFinite(value) ? value : 0,
        scaled: round1(scaleCap(Number.isFinite(value) ? value : 0, axis.cap))
      };
    });
  }

  function polarPoint(index, total, value, cx, cy, radius) {
    const angle = -Math.PI / 2 + (2 * Math.PI * index / total);
    const r = radius * clamp(value, 0, 100) / 100;
    return {
      x: round2(cx + Math.cos(angle) * r),
      y: round2(cy + Math.sin(angle) * r)
    };
  }

  function radarPolygon(values, cx, cy, radius) {
    return values.map(function (item, index) {
      return polarPoint(index, values.length, item.scaled, cx, cy, radius);
    });
  }

  function pointsToAttr(points) {
    return points.map(function (point) { return point.x + ',' + point.y; }).join(' ');
  }

  function findPrepared(rows, prepared, id) {
    if (!id) return null;
    return (rows || []).find(function (row) { return row.id === id; }) ||
      (prepared || []).find(function (row) { return row.id === id; }) ||
      null;
  }

  function buildCompareRadar(rowA, rowB, options) {
    const cx = options && options.cx != null ? options.cx : 160;
    const cy = options && options.cy != null ? options.cy : 160;
    const radius = options && options.radius != null ? options.radius : 110;
    const aValues = radarValues(rowA);
    const bValues = rowB ? radarValues(rowB) : null;
    const axisGuide = aValues.map(function (item, index) {
      const tip = polarPoint(index, aValues.length, 100, cx, cy, radius);
      const labelAt = polarPoint(index, aValues.length, 118, cx, cy, radius);
      return {
        key: item.key,
        label: item.label,
        feeds: item.feeds,
        x: tip.x,
        y: tip.y,
        labelX: labelAt.x,
        labelY: labelAt.y
      };
    });
    return {
      cx: cx,
      cy: cy,
      radius: radius,
      axes: axisGuide,
      a: rowA ? {
        id: rowA.id,
        name: rowA.name,
        team: rowA.team,
        positionGroup: rowA.positionGroup,
        values: aValues,
        points: pointsToAttr(radarPolygon(aValues, cx, cy, radius))
      } : null,
      b: rowB ? {
        id: rowB.id,
        name: rowB.name,
        team: rowB.team,
        positionGroup: rowB.positionGroup,
        values: bValues,
        points: pointsToAttr(radarPolygon(bValues, cx, cy, radius))
      } : null
    };
  }

  function methodologyParagraph(spec, selected) {
    const metric = normalizeMetricSpec(spec);
    const playerBit = selected
      ? ' דוגמת השחקן בשיעור: ' + selected.name + ' (' + (selected.team || '') + '), ציון ' +
        selected.score + ', דירוג #' + selected.rank + '.'
      : '';
    return 'המדד חושב במעבדת ScoutAI ככלי לימוד לאנליסט מתחיל, לא כהמלצת סקאוטינג, לא כחוות דעת רפואית או חוזית, ולא כמוצר למכירה. ' +
      'המקור הוא קובץ ספירות מקומי שנבנה מ-StatsBomb Open Data למונדיאל 2018 (תחרות 43, עונה 3). ' +
      'הרישיון מתיר מחקר ושיתוף ציבורי עם קרדיט, ואוסר שימוש מסחרי בנתונים ובכל ניתוח שנגזר מהם. ' +
      formatFormula(metric) +
      '. Grit = 0.45×לחיצות + 0.30×(תיקולים+חטיפות) + 0.25×פעולות הגנה, אחרי נרמול לתקרות קבועות ל-90 דקות. ' +
      'Involvement = 0.50×התקדמות + 0.30×מסירות מפתח + 0.20×מסירות שהושלמו. ' +
      'Clutch = 0.40×xG + 0.35×נגיעות ברחבה + 0.25×בעיטות למסגרת — התווית לימודית, לא מודל רגעים מכריעים. ' +
      'סף הדקות הוא ' + metric.minMinutes +
      (metric.normalizePosition ? '; הרכיבים הם אחוזון בתוך קבוצת עמדה.' : '; בלי נרמול עמדה.') +
      ' המשקלות ידניות ושרירותיות, בלי כיול מדעי.' + playerBit;
  }

  function exportMetricBundle(spec, selected, extras) {
    const metric = normalizeMetricSpec(spec);
    const extra = extras || {};
    return {
      tool: 'ScoutAI',
      purpose: 'educational metric lab',
      commercial: false,
      provenance: 'STATSBOMB_OPEN_DATA',
      source: {
        dataset: 'data/wc2018_event_aggregates.json',
        competition: 'FIFA World Cup 2018',
        competitionId: 43,
        seasonId: 3,
        license: 'StatsBomb Open Data — research and public sharing with credit; commercial use prohibited'
      },
      metric: {
        grit: metric.grit,
        involvement: metric.involvement,
        clutch: metric.clutch,
        minMinutes: metric.minMinutes,
        normalizePosition: metric.normalizePosition
      },
      formula: formatFormula(metric),
      recipe: COMPONENT_RECIPE,
      selected: selected ? {
        id: selected.id,
        name: selected.name,
        team: selected.team,
        position: selected.position,
        positionGroup: selected.positionGroup,
        minutes: selected.minutes,
        rank: selected.rank,
        score: selected.score,
        components: selected.components
      } : null,
      compared: extra.compared ? {
        id: extra.compared.id,
        name: extra.compared.name,
        team: extra.compared.team,
        positionGroup: extra.compared.positionGroup,
        components: extra.compared.components
      } : null,
      methodologyHe: methodologyParagraph(metric, selected),
      citationEn: 'ScoutAI educational metric lab on StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). Non-commercial research/education only. Weights are manual and uncalibrated; not a scouting recommendation.',
      generatedLocally: true
    };
  }

  function buildLesson(row, spec) {
    const metric = normalizeMetricSpec(spec);
    if (!row) {
      return [{
        title: 'בחרו שחקן',
        body: 'לחצו על שורה בטבלה כדי לראות איך הציון שלו מורכב ממספרים גולמיים.'
      }];
    }
    const raw = row.components && row.components.raw || {};
    const total = metric.grit + metric.involvement + metric.clutch || 1;
    const gritPart = round2(row.components.grit * metric.grit / total);
    const invPart = round2(row.components.involvement * metric.involvement / total);
    const clutchPart = round2(row.components.clutch * metric.clutch / total);
    const scaleNote = row.components.normalized
      ? 'אחרי נרמול עמדה כל רכיב הוא אחוזון 0–100 בתוך קבוצת העמדה ' + row.positionGroup + '.'
      : 'בלי נרמול עמדה הרכיבים הם סקייל 0–100 מול תקרות קבועות (לא כיול מדעי).';
    return [
      {
        title: '1. מי השחקן ומה המקור',
        body: row.name + ' · ' + (row.team || '') + ' · ' + (row.position || 'בלי עמדה') +
          ' · ' + row.minutes + ' דקות. מקור: STATSBOMB_OPEN_DATA, מונדיאל 2018. זה שיעור לימודי, לא סקאוטינג מקצועי ולא מוצר מסחרי.'
      },
      {
        title: '2. מספרים גולמיים ל-90 דקות',
        body: 'לחיצות ' + raw.pressures90 + '/90, תיקולים+חטיפות ' + raw.tacklesInt90 +
          '/90, פעולות הגנה ' + raw.defensive90 + '/90, התקדמות ' + raw.progressive90 +
          '/90, מסירות מפתח ' + raw.keyPasses90 + '/90, מסירות ' + raw.passes90 +
          '/90, xG ' + raw.xg90 + '/90, נגיעות ברחבה ' + raw.boxTouches90 +
          '/90, בעיטות למסגרת ' + raw.shotsOnTarget90 + '/90.'
      },
      {
        title: '3. תרגום לשלושה רכיבים',
        body: 'Grit נבנה מלחיצות/תיקולים/הגנה → ' + row.components.grit +
          '. Involvement מפעולות התקדמות ומסירות מפתח → ' + row.components.involvement +
          '. Clutch מ-xG, נגיעות ברחבה ובעיטות למסגרת → ' + row.components.clutch +
          '. ' + scaleNote
      },
      {
        title: '4. כפל במשקלות שבחרתם',
        body: formatFormula(metric) + '. תרומות: Grit ' + gritPart +
          ' + Involvement ' + invPart + ' + Clutch ' + clutchPart +
          ' = ' + row.score + '. המשקלות ידניות ושרירותיות — זה בדיוק מה שהשיעור מדגים.'
      },
      {
        title: '5. דירוג אחרי סף דקות',
        body: 'רק שחקנים עם לפחות ' + metric.minMinutes +
          ' דקות נשארים. הדירוג הנוכחי: #' + row.rank +
          (row.deltaRank == null ? '.' : ' (Δדירוג ' + (row.deltaRank > 0 ? '+' : '') + row.deltaRank + ' מול בסיס 40/30/30).')
      }
    ];
  }

  function bumpSpec(spec, key, delta) {
    const next = normalizeMetricSpec(spec);
    next[key] = clamp(next[key] + delta, 0, 100);
    return next;
  }

  function fragilityReport(dataset, spec, delta) {
    return fragilityFromPrepared(createStore(dataset).players, spec, delta);
  }

  return {
    createDemoFixture: createDemoFixture,
    flattenCalibrated: flattenCalibrated,
    attachBreakdowns: attachBreakdowns,
    rankPlayers: rankPlayers,
    preparePocRows: preparePocRows,
    formatBreakdown: formatBreakdown,
    flagImpossibleMinutes: flagImpossibleMinutes,
    minutesImpossibleForCompetition: minutesImpossibleForCompetition,
    WORLD_CUP_MAX_MINUTES: WORLD_CUP_MAX_MINUTES,
    SEASON_MISLABELED: SEASON_MISLABELED,
    DEFAULT_METRIC: DEFAULT_METRIC,
    positionGroup: positionGroup,
    componentsFromEvents: componentsFromEvents,
    compositeScore: compositeScore,
    applyMetric: applyMetric,
    createStore: createStore,
    loadLabSources: loadLabSources,
    lessonContributions: lessonContributions,
    LAB_PATHS: LAB_PATHS,
    serializeMetricHash: serializeMetricHash,
    parseMetricHash: parseMetricHash,
    formatFormula: formatFormula,
    buildLesson: buildLesson,
    fragilityReport: fragilityReport,
    normalizeMetricSpec: normalizeMetricSpec,
    playerKey: playerKey,
    EVENT_GLOSSARY: EVENT_GLOSSARY,
    RADAR_AXES: RADAR_AXES,
    COMPONENT_RECIPE: COMPONENT_RECIPE,
    DEFENDER_EXERCISE: DEFENDER_EXERCISE,
    evaluateExercise: evaluateExercise,
    buildCompareRadar: buildCompareRadar,
    radarValues: radarValues,
    methodologyParagraph: methodologyParagraph,
    exportMetricBundle: exportMetricBundle
  };
}));
