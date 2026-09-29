(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIClubFit = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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

  // ---- players -------------------------------------------------------------

  function aggregatePlayers(rows, availableMetrics) {
    const metrics = availableMetrics || METRIC_IDS;
    const byId = new Map();
    rows.forEach(function (r) {
      const key = String(r.playerId != null && r.playerId !== '' ? r.playerId : (r.name + '|' + r.team));
      if (!byId.has(key)) {
        const base = { id: key, name: r.name, team: r.team, minutes: 0, matchIds: new Set(), posMinutes: {}, sums: {} };
        metrics.forEach(function (k) { base.sums[k] = 0; });
        byId.set(key, base);
      }
      const p = byId.get(key);
      p.minutes += num(r.minutes);
      if (r.matchId != null) p.matchIds.add(r.matchId);
      p.posMinutes[r.position] = (p.posMinutes[r.position] || 0) + num(r.minutes);
      metrics.forEach(function (k) { p.sums[k] += num(r[METRICS[k].fields]); });
    });
    return Array.from(byId.values()).map(function (p) {
      const position = Object.keys(p.posMinutes).sort(function (a, b) { return p.posMinutes[b] - p.posMinutes[a]; })[0] || '';
      return {
        id: p.id, name: p.name, team: p.team, minutes: p.minutes, matches: p.matchIds.size || 1,
        position: position, role: roleOf(position), sums: p.sums
      };
    }).filter(function (p) { return p.role && p.role !== 'GK'; });
  }

  // Shrunk per-90 rates and within-role percentiles. roleOverride lets the
  // stability test keep each player's full-data role in both halves.
  function playerProfiles(players, options) {
    const opts = options || {};
    const metrics = opts.metrics || METRIC_IDS;
    const poolMinutes = opts.poolMinutes != null ? opts.poolMinutes : POOL_MINUTES;
    const roleOverride = opts.roleOverride || null;
    players.forEach(function (p) { if (roleOverride && roleOverride[p.id]) p.role = roleOverride[p.id]; });
    const byRole = {};
    players.forEach(function (p) { (byRole[p.role] = byRole[p.role] || []).push(p); });
    Object.keys(byRole).forEach(function (role) {
      const all = byRole[role];
      const pool = all.filter(function (p) { return p.minutes >= poolMinutes; });
      const prior = {};
      metrics.forEach(function (k) {
        let c = 0; let mins = 0;
        pool.forEach(function (p) { c += p.sums[k]; mins += p.minutes; });
        prior[k] = mins > 0 ? c / mins : 0;   // per minute
      });
      all.forEach(function (p) {
        p.rate = {};
        metrics.forEach(function (k) {
          p.rate[k] = (p.sums[k] + prior[k] * PRIOR_MINUTES) / (p.minutes + PRIOR_MINUTES) * 90;
        });
      });
      metrics.forEach(function (k) {
        const peers = pool.map(function (p) { return p.rate[k]; });
        all.forEach(function (p) {
          p.pct = p.pct || {};
          p.pct[k] = percentile(p.rate[k], peers);
        });
      });
      all.forEach(function (p) { p.poolSize = pool.length; });
    });
    return players;
  }

  // ---- fit -----------------------------------------------------------------

  function neutralZ() {
    const z = {};
    DIM_IDS.forEach(function (d) { z[d] = 0; });
    return z;
  }

  function weightsFor(roleId, z, metrics) {
    const role = ROLES[roleId];
    if (!role) return [];
    const available = metrics ? new Set(metrics) : null;
    return role.demands.map(function (dm) {
      const drivers = Object.keys(dm.load).map(function (dim) {
        const zz = clip(num(z && z[dim]), -Z_CLIP, Z_CLIP);
        return { dim: dim, z: zz, delta: dm.load[dim] * zz };
      }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
      const w = available && !available.has(dm.metric) ? 0
        : Math.max(0, dm.base + drivers.reduce(function (s, d) { return s + d.delta; }, 0));
      return { metric: dm.metric, base: dm.base, weight: round2(w), drivers: drivers };
    });
  }

  function fitScore(player, weights) {
    let sw = 0; let s = 0;
    weights.forEach(function (w) {
      if (!w.weight || player.pct[w.metric] == null) return;
      sw += w.weight; s += w.weight * player.pct[w.metric];
    });
    return sw > 0 ? s / sw : 50;
  }

  function contributions(player, weights) {
    const sw = weights.reduce(function (s, w) { return s + (player.pct[w.metric] == null ? 0 : w.weight); }, 0) || 1;
    return weights.filter(function (w) { return w.weight > 0 && player.pct[w.metric] != null; }).map(function (w) {
      return {
        metric: w.metric, label: METRICS[w.metric].label, weight: w.weight, base: w.base,
        share: w.weight / sw, pct: player.pct[w.metric], rate90: round2(player.rate[w.metric]),
        points: round1(w.weight / sw * (player.pct[w.metric] - 50)), drivers: w.drivers
      };
    });
  }

  function driverText(d) {
    return DIM_BY_ID[d.dim].label + (d.z > 0 ? ' גבוה' : ' נמוך') + ' (z=' + (d.z > 0 ? '+' : '') + round1(d.z) + ')';
  }
  function demandReason(c, teamName) {
    const top = c.drivers.filter(function (d) { return d.delta > 0.05; })[0];
    if (!top || c.weight <= c.base) return 'דרישת בסיס של העמדה (משקל ' + c.weight + ')';
    return (teamName ? 'אצל ' + teamName + ': ' : '') + driverText(top) + ' ⇒ משקל ' + c.weight + ' במקום ' + c.base;
  }
  function suppressReason(c, teamName) {
    const top = c.drivers.filter(function (d) { return d.delta > 0.05; })[0];
    if (!top || c.weight <= c.base) return 'דרישת בסיס של העמדה (משקל ' + c.weight + ')';
    return 'והפרופיל' + (teamName ? ' (' + teamName + ')' : '') + ' דורש את זה: ' + driverText(top) + ', משקל ' + c.weight;
  }

  function reasonsFor(player, weights, teamName) {
    const cs = contributions(player, weights);
    const pros = cs.filter(function (c) { return c.points > 0; })
      .sort(function (a, b) { return b.points - a.points; }).slice(0, 3)
      .map(function (c) {
        return Object.assign({}, c, { text: c.label + ': אחוזון ' + c.pct + ' בעמדה (' + c.rate90 + ' ל-90). ' + demandReason(c, teamName) + '.' });
      });
    const cons = cs.filter(function (c) { return c.points < 0; })
      .sort(function (a, b) { return a.points - b.points; }).slice(0, 2)
      .map(function (c) {
        return Object.assign({}, c, { text: c.label + ': רק אחוזון ' + c.pct + ' בעמדה — ' + suppressReason(c, teamName) + ' (' + c.points + ' נק׳).' });
      });
    return { pros: pros, cons: cons };
  }

  // model = { players (profiled), teams, stats, metrics }
  function buildModel(dataset, options) {
    const opts = options || {};
    const profiles = teamProfiles(teamRowsOf(dataset));
    const metrics = opts.metrics || METRIC_IDS;
    const players = playerProfiles(aggregatePlayers(playerRowsOf(dataset), metrics), { metrics: metrics });
    return { players: players, teams: profiles.teams, stats: profiles.stats, metrics: metrics };
  }

  function teamZ(model, teamName) {
    const t = model.teams.find(function (x) { return x.team === teamName; });
    return t ? t.z : null;
  }

  // Ranked shortlist for one role and one style profile (z per dimension).
  function shortlist(model, z, roleId, options) {
    const opts = options || {};
    const minMinutes = opts.minMinutes != null ? opts.minMinutes : 180;
    const top = opts.top || 10;
    const nearMiss = opts.nearMiss != null ? opts.nearMiss : 5;
    const excludeTeam = opts.excludeTeam || null;
    const teamName = opts.teamName || null;
    const weights = weightsFor(roleId, z, model.metrics);
    const neutralW = weightsFor(roleId, neutralZ(), model.metrics);
    const pool = model.players.filter(function (p) {
      return p.role === roleId && p.minutes >= minMinutes && (!excludeTeam || p.team !== excludeTeam);
    });
    pool.forEach(function (p) {
      p._fit = fitScore(p, weights);
      p._neutral = fitScore(p, neutralW);
    });
    const neutralOrder = pool.slice().sort(function (a, b) { return b._neutral - a._neutral || a.name.localeCompare(b.name); });
    const neutralRank = {};
    neutralOrder.forEach(function (p, i) { neutralRank[p.id] = i + 1; });
    const ranked = pool.slice().sort(function (a, b) { return b._fit - a._fit || a.name.localeCompare(b.name); });
    const cutFit = ranked.length >= top ? ranked[top - 1]._fit : null;
    const rows = ranked.map(function (p, i) {
      const r = reasonsFor(p, weights, teamName);
      return {
        rank: i + 1, id: p.id, name: p.name, team: p.team, position: p.position, role: p.role,
        minutes: Math.round(p.minutes), matches: p.matches,
        fit: round1(p._fit), neutralFit: round1(p._neutral), neutralRank: neutralRank[p.id],
        rankShift: neutralRank[p.id] - (i + 1),
        reasons: r.pros, gaps: r.cons,
        gapToCut: cutFit == null ? null : round1(cutFit - p._fit)
      };
    });
    const whyNot = rows.slice(top, top + nearMiss).map(function (row) {
      const gap = row.gaps[0];
      return Object.assign({}, row, {
        whyNot: 'חסרות ' + row.gapToCut + ' נק׳ התאמה למקום ' + top + '. ' +
          (gap ? 'הפער הגדול: ' + gap.text : 'אין רכיב חלש בולט — פשוט פחות גבוה בכמה רכיבים.')
      });
    });
    return {
      role: roleId, roleLabel: ROLES[roleId].label, weights: weights, n: pool.length,
      shortlist: rows.slice(0, top), nearMisses: whyNot, all: rows,
      rhoVsNeutral: pool.length >= 3 ? round2(spearman(pool.map(function (p) { return p._fit; }), pool.map(function (p) { return p._neutral; }))) : null
    };
  }

  // ---- validation ----------------------------------------------------------

  // (1) Are team profiles stable? Same dimension, half A vs half B, over teams.
  function teamStability(dataset, splitId, options) {
    const split = SPLITS[splitId] || SPLITS.oddEven;
    const reps = (options && options.reps) || BOOTSTRAP_REPS;
    const rows = teamRowsOf(dataset);
    const a = teamProfiles(rows.filter(split.isA)).teams;
    const b = teamProfiles(rows.filter(function (r) { return !split.isA(r); })).teams;
    const bBy = {};
    b.forEach(function (t) { bBy[t.team] = t; });
    const pairs = a.filter(function (t) { return bBy[t.team]; });
    const n = pairs.length;
    const rand = mulberry32(BOOTSTRAP_SEED + (split.id === 'temporal' ? 7 : 0));
    const boots = STYLE_DIMS.map(function () { return []; });
    for (let r = 0; r < reps; r += 1) {
      const idx = [];
      for (let i = 0; i < n; i += 1) idx.push(Math.floor(rand() * n));
      STYLE_DIMS.forEach(function (d, k) {
        boots[k].push(spearman(idx.map(function (i) { return pairs[i].raw[d.id]; }), idx.map(function (i) { return bBy[pairs[i].team].raw[d.id]; })));
      });
    }
    const dims = STYLE_DIMS.map(function (d, k) {
      const rho = spearman(pairs.map(function (t) { return t.raw[d.id]; }), pairs.map(function (t) { return bBy[t.team].raw[d.id]; }));
      const ci = ci95(boots[k]);
      const verdict = rho >= 0.5 && ci[0] > 0 ? 'stable' : ci[0] > 0 ? 'partial' : 'noise';
      return { id: d.id, label: d.label, rho: round2(rho), ci: ci, verdict: verdict };
    });
    // Fingerprint: does the half-B profile's nearest half-A profile belong to
    // the same team? Chance = 1 / n.
    let hits = 0;
    pairs.forEach(function (t) {
      const target = bBy[t.team].z;
      let best = null; let bestD = Infinity;
      a.forEach(function (c) {
        let dd = 0;
        DIM_IDS.forEach(function (d) { dd += Math.pow(c.z[d] - target[d], 2); });
        if (dd < bestD) { bestD = dd; best = c.team; }
      });
      if (best === t.team) hits += 1;
    });
    return {
      splitId: split.id, splitLabel: split.label, nTeams: n, reps: reps, dims: dims,
      nStable: dims.filter(function (d) { return d.verdict === 'stable'; }).length,
      fingerprintHits: hits, fingerprintExpectedByChance: 1
    };
  }

  function halfModels(dataset, split) {
    const all = aggregatePlayers(playerRowsOf(dataset));
    const roleOverride = {};
    all.forEach(function (p) { roleOverride[p.id] = p.role; });
    const rows = playerRowsOf(dataset);
    const a = playerProfiles(aggregatePlayers(rows.filter(split.isA)), { roleOverride: roleOverride });
    const b = playerProfiles(aggregatePlayers(rows.filter(function (r) { return !split.isA(r); })), { roleOverride: roleOverride });
    return { a: a, b: b };
  }

  // (2) Are player fit scores stable across matches? Team profiles are fixed
  // (full data); player actions come from half A vs half B. For every one of
  // the 32 team profiles: ρ(fit_A, fit_B) over players with 90+ minutes in
  // both halves. «Team-specific» = fit for that team minus the player's mean
  // fit over all 32 teams — the part of the ranking that the team choice adds.
  function fitStability(dataset, splitId, options) {
    const split = SPLITS[splitId] || SPLITS.oddEven;
    const reps = (options && options.reps) || BOOTSTRAP_REPS;
    const teams = teamProfiles(teamRowsOf(dataset)).teams;
    const halves = halfModels(dataset, split);
    const bBy = {};
    halves.b.forEach(function (p) { bBy[p.id] = p; });
    const pairs = halves.a.filter(function (p) {
      return p.minutes >= HALF_MINUTES && bBy[p.id] && bBy[p.id].minutes >= HALF_MINUTES;
    });
    const n = pairs.length;
    const T = teams.length;
    // fits[t][i] for half A and B; neutral fit.
    function fitsFor(side) {
      return teams.map(function (t) {
        return pairs.map(function (p) {
          const pl = side === 'a' ? p : bBy[p.id];
          return fitScore(pl, weightsFor(pl.role, t.z));
        });
      });
    }
    const fa = fitsFor('a');
    const fb = fitsFor('b');
    const meanA = pairs.map(function (_, i) { return mean(fa.map(function (row) { return row[i]; })); });
    const meanB = pairs.map(function (_, i) { return mean(fb.map(function (row) { return row[i]; })); });
    const sa = fa.map(function (row) { return row.map(function (v, i) { return v - meanA[i]; }); });
    const sb = fb.map(function (row) { return row.map(function (v, i) { return v - meanB[i]; }); });
    const neutralA = pairs.map(function (p) { return fitScore(p, weightsFor(p.role, neutralZ())); });
    const neutralB = pairs.map(function (p) { const q = bBy[p.id]; return fitScore(q, weightsFor(q.role, neutralZ())); });
    // Surface baselines on the same footing as the fit: within-role
    // percentiles of one raw action rate.
    const pressA = pairs.map(function (p) { return p.pct.pressures; });
    const pressB = pairs.map(function (p) { return bBy[p.id].pct.pressures; });
    const passA = pairs.map(function (p) { return p.pct.progPass; });
    const passB = pairs.map(function (p) { return bBy[p.id].pct.progPass; });

    // Ranks are taken once on the full sample; inside the bootstrap ρ is the
    // Pearson correlation of those ranks (standard shortcut, O(n) per draw).
    function pearsonIdx(x, y, idx) {
      const n2 = idx.length;
      let mx = 0; let my = 0;
      for (let i = 0; i < n2; i += 1) { mx += x[idx[i]]; my += y[idx[i]]; }
      mx /= n2; my /= n2;
      let sxy = 0; let sxx = 0; let syy = 0;
      for (let i = 0; i < n2; i += 1) {
        const dx = x[idx[i]] - mx; const dy = y[idx[i]] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
      }
      return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
    }
    const R = {
      fa: fa.map(rankValues), fb: fb.map(rankValues), sa: sa.map(rankValues), sb: sb.map(rankValues),
      na: rankValues(neutralA), nb: rankValues(neutralB),
      pa: rankValues(pressA), pb: rankValues(pressB), ga: rankValues(passA), gb: rankValues(passB)
    };
    function stats(idx) {
      let sf = 0; let ss = 0;
      for (let t = 0; t < T; t += 1) {
        sf += pearsonIdx(R.fa[t], R.fb[t], idx);
        ss += pearsonIdx(R.sa[t], R.sb[t], idx);
      }
      return {
        fit: T ? sf / T : null,
        specific: T ? ss / T : null,
        neutral: pearsonIdx(R.na, R.nb, idx),
        pressures: pearsonIdx(R.pa, R.pb, idx),
        progPass: pearsonIdx(R.ga, R.gb, idx)
      };
    }
    const all = pairs.map(function (_, i) { return i; });
    const point = stats(all);
    const rand = mulberry32(BOOTSTRAP_SEED + 101 + (split.id === 'temporal' ? 7 : 0));
    const boot = { fit: [], specific: [], neutral: [], pressures: [], progPass: [] };
    for (let r = 0; r < reps && n >= 10; r += 1) {
      const idx = [];
      for (let i = 0; i < n; i += 1) idx.push(Math.floor(rand() * n));
      const s = stats(idx);
      Object.keys(boot).forEach(function (k) { boot[k].push(s[k]); });
    }
    const perTeam = teams.map(function (t, k) {
      return { team: t.team, rho: round2(spearman(fa[k], fb[k])), rhoSpecific: round2(spearman(sa[k], sb[k])) };
    });
    const items = [
      { id: 'fit', label: 'ציון התאמה (ממוצע על 32 פרופילי קבוצה)', kind: 'fit' },
      { id: 'specific', label: 'החלק הייחודי לקבוצה (התאמה פחות ממוצע השחקן על כל הקבוצות)', kind: 'fit' },
      { id: 'neutral', label: 'ציון עמדה ניטרלי (כל הסגנונות = 0)', kind: 'baseline' },
      { id: 'pressures', label: 'לחצים ל-90 בלבד (אחוזון בעמדה, סטטיסטיקה שטחית)', kind: 'baseline' },
      { id: 'progPass', label: 'מסירות מתקדמות ל-90 בלבד (אחוזון בעמדה, סטטיסטיקה שטחית)', kind: 'baseline' }
    ].map(function (it) {
      return Object.assign(it, { rho: point[it.id] == null ? null : round2(point[it.id]), ci: n >= 10 ? ci95(boot[it.id]) : [null, null] });
    });
    const byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    const fitVerdict = byId.fit.ci[0] > 0.5 ? 'stable' : byId.fit.ci[0] > 0.2 ? 'partial' : 'noise';
    const specificSignal = byId.specific.ci[0] > 0 && byId.specific.rho >= 0.2;
    return {
      splitId: split.id, splitLabel: split.label, n: n, reps: reps, items: items, perTeam: perTeam,
      fitVerdict: fitVerdict, specificSignal: specificSignal,
      verdict: fitVerdictText(fitVerdict, specificSignal, byId, n)
    };
  }

  function fmtCi(ci) { return '[' + ci[0] + ', ' + ci[1] + ']'; }

  function fitVerdictText(fitVerdict, specificSignal, byId, n) {
    const f = byId.fit; const s = byId.specific; const nu = byId.neutral;
    const part1 = fitVerdict === 'stable'
      ? 'ציון ההתאמה יציב בין חצאי המשחקים: ρ=' + f.rho + ' ' + fmtCi(f.ci)
      : fitVerdict === 'partial'
        ? 'ציון ההתאמה יציב חלקית בין חצאי המשחקים: ρ=' + f.rho + ' ' + fmtCi(f.ci)
        : 'ציון ההתאמה לא יציב בין חצאי המשחקים (רעש): ρ=' + f.rho + ' ' + fmtCi(f.ci);
    const part2 = specificSignal
      ? 'גם החלק הייחודי לקבוצה חוזר (ρ=' + s.rho + ' ' + fmtCi(s.ci) + ') — כלומר ההבדל בין רשימה לקבוצה אחת לרשימה לקבוצה אחרת נשען על הרגלים שחוזרים, לא רק על מזל.'
      : 'אבל החלק הייחודי לקבוצה לא עובר את הרף (ρ=' + s.rho + ' ' + fmtCi(s.ci) + '): רוב היציבות באה מאיכות כללית בעמדה (ניטרלי ρ=' + nu.rho + ').';
    return part1 + ', על ' + n + ' שחקנים. ' + part2;
  }

  // (3) Sanity check: with the team profile from half A and the player's
  // actions from half B, does a player's own team rank high among the 32
  // team-specific fits? Chance = 50th percentile. Cluster bootstrap by team.
  // Caveat: the player's habits are part of his team's style, so this tests
  // whether the style is carried by persistent player habits — not transfer.
  function ownTeamRecognition(dataset, splitId, options) {
    const split = SPLITS[splitId] || SPLITS.oddEven;
    const reps = (options && options.reps) || BOOTSTRAP_REPS;
    const teamsA = teamProfiles(teamRowsOf(dataset).filter(split.isA)).teams;
    const halves = halfModels(dataset, split);
    const players = halves.b.filter(function (p) { return p.minutes >= HALF_MINUTES; });
    const byTeam = {};
    players.forEach(function (p) {
      const fits = teamsA.map(function (t) { return { team: t.team, fit: fitScore(p, weightsFor(p.role, t.z)) }; });
      const avg = mean(fits.map(function (f) { return f.fit; }));
      const own = fits.find(function (f) { return f.team === p.team; });
      if (!own) return;
      let better = 0; let equal = 0;
      fits.forEach(function (f) { if (f.fit < own.fit) better += 1; else if (f.fit === own.fit && f.team !== p.team) equal += 1; });
      const pctRank = (better + 0.5 * equal) / (fits.length - 1);
      (byTeam[p.team] = byTeam[p.team] || []).push({ pctRank: pctRank, specific: own.fit - avg });
    });
    const teamNames = Object.keys(byTeam).sort();
    function stat(names) {
      const xs = [];
      names.forEach(function (t) { byTeam[t].forEach(function (r) { xs.push(r.pctRank); }); });
      return mean(xs);
    }
    const point = stat(teamNames);
    const rand = mulberry32(BOOTSTRAP_SEED + 202 + (split.id === 'temporal' ? 7 : 0));
    const boot = [];
    for (let r = 0; r < reps; r += 1) {
      const names = [];
      for (let i = 0; i < teamNames.length; i += 1) names.push(teamNames[Math.floor(rand() * teamNames.length)]);
      boot.push(stat(names));
    }
    const ci = ci95(boot.map(function (x) { return x * 100; }));
    const n = teamNames.reduce(function (s, t) { return s + byTeam[t].length; }, 0);
    return {
      splitId: split.id, splitLabel: split.label, n: n, nTeams: teamNames.length,
      meanPct: round1(point * 100), ci: ci, signal: ci[0] > 50
    };
  }

  // How different are the lists for different teams? Mean pairwise ρ between
  // the fit rankings of all team pairs, and mean overlap of the top 10.
  function listDiversity(model, roleId, options) {
    const minMinutes = options && options.minMinutes != null ? options.minMinutes : 180;
    const pool = model.players.filter(function (p) { return p.role === roleId && p.minutes >= minMinutes; });
    const fits = model.teams.map(function (t) {
      const w = weightsFor(roleId, t.z, model.metrics);
      return pool.map(function (p) { return fitScore(p, w); });
    });
    const tops = fits.map(function (f) {
      return new Set(f.map(function (v, i) { return { v: v, i: i }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10).map(function (x) { return x.i; }));
    });
    let sr = 0; let so = 0; let c = 0;
    for (let i = 0; i < fits.length; i += 1) {
      for (let j = i + 1; j < fits.length; j += 1) {
        sr += spearman(fits[i], fits[j]);
        let ov = 0; tops[i].forEach(function (x) { if (tops[j].has(x)) ov += 1; });
        so += ov; c += 1;
      }
    }
    return { role: roleId, n: pool.length, meanRho: c ? round2(sr / c) : null, meanTop10Overlap: c ? round1(so / c) : null };
  }

  // ---- bring your own data -------------------------------------------------

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted;
      } else if ((ch === ',' || ch === '\t' || ch === ';') && !quoted) {
        out.push(cur.trim()); cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  // CSV: one row per player (or per player per match). Required: name, team,
  // position, minutes. Optional: matchId, playerId and any metric column
  // (the field names in METRICS). Missing metric columns get weight 0.
  function parseUserCsv(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return { ok: false, errors: ['צריך שורת כותרת ולפחות שורה אחת'], rows: [], metrics: [] };
    const headers = splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    const lower = headers.map(function (h) { return h.toLowerCase(); });
    const missing = ['name', 'team', 'position', 'minutes'].filter(function (k) { return lower.indexOf(k) < 0; });
    if (missing.length) return { ok: false, errors: ['חסרות עמודות: ' + missing.join(', ')], rows: [], metrics: [] };
    const metrics = METRIC_IDS.filter(function (k) { return lower.indexOf(METRICS[k].fields.toLowerCase()) >= 0; });
    if (!metrics.length) return { ok: false, errors: ['אין אף עמודת פעולה מוכרת (למשל progPass, counterpress, crosses)'], rows: [], metrics: [] };
    const errors = [];
    const rows = [];
    lines.slice(1).forEach(function (line, i) {
      const cells = splitCsvLine(line);
      const get = function (k) { const j = lower.indexOf(k.toLowerCase()); return j >= 0 ? cells[j] : undefined; };
      const row = {
        name: get('name'), team: get('team'), position: get('position'),
        minutes: Number(get('minutes')), matchId: get('matchId') || null, playerId: get('playerId') || null
      };
      if (!row.name || !Number.isFinite(row.minutes) || row.minutes <= 0) { errors.push('שורה ' + (i + 2) + ': חסר שם או דקות'); return; }
      if (!roleOf(row.position) || roleOf(row.position) === 'GK') { errors.push('שורה ' + (i + 2) + ': עמדה לא מוכרת «' + row.position + '» (השתמשו בשמות StatsBomb, למשל Center Back)'); return; }
      let bad = false;
      metrics.forEach(function (k) {
        const v = Number(get(METRICS[k].fields));
        if (!Number.isFinite(v) || v < 0) bad = true;
        row[METRICS[k].fields] = Number.isFinite(v) ? v : 0;
      });
      if (bad) errors.push('שורה ' + (i + 2) + ': ערך פעולה לא מספרי — נספר כ-0');
      rows.push(row);
    });
    return { ok: rows.length > 0, errors: errors, rows: rows, metrics: metrics };
  }

  // Players from the user's file, team profile from sliders or from a team
  // in the Open Data file. Percentiles are inside the user's own pool.
  function buildUserModel(parsed, teams, stats, openDataRows) {
    const players = playerProfiles(aggregatePlayers(parsed.rows, parsed.metrics), { metrics: parsed.metrics, poolMinutes: 0 });
    let provenance = USER_PROVENANCE;
    if (openDataRows && openDataRows.length) {
      const known = new Set(openDataRows.map(function (r) { return r.name + '|' + r.team; }));
      const hits = parsed.rows.filter(function (r) { return known.has(r.name + '|' + r.team); }).length;
      if (hits >= Math.max(3, parsed.rows.length * 0.5)) provenance = PROVENANCE;
    }
    return { players: players, teams: teams, stats: stats, metrics: parsed.metrics, provenance: provenance };
  }

  const EXAMPLE_CSV = [
    'name,team,position,minutes,progPass,progPassUP,buildUpPass,longPass,aerialsWon,clearances,tacklesInt,defActHigh,progCarry,counterpress,pressAtt,npxg,boxTouches,headedShots,receivedCross,receivedThrough,xA,dribbles,setPieceShots',
    'בלם מסיר א,מועדון הדוגמה,Left Center Back,900,70,18,160,25,30,40,20,60,12,6,0,0.3,8,3,0,0,0.1,1,4',
    'בלם אווירי ב,מועדון הדוגמה,Right Center Back,850,30,4,70,40,70,85,24,35,4,4,0,0.9,15,8,0,0,0.05,0,9',
    'בלם לוחץ ג,מועדון אחר,Center Back,780,45,9,110,20,35,30,30,95,9,14,2,0.2,6,2,0,0,0.1,2,2',
    'חלוץ לוחץ ד,מועדון אחר,Center Forward,820,15,3,2,3,20,4,6,70,15,40,55,4.8,120,6,5,4,1.1,10,3',
    'חלוץ רחבה ה,מועדון הדוגמה,Center Forward,900,8,1,1,2,55,6,3,30,6,10,18,6.2,160,22,18,2,0.6,4,8',
    'חלוץ עומק ו,מועדון שלישי,Center Forward,700,10,2,1,1,12,2,4,40,20,18,30,4.1,95,3,2,14,0.9,16,1'
  ].join('\n');

  function loadData(fetchImpl) {
    const load = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!load) return Promise.reject(new Error('fetch unavailable'));
    return load(DATA_PATH).then(function (res) {
      if (!res.ok) throw new Error(DATA_PATH + ' ' + res.status);
      return res.json();
    });
  }

  return {
    DATA_PATH: DATA_PATH,
    PROVENANCE: PROVENANCE,
    USER_PROVENANCE: USER_PROVENANCE,
    STYLE_DIMS: STYLE_DIMS,
    DIM_IDS: DIM_IDS,
    METRICS: METRICS,
    METRIC_IDS: METRIC_IDS,
    ROLES: ROLES,
    ROLE_IDS: ROLE_IDS,
    SPLITS: SPLITS,
    PRIOR_MINUTES: PRIOR_MINUTES,
    HALF_MINUTES: HALF_MINUTES,
    EXAMPLE_CSV: EXAMPLE_CSV,
    roleOf: roleOf,
    spearman: spearman,
    percentile: percentile,
    teamProfiles: teamProfiles,
    formatDimValue: formatDimValue,
    rawFromZ: rawFromZ,
    aggregatePlayers: aggregatePlayers,
    playerProfiles: playerProfiles,
    neutralZ: neutralZ,
    weightsFor: weightsFor,
    fitScore: fitScore,
    reasonsFor: reasonsFor,
    buildModel: buildModel,
    teamZ: teamZ,
    shortlist: shortlist,
    teamStability: teamStability,
    fitStability: fitStability,
    ownTeamRecognition: ownTeamRecognition,
    listDiversity: listDiversity,
    parseUserCsv: parseUserCsv,
    buildUserModel: buildUserModel,
    loadData: loadData
  };
}));
