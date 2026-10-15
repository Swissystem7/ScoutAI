(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else root.ScoutAIClubFitBase = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Split for review size: clubfit-base.js -> clubfit-fit.js -> clubfit.js (load in that order); clubfit.js is the public module.

  // «התאמה לקבוצה» — scouting FOR a specific team.
  //
  // 1. Team style profile: nine style dimensions from event data, each one a
  //    ratio of raw counts summed over the team's matches, then z-scored
  //    across the 32 teams (data/wc2018_club_fit.json, built by
  //    tools/build-club-fit.js).
  // 2. Role-aware player profile: per-90 action rates, shrunk toward the role
  //    mean (PRIOR_MINUTES), as percentiles inside the role.
  // 3. Fit: every role has a list of actions with a base weight and a
  //    «loading» on each style dimension. weight = max(0, base + Σ loading × z).
  //    Fit = weighted mean of the player's percentiles (0–100).
  //
  // Pre-registered before looking at any validation result (do not tune on
  // the result): dimensions, roles, loadings, PRIOR_MINUTES, thresholds, the
  // two splits, the bootstrap and the verdict rules below.

  const DATA_PATH = 'data/wc2018_club_fit.json';
  const PROVENANCE = 'STATSBOMB_OPEN_DATA';
  const USER_PROVENANCE = 'USER_LICENSED_DATA';

  const PRIOR_MINUTES = 90;      // shrink per-90 rates toward the role mean
  const POOL_MINUTES = 90;       // who counts in the percentile pool
  const HALF_MINUTES = 90;       // eligibility in each half for stability
  const Z_CLIP = 2.5;
  const BOOTSTRAP_REPS = 500;
  const BOOTSTRAP_SEED = 20260929;

  const STYLE_DIMS = Object.freeze([
    { id: 'possession', label: 'החזקת כדור', short: 'החזקה', unit: '%', scale: 100,
      definition: 'מסירות הקבוצה חלקי כל המסירות במשחק (שתי הקבוצות).',
      fields: 'passes / (passes + oppPasses)',
      value: function (t) { return ratio(t.passes, t.passes + t.oppPasses); } },
    { id: 'pressIntensity', label: 'עצימות לחץ (PPDA נמוך)', short: 'עצימות לחץ', unit: 'PPDA', scale: 1,
      definition: 'PPDA = מסירות היריב ב-60% השטח שלו, חלקי תיקולים, חטיפות ועבירות שלנו באותו אזור. כאן מוצג ההפוך — גבוה = לוחצים יותר. בתצוגה: PPDA עצמו.',
      fields: 'defActsOpp60 / oppPassesOwn60',
      value: function (t) { return ratio(t.defActsOpp60, t.oppPassesOwn60); },
      display: function (v) { return v > 0 ? 'PPDA ' + round1(1 / v) : '—'; } },
    { id: 'pressHeight', label: 'גובה הלחץ', short: 'גובה לחץ', unit: 'yd', scale: 1,
      definition: 'המרחק הממוצע מקו השער שלנו (יארדים, 0–120) של לחצים, תיקולים, חטיפות, עבירות והשבות כדור.',
      fields: 'defActXSum / defActN',
      value: function (t) { return ratio(t.defActXSum, t.defActN); } },
    { id: 'counterpress', label: 'לחץ-נגד', short: 'לחץ-נגד', unit: 'לפוזשן', scale: 1,
      definition: 'פעולות שסומנו counterpress (תוך 5 שנ׳ מאיבוד כדור) לכל החזקה של הקבוצה.',
      fields: 'counterpress / possessions',
      value: function (t) { return ratio(t.counterpress, t.possessions); } },
    { id: 'directness', label: 'ישירות', short: 'ישירות', unit: '%', scale: 100,
      definition: 'סך היארדים קדימה חלקי סך אורך המסירות (מסירות שהושלמו, משחק פתוח). גבוה = כל מסירה מתקדמת יותר.',
      fields: 'fwdDist / totDist',
      value: function (t) { return ratio(t.fwdDist, t.totDist); } },
    { id: 'crossing', label: 'הגבהות', short: 'הגבהות', unit: 'ל-100 מסירות', scale: 100,
      definition: 'הגבהות לכל 100 מסירות משחק פתוח בחצי של היריב.',
      fields: 'crosses / oppHalfPasses',
      value: function (t) { return ratio(t.crosses, t.oppHalfPasses); } },
    { id: 'through', label: 'כדורי עומק', short: 'עומק', unit: 'ל-100 מסירות', scale: 100,
      definition: 'מסירות Through Ball לכל 100 מסירות משחק פתוח בחצי של היריב. נדיר מאוד בנתונים (71 בכל הטורניר) — ולכן רועש.',
      fields: 'throughBalls / oppHalfPasses',
      value: function (t) { return ratio(t.throughBalls, t.oppHalfPasses); } },
    { id: 'buildUp', label: 'בנייה מאחור', short: 'בנייה', unit: '%', scale: 100,
      definition: 'שיעור המסירות הקצרות (פחות מ-32 יארד) מתוך המסירות שיוצאות מהשליש שלנו (כולל בעיטות שער, בלי חוץ).',
      fields: 'ownThirdShort / ownThirdPasses',
      value: function (t) { return ratio(t.ownThirdShort, t.ownThirdPasses); } },
    { id: 'setPiece', label: 'תלות במצבים נייחים', short: 'נייחים', unit: '% xG', scale: 100,
      definition: 'חלק ה-xG (בלי פנדלים) שנוצר מקרנות ובעיטות חופשיות.',
      fields: 'setPieceXg / npxg',
      value: function (t) { return ratio(t.setPieceXg, t.npxg); } }
  ].map(Object.freeze));

  const DIM_IDS = STYLE_DIMS.map(function (d) { return d.id; });
  const DIM_BY_ID = {};
  STYLE_DIMS.forEach(function (d) { DIM_BY_ID[d.id] = d; });

  const METRICS = Object.freeze({
    progPass: { label: 'מסירות מתקדמות', fields: 'progPass' },
    progPassUP: { label: 'מסירות מתקדמות תחת לחץ', fields: 'progPassUP' },
    buildUpPass: { label: 'מסירות קצרות מהשליש שלנו', fields: 'buildUpPass' },
    longPass: { label: 'כדורים ארוכים שהושלמו', fields: 'longPass' },
    crosses: { label: 'הגבהות', fields: 'crosses' },
    throughBalls: { label: 'כדורי עומק', fields: 'throughBalls' },
    xA: { label: 'xA (איכות מסירות מפתח)', fields: 'xA' },
    progCarry: { label: 'הובלות מתקדמות', fields: 'progCarry' },
    dribbles: { label: 'כדרורים מוצלחים', fields: 'dribbles' },
    npxg: { label: 'xG בלי פנדלים', fields: 'npxg' },
    headedShots: { label: 'בעיטות ראש', fields: 'headedShots' },
    boxTouches: { label: 'נגיעות ברחבה', fields: 'boxTouches' },
    receivedThrough: { label: 'קבלת כדורי עומק', fields: 'receivedThrough' },
    receivedCross: { label: 'קבלת הגבהות', fields: 'receivedCross' },
    pressures: { label: 'לחצים', fields: 'pressures' },
    pressAtt: { label: 'לחצים בשליש ההתקפי', fields: 'pressAtt' },
    counterpress: { label: 'לחץ-נגד', fields: 'counterpress' },
    tacklesInt: { label: 'תיקולים שנוצחו + חטיפות', fields: 'tacklesInt' },
    recoveries: { label: 'השבות כדור', fields: 'recoveries' },
    highRecoveries: { label: 'השבות כדור בחצי היריב', fields: 'highRecoveries' },
    defActHigh: { label: 'פעולות הגנה מעל השליש שלנו', fields: 'defActHigh' },
    aerialsWon: { label: 'דו-קרבות אוויר שנוצחו', fields: 'aerialsWon' },
    clearances: { label: 'הרחקות', fields: 'clearances' },
    setPieceShots: { label: 'בעיטות ממצבים נייחים', fields: 'setPieceShots' }
  });
  const METRIC_IDS = Object.keys(METRICS);

  // role -> [metric, base weight, {style dim: loading}]
  function m(metric, base, load) { return Object.freeze({ metric: metric, base: base, load: Object.freeze(load || {}) }); }
  const ROLES = Object.freeze({
    CB: Object.freeze({ id: 'CB', label: 'בלם', demands: Object.freeze([
      m('progPass', 1, { possession: 0.5, buildUp: 0.5, directness: -0.3 }),
      m('progPassUP', 0.5, { possession: 0.6, buildUp: 0.6, pressHeight: 0.2 }),
      m('buildUpPass', 0.5, { buildUp: 0.8, possession: 0.4, directness: -0.4 }),
      m('longPass', 0.5, { directness: 0.8, buildUp: -0.5, possession: -0.3 }),
      m('aerialsWon', 1, { setPiece: 0.5, crossing: 0.2, possession: -0.3 }),
      m('clearances', 0.5, { possession: -0.6, pressHeight: -0.5 }),
      m('tacklesInt', 1, {}),
      m('defActHigh', 0.3, { pressHeight: 0.8, pressIntensity: 0.5 }),
      m('progCarry', 0.3, { possession: 0.4, buildUp: 0.3 }),
      m('setPieceShots', 0.2, { setPiece: 0.8 })
    ]) }),
    FB: Object.freeze({ id: 'FB', label: 'מגן / מגן-כנף', demands: Object.freeze([
      m('crosses', 1, { crossing: 0.9, through: -0.2 }),
      m('progCarry', 1, { possession: 0.3, directness: 0.2 }),
      m('progPass', 0.7, { possession: 0.4, buildUp: 0.3 }),
      m('xA', 0.5, { crossing: 0.3 }),
      m('pressures', 0.5, { pressIntensity: 0.6, pressHeight: 0.3 }),
      m('counterpress', 0.3, { counterpress: 0.8, pressIntensity: 0.3 }),
      m('tacklesInt', 1, { possession: -0.3 }),
      m('dribbles', 0.3, { possession: 0.3 }),
      m('buildUpPass', 0.3, { buildUp: 0.6 })
    ]) }),
    DM: Object.freeze({ id: 'DM', label: 'קשר אחורי', demands: Object.freeze([
      m('progPassUP', 1, { possession: 0.6, buildUp: 0.5 }),
      m('buildUpPass', 0.7, { buildUp: 0.8, directness: -0.4 }),
      m('progPass', 1, { possession: 0.4 }),
      m('longPass', 0.4, { directness: 0.8, buildUp: -0.4 }),
      m('tacklesInt', 1, { possession: -0.3 }),
      m('recoveries', 0.7, {}),
      m('counterpress', 0.5, { counterpress: 0.8, pressIntensity: 0.4 }),
      m('pressures', 0.5, { pressIntensity: 0.7, pressHeight: 0.3 }),
      m('aerialsWon', 0.3, { directness: 0.3, setPiece: 0.3 })
    ]) }),
    CM: Object.freeze({ id: 'CM', label: 'קשר מרכזי', demands: Object.freeze([
      m('progPass', 1, { possession: 0.4, directness: 0.2 }),
      m('progPassUP', 0.7, { possession: 0.6, buildUp: 0.3 }),
      m('throughBalls', 0.4, { through: 0.9 }),
      m('xA', 0.7, { through: 0.3 }),
      m('progCarry', 0.7, { directness: 0.3 }),
      m('counterpress', 0.6, { counterpress: 0.8, pressIntensity: 0.4 }),
      m('pressures', 0.5, { pressIntensity: 0.7, pressHeight: 0.3 }),
      m('tacklesInt', 0.6, { possession: -0.3 }),
      m('highRecoveries', 0.3, { pressHeight: 0.7 }),
      m('npxg', 0.3, {})
    ]) }),
    AM: Object.freeze({ id: 'AM', label: 'כנף / קשר התקפי', demands: Object.freeze([
      m('dribbles', 1, { possession: 0.3, directness: 0.2 }),
      m('progCarry', 1, { directness: 0.4 }),
      m('crosses', 0.5, { crossing: 0.9 }),
      m('throughBalls', 0.3, { through: 0.9 }),
      m('xA', 1, {}),
      m('npxg', 1, {}),
      m('counterpress', 0.5, { counterpress: 0.8, pressIntensity: 0.4 }),
      m('pressAtt', 0.5, { pressHeight: 0.7, pressIntensity: 0.5 }),
      m('boxTouches', 0.5, { crossing: 0.2 })
    ]) }),
    ST: Object.freeze({ id: 'ST', label: 'חלוץ', demands: Object.freeze([
      m('npxg', 1.5, {}),
      m('boxTouches', 0.8, { crossing: 0.3, possession: 0.2 }),
      m('headedShots', 0.3, { crossing: 0.8, setPiece: 0.4 }),
      m('receivedCross', 0.3, { crossing: 0.8 }),
      m('aerialsWon', 0.5, { directness: 0.6, crossing: 0.4, setPiece: 0.3 }),
      m('receivedThrough', 0.3, { through: 0.8, directness: 0.4 }),
      m('counterpress', 0.5, { counterpress: 0.8, pressIntensity: 0.4 }),
      m('pressAtt', 0.5, { pressHeight: 0.7, pressIntensity: 0.6 }),
      m('xA', 0.5, { possession: 0.3 }),
      m('dribbles', 0.4, { possession: 0.2 }),
      m('setPieceShots', 0.3, { setPiece: 0.9 })
    ]) })
  });
  const ROLE_IDS = Object.keys(ROLES);

  function roleOf(position) {
    const p = String(position || '');
    if (/goalkeeper/i.test(p)) return 'GK';
    if (/wing back/i.test(p) || /^(left|right) back$/i.test(p)) return 'FB';
    if (/center back/i.test(p)) return 'CB';
    if (/defensive midfield/i.test(p)) return 'DM';
    if (/attacking midfield|wing$|^(left|right) midfield$/i.test(p)) return 'AM';
    if (/center midfield/i.test(p)) return 'CM';
    if (/forward|striker/i.test(p)) return 'ST';
    return null;
  }

  // ---- small helpers -------------------------------------------------------

  function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
  function ratio(a, b) { return b > 0 ? a / b : null; }
  function round1(x) { return Math.round(Number(x) * 10) / 10; }
  function round2(x) { return Math.round(Number(x) * 100) / 100; }
  function clip(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function mean(xs) { return xs.length ? xs.reduce(function (s, x) { return s + x; }, 0) / xs.length : 0; }
  function sd(xs) {
    if (xs.length < 2) return 0;
    const mu = mean(xs);
    return Math.sqrt(xs.reduce(function (s, x) { return s + (x - mu) * (x - mu); }, 0) / (xs.length - 1));
  }

  function rankValues(values) {
    const idx = values.map(function (v, i) { return { v: Number(v) || 0, i: i }; });
    idx.sort(function (a, b) { return a.v - b.v || a.i - b.i; });
    const ranks = new Array(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j < idx.length && idx[j].v === idx[i].v) j += 1;
      const avg = (i + 1 + j) / 2;
      for (let k = i; k < j; k += 1) ranks[idx[k].i] = avg;
      i = j;
    }
    return ranks;
  }

  function spearman(xs, ys) {
    if (!xs || xs.length < 3) return null;
    const rx = rankValues(xs);
    const ry = rankValues(ys);
    const n = xs.length;
    const mx = (n + 1) / 2;
    let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = rx[i] - mx; const dy = ry[i] - mx;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (!sxx || !syy) return 0;
    return sxy / Math.sqrt(sxx * syy);
  }

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

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function ci95(values) {
    const s = values.filter(function (v) { return v != null && Number.isFinite(v); }).sort(function (a, b) { return a - b; });
    if (!s.length) return [null, null];
    return [round2(quantile(s, 0.025)), round2(quantile(s, 0.975))];
  }

  function percentile(value, peers) {
    if (!peers.length) return 50;
    let below = 0; let equal = 0;
    peers.forEach(function (x) { if (x < value) below += 1; else if (x === value) equal += 1; });
    return round1((below + 0.5 * equal) / peers.length * 100);
  }

  // ---- splits --------------------------------------------------------------

  const SPLITS = Object.freeze({
    oddEven: Object.freeze({
      id: 'oddEven',
      label: 'חצי-מדגם: משחקים אי-זוגיים של כל נבחרת ← זוגיים',
      isA: function (row) { return row.teamMatchNo % 2 === 1; }
    }),
    temporal: Object.freeze({
      id: 'temporal',
      label: 'זמני: משחקים 1–2 של כל נבחרת ← משחק 3 ואילך',
      isA: function (row) { return row.teamMatchNo <= 2; }
    })
  });

  // ---- team profiles -------------------------------------------------------

  function teamRowsOf(dataset) { return dataset && Array.isArray(dataset.teamMatches) ? dataset.teamMatches : []; }
  function playerRowsOf(dataset) { return dataset && Array.isArray(dataset.playerMatches) ? dataset.playerMatches : []; }

  function teamProfiles(teamRows) {
    const byTeam = new Map();
    teamRows.forEach(function (r) {
      if (!byTeam.has(r.team)) byTeam.set(r.team, { team: r.team, matches: 0, sums: {} });
      const t = byTeam.get(r.team);
      t.matches += 1;
      Object.keys(r).forEach(function (k) { if (typeof r[k] === 'number') t.sums[k] = (t.sums[k] || 0) + r[k]; });
    });
    const teams = Array.from(byTeam.values()).map(function (t) {
      const raw = {};
      STYLE_DIMS.forEach(function (d) { raw[d.id] = d.value(t.sums); });
      return { team: t.team, matches: t.matches, raw: raw, goalsFor: t.sums.goalsFor || 0, goalsAgainst: t.sums.goalsAgainst || 0 };
    });
    const stats = {};
    STYLE_DIMS.forEach(function (d) {
      const xs = teams.map(function (t) { return t.raw[d.id]; }).filter(function (v) { return v != null; });
      stats[d.id] = { mean: mean(xs), sd: sd(xs) || 1 };
    });
    teams.forEach(function (t) {
      t.z = {};
      STYLE_DIMS.forEach(function (d) {
        t.z[d.id] = t.raw[d.id] == null ? 0 : round2((t.raw[d.id] - stats[d.id].mean) / stats[d.id].sd);
      });
    });
    teams.sort(function (a, b) { return a.team.localeCompare(b.team); });
    return { teams: teams, stats: stats };
  }

  function formatDimValue(dim, value) {
    if (value == null) return '—';
    if (dim.display) return dim.display(value);
    if (dim.unit === '%' || dim.unit === '% xG') return round1(value * 100) + '%';
    if (dim.scale !== 1) return String(round1(value * dim.scale));
    return String(round2(value));
  }

  // z -> the raw value it stands for in this dataset (for the sliders).
  function rawFromZ(stats, dimId, z) {
    const s = stats[dimId];
    return s.mean + z * s.sd;
  }

  return { DATA_PATH, PROVENANCE, USER_PROVENANCE, PRIOR_MINUTES, POOL_MINUTES, HALF_MINUTES,
    Z_CLIP, BOOTSTRAP_REPS, BOOTSTRAP_SEED, STYLE_DIMS, DIM_IDS, DIM_BY_ID, METRICS, METRIC_IDS, m,
    ROLES, ROLE_IDS, roleOf, num, ratio, round1, round2, clip, mean, sd, rankValues, spearman,
    mulberry32, quantile, ci95, percentile, SPLITS, teamRowsOf, playerRowsOf, teamProfiles,
    formatDimValue, rawFromZ };
}));
