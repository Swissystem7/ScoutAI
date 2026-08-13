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
    selectedId: ''
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
    if (/back|defen/i.test(text)) return 'DF';
    if (/forward|wing|striker/i.test(text)) return 'FW';
    if (/midfield/i.test(text)) return 'MF';
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
      selectedId: src.selectedId ? String(src.selectedId) : ''
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
      const fragility = fragilityFromPrepared(players, metric, 10);
      return {
        spec: metric,
        rows: rows,
        selected: selected,
        lesson: buildLesson(selected, metric),
        contributions: lessonContributions(selected, metric),
        mapping: lessonMapping(selected),
        fragility: fragility,
        formula: formatFormula(metric)
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
      selectedId: params.sel || ''
    });
  }

  function formatFormula(spec) {
    const metric = normalizeMetricSpec(spec);
    const total = metric.grit + metric.involvement + metric.clutch;
    return 'ציון = (' + metric.grit + '×Grit + ' + metric.involvement + '×Involvement + ' +
      metric.clutch + '×Clutch) / ' + (total || 1);
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
    playerKey: playerKey
  };
}));
