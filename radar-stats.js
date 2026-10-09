(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else root.ScoutAIRadarStats = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Split for review size: radar-stats.js -> radar.js (load in that order); radar.js is the public module.

  // «רדאר תופעות» — which tactical metrics changed between tournaments in the
  // open data, by how much, with what uncertainty, and which players were
  // already doing the «new» thing in the earlier tournament.
  //
  // Pre-registered in code before looking at any result (do not tune):
  //   the 14 metrics and their definitions (tools/build-radar.js), the two
  //   tournament pairs (discovery: WC2018→WC2022; replication:
  //   Euro 2020→Euro 2024), the match-cluster bootstrap (2,000 draws, 95%
  //   percentile interval), the verdict rule, the placebo check and the
  //   exemplar rule (180+ minutes, shrinkage, top 5 in the direction of change).

  const DATA_PATH = 'data/radar_tournaments.json';
  const BOOTSTRAP_REPS = 2000;
  const BOOTSTRAP_SEED = 20260929;
  const MIN_EXEMPLAR_MINUTES = 180;
  const SHRINK_MINUTES = 180;   // pseudo-minutes at the pool rate
  const SHRINK_COUNT = 20;      // pseudo-events at the pool share / mean

  const PAIRS = Object.freeze([
    Object.freeze({ id: 'discovery', from: 'wc2018', to: 'wc2022', label: 'גילוי: מונדיאל 2018 ← מונדיאל 2022' }),
    Object.freeze({ id: 'replication', from: 'euro2020', to: 'euro2024', label: 'שחזור: יורו 2020 ← יורו 2024' })
  ]);

  function f(name) { return function (r) { return Number(r[name]) || 0; }; }

  // kind: rate = per 90 minutes; share = % of a denominator; mean = average.
  // player: how the same idea is measured for one player (null = team only).
  const METRICS = Object.freeze([
    { id: 'passesPer90', label: 'מסירות ל-90', kind: 'rate', num: f('passes'), den: f('minutes'), trend: 'fewerPasses',
      help: 'כל המסירות של הקבוצה, ל-90 דקות שעון.',
      player: { label: 'מסירות ל-90', kind: 'rate', num: 'passes', den: 'minutes' } },
    { id: 'openLongShare', label: 'שיעור כדורים ארוכים (משחק פתוח)', kind: 'share', num: f('openLong'), den: f('openPasses'), trend: 'longBalls',
      help: 'מסירות של 35 יארד (כ-32 מ׳) ומעלה מתוך מסירות משחק פתוח (בלי קרנות, חופשיות, בעיטות שער, זריקות, פתיחות).',
      player: { label: 'שיעור כדורים ארוכים', kind: 'share', num: 'openLong', den: 'openPasses', minDen: 60 } },
    { id: 'passLength', label: 'אורך מסירה ממוצע (יארד)', kind: 'mean', num: f('openPassLenSum'), den: f('openPasses'), trend: 'longBalls',
      help: 'אורך ממוצע של מסירת משחק פתוח, ביארדים.',
      player: { label: 'אורך מסירה ממוצע', kind: 'mean', num: 'openPassLenSum', den: 'openPasses', minDen: 60 } },
    { id: 'gkLongShare', label: 'שוער: שיעור מסירות ארוכות', kind: 'share', num: f('gkLong'), den: f('gkPasses'), trend: 'gkLong',
      help: 'מסירות של השוער באורך 35+ יארד, מתוך כל מסירות השוער (כולל בעיטות שער).',
      player: { label: 'שוער: שיעור מסירות ארוכות', kind: 'share', num: 'gkLong', den: 'gkPasses', minDen: 30, group: 'GK' } },
    { id: 'goalKickLongShare', label: 'בעיטות שער ארוכות', kind: 'share', num: f('goalKicksLong'), den: f('goalKicks'), trend: 'gkLong',
      help: 'בעיטות שער באורך 35+ יארד מתוך כל בעיטות השער.',
      player: { label: 'בעיטות שער ארוכות', kind: 'share', num: 'goalKicksLong', den: 'goalKicks', minDen: 10, group: 'GK' } },
    { id: 'pressPer90', label: 'לחצים ל-90', kind: 'rate', num: f('pressures'), den: f('minutes'), trend: 'manPress',
      help: 'אירועי Pressure של StatsBomb (שחקן סוגר על מחזיק הכדור), ל-90 דקות.',
      caution: 'ספירת לחצים רגישה לשיטת הקידוד: במונדיאל 2022 נרשמו כ-31% פחות לחצים למשחק מאשר ב-2018 — גדול מדי לשינוי טקטי בלבד. ייתכן שינוי בקידוד של StatsBomb; לא אומת. השוו עם השיעורים (שליש התקפה, לחץ-נגד), שפחות רגישים לזה.',
      player: { label: 'לחצים ל-90', kind: 'rate', num: 'pressures', den: 'minutes' } },
    { id: 'highPressShare', label: 'שיעור לחץ בשליש ההתקפה', kind: 'share', num: f('highPress'), den: f('pressures'), trend: 'manPress',
      help: 'לחצים בשליש הקדמי (x ≥ 80) מתוך כל הלחצים.',
      player: { label: 'לחצים בשליש ההתקפה ל-90', kind: 'rate', num: 'highPress', den: 'minutes' } },
    { id: 'counterpressShare', label: 'שיעור לחץ-נגד', kind: 'share', num: f('counterpress'), den: f('pressures'), trend: null,
      help: 'לחצים שסומנו counterpress (תוך 5 שניות מאיבוד כדור) מתוך כל הלחצים.',
      player: { label: 'לחץ-נגד ל-90', kind: 'rate', num: 'counterpress', den: 'minutes' } },
    { id: 'ppda', label: 'PPDA (נמוך = לחץ גבוה יותר)', kind: 'mean', num: f('oppPassesOwn60'), den: f('defActionsHigh'), trend: 'manPress',
      help: 'מסירות היריב ב-60% השטח שלו, חלקי תיקולים+חטיפות+עבירות שלנו באותו אזור. מדד קבוצתי בלבד.',
      caution: 'PPDA עולה = פחות פעולות הגנה לכל מסירה של היריב, כלומר לחץ פחות אגרסיבי במובן הזה.',
      player: null },
    { id: 'crossesPer90', label: 'הגבהות ל-90', kind: 'rate', num: f('crosses'), den: f('minutes'), trend: null,
      help: 'מסירות שסומנו cross במשחק פתוח, ל-90 דקות.',
      player: { label: 'הגבהות ל-90', kind: 'rate', num: 'crosses', den: 'minutes' } },
    { id: 'longThrowsPer90', label: 'זריקות ארוכות לרחבה ל-90', kind: 'rate', num: f('longThrows'), den: f('minutes'), trend: 'longThrows',
      help: 'זריקת חוץ של 22+ יארד (כ-20 מ׳) שמסתיימת ברחבה.',
      player: { label: 'זריקות ארוכות לרחבה ל-90', kind: 'rate', num: 'longThrows', den: 'minutes' } },
    { id: 'shortCornerShare', label: 'שיעור קרנות קצרות', kind: 'share', num: f('shortCorners'), den: f('corners'), trend: 'corners',
      help: 'קרן שנקודת הסיום שלה מחוץ לרחבה, מתוך כל הקרנות.',
      player: { label: 'שיעור קרנות קצרות', kind: 'share', num: 'shortCorners', den: 'corners', minDen: 6 } },
    { id: 'setPieceXgShare', label: 'חלק המצבים הנייחים ב-xG', kind: 'share', num: f('spXg'), den: f('npxg'), trend: 'setPieces',
      help: 'xG בלי פנדלים שנוצר ממהלך שהתחיל בקרן, בעיטה חופשית או זריקה — מתוך כל ה-xG בלי פנדלים.',
      player: { label: 'xG ממצבים נייחים ל-90', kind: 'rate', num: 'spXg', den: 'minutes' } },
    { id: 'shotDistance', label: 'מרחק בעיטה ממוצע (יארד)', kind: 'mean', num: f('shotDistSum'), den: f('npShots'), trend: null,
      help: 'מרחק ממוצע של בעיטה (בלי פנדלים) ממרכז השער.',
      player: { label: 'מרחק בעיטה ממוצע', kind: 'mean', num: 'shotDistSum', den: 'npShots', minDen: 5 } }
  ].map(Object.freeze));

  // «What is changing in football 2025–2026» — each item has a source link
  // and a publication date; «metric» ties it to a radar metric when one exists.
  const WEB_TRENDS = Object.freeze([
    { id: 'setPieces', title: 'יותר שערים ממצבים נייחים',
      text: 'בפרמייר ליג 2025/26 כ-28%–30% מהשערים (בלי פנדלים) הגיעו ממצבים נייחים, לעומת 20.6% ב-2024/25 ו-19.8% ב-2023/24.',
      source: 'Opta Analyst', date: '2026-01-16', url: 'https://theanalyst.com/articles/premier-league-teams-still-more-direct-2025-26', metric: 'setPieceXgShare' },
    { id: 'longThrows', title: 'חזרת הזריקה הארוכה',
      text: 'כ-4 זריקות ארוכות (20+ מ׳) לרחבה למשחק, יותר מפי שניים מכל עונה קודמת (1.52 ב-2024/25); שער מזריקה ארוכה בערך כל 11–12 משחקים לעומת כל 27.',
      source: 'Opta Analyst', date: '2026-01-16', url: 'https://theanalyst.com/articles/premier-league-teams-still-more-direct-2025-26', metric: 'longThrowsPer90' },
    { id: 'gkLong', title: 'שוערים חוזרים לבעוט ארוך',
      text: 'אחרי עשור של ירידה, 51.9% ממסירות השוערים ארוכות (32+ מ׳) לעומת 47.0% ב-2024/25 — תגובה ללחץ גבוה ליד השער.',
      source: 'Opta Analyst', date: '2025-09-12', url: 'https://theanalyst.com/articles/premier-league-2025-26-trends-tactics-long-throws-long-balls-kick-offs', metric: 'gkLongShare' },
    { id: 'fewerPasses', title: 'פחות מסירות, יותר כדורים ארוכים',
      text: '873 מסירות למשחק — הנמוך מאז 2012/13 (893 ב-2024/25, 941 ב-2023/24); כדורים ארוכים עלו מ-93.4 ל-99.6 למשחק.',
      source: 'Opta Analyst', date: '2026-01-16', url: 'https://theanalyst.com/articles/premier-league-teams-still-more-direct-2025-26', metric: 'passesPer90' },
    { id: 'corners', title: 'קרנות לתוך הרחבה, «חומה» ברחבת 5',
      text: 'שיעור הקרנות הקצרות ירד מ-18% ל-11.3%; מספר התוקפים ברחבת ה-5 בקרנות עלה בכ-70% בשתי עונות (לפי David Reed, מצוטט אצל Caley).',
      source: 'Opta Analyst; Michael Caley, Expecting Goals', date: '2026-01-16 / 2026-04-01', url: 'https://www.expectinggoals.com/p/the-origins-of-the-set-piece-revolution', metric: 'shortCornerShare' },
    { id: 'manPress', title: 'לחץ אדם-על-אדם מכריח לשחק מעל הלחץ',
      text: 'יותר קבוצות לוחצות אדם-על-אדם, ולכן גם קבוצות «פוזיציוניות» בוחרות בכדור ארוך. בליגת האלופות 2024/25 ארסנל עצרה 42% מניסיונות היציאה של היריב מהשליש שלו.',
      source: 'Training Ground Guru (Jamie Hamilton); UEFA Technical Report', date: '2025-11-04 / 2025-09-15', url: 'https://trainingground.guru/set-pieces-long-balls-and-target-men-the-journey-from-positionism/', metric: 'pressPer90' },
    { id: 'ballInPlay', title: 'פחות זמן כדור במשחק',
      text: 'הכדור היה במשחק 54.8% מזמן המשחק — הנמוך ביותר שנמדד בפרמייר ליג; זריקות חוץ לוקחות 11:21 דקות למשחק לעומת 8:50 קודם.',
      source: 'Opta Analyst', date: '2025-10-29', url: 'https://theanalyst.com/articles/premier-league-delays-set-piece-throw-in-stats', metric: null }
  ].map(Object.freeze));

  const TREND_CHECKED = '2026-09-29';

  function positionGroup(position) {
    const text = String(position || '');
    if (/goalkeeper/i.test(text)) return 'GK';
    if (/midfield/i.test(text)) return 'MF';
    if (/back|defen/i.test(text)) return 'DF';
    if (/forward|wing|striker/i.test(text)) return 'FW';
    return 'OT';
  }

  // Compact arrays -> objects.
  function decode(dataset) {
    const d = dataset || {};
    function rows(fields, data) {
      if (!Array.isArray(fields) || !Array.isArray(data)) return [];
      return data.map(function (arr) {
        const o = {};
        fields.forEach(function (k, i) { o[k] = arr[i]; });
        return o;
      });
    }
    const players = rows(d.playerFields, d.playerRows);
    players.forEach(function (p) { p.positionGroup = positionGroup(p.position); });
    return {
      tournaments: Array.isArray(d.tournaments) ? d.tournaments : [],
      teams: rows(d.teamFields, d.teamRows),
      players: players,
      definitions: d.definitions || {}
    };
  }

  function metricById(id) {
    return METRICS.find(function (m) { return m.id === id; }) || null;
  }

  function scaleOf(metric) { return metric.kind === 'rate' ? 90 : metric.kind === 'share' ? 100 : 1; }

  function ratio(rows, metric) {
    let n = 0;
    let d = 0;
    rows.forEach(function (r) { n += metric.num(r); d += metric.den(r); });
    return d > 0 ? n / d * scaleOf(metric) : null;
  }

  function rowValues(rows, metric) {
    const out = [];
    rows.forEach(function (r) {
      const d = metric.den(r);
      if (d > 0) out.push(metric.num(r) / d * scaleOf(metric));
    });
    return out;
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

  function meanSd(values) {
    if (!values.length) return { mean: null, sd: null, n: 0 };
    const mean = values.reduce(function (s, x) { return s + x; }, 0) / values.length;
    const v = values.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / Math.max(1, values.length - 1);
    return { mean: mean, sd: Math.sqrt(v), n: values.length };
  }

  // Hedges' g on team-match values (B minus A).
  function hedgesG(a, b) {
    const A = meanSd(a);
    const B = meanSd(b);
    if (A.n < 2 || B.n < 2) return null;
    const pooled = Math.sqrt(((A.n - 1) * A.sd * A.sd + (B.n - 1) * B.sd * B.sd) / (A.n + B.n - 2));
    if (!(pooled > 0)) return null;
    const J = 1 - 3 / (4 * (A.n + B.n) - 9);
    return (B.mean - A.mean) / pooled * J;
  }

  // Group rows by an id so the bootstrap resamples whole clusters (matches).
  function clusters(rows, key) {
    const map = new Map();
    rows.forEach(function (r) {
      const k = String(r[key || 'matchId']);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return Array.from(map.values());
  }

  function resample(cl, rand) {
    const out = [];
    for (let i = 0; i < cl.length; i += 1) {
      const pick = cl[Math.floor(rand() * cl.length)];
      for (let j = 0; j < pick.length; j += 1) out.push(pick[j]);
    }
    return out;
  }

  // Change of one metric from rows A to rows B with a match-cluster bootstrap.
  function compareMetric(rowsA, rowsB, metric, options) {
    const opts = options || {};
    const reps = opts.reps || BOOTSTRAP_REPS;
    const rand = mulberry32(opts.seed || BOOTSTRAP_SEED);
    const a = ratio(rowsA, metric);
    const b = ratio(rowsB, metric);
    const out = {
      metric: metric.id, a: a, b: b,
      diff: a != null && b != null ? b - a : null,
      rel: a ? (b - a) / Math.abs(a) * 100 : null,
      g: hedgesG(rowValues(rowsA, metric), rowValues(rowsB, metric)),
      nA: clusters(rowsA, opts.clusterKey).length, nB: clusters(rowsB, opts.clusterKey).length,
      ci: null, gCi: null, degenerate: false
    };
    const clA = clusters(rowsA, opts.clusterKey);
    const clB = clusters(rowsB, opts.clusterKey);
    if (out.diff == null || clA.length < 5 || clB.length < 5) { out.degenerate = true; return out; }
    const diffs = [];
    const gs = [];
    for (let i = 0; i < reps; i += 1) {
      const ra = resample(clA, rand);
      const rb = resample(clB, rand);
      const va = ratio(ra, metric);
      const vb = ratio(rb, metric);
      if (va != null && vb != null) diffs.push(vb - va);
      const g = hedgesG(rowValues(ra, metric), rowValues(rb, metric));
      if (g != null) gs.push(g);
    }
    diffs.sort(function (x, y) { return x - y; });
    gs.sort(function (x, y) { return x - y; });
    if (diffs.length < reps * 0.9) { out.degenerate = true; return out; }
    out.ci = [quantile(diffs, 0.025), quantile(diffs, 0.975)];
    out.gCi = gs.length ? [quantile(gs, 0.025), quantile(gs, 0.975)] : null;
    return out;
  }

  // up / down when the 95% interval excludes 0; otherwise «noise».
  function direction(result) {
    if (!result || result.degenerate || !result.ci) return 'noise';
    if (result.ci[0] > 0) return 'up';
    if (result.ci[1] < 0) return 'down';
    return 'noise';
  }

  function sizeLabel(g) {
    if (g == null) return 'לא חושב';
    const x = Math.abs(g);
    if (x < 0.2) return 'זניח';
    if (x < 0.5) return 'קטן';
    if (x < 0.8) return 'בינוני';
    return 'גדול';
  }

  // Verdict per metric across both pairs (pre-registered):
  //   confirmed = both intervals exclude 0 in the same direction
  //   conflict  = both exclude 0, opposite directions
  //   hint      = only one pair excludes 0
  //   noise     = neither does
  function verdict(dirs) {
    const moving = dirs.filter(function (d) { return d !== 'noise'; });
    if (!moving.length) return { id: 'noise', dir: null };
    if (moving.length === dirs.length) {
      const same = moving.every(function (d) { return d === moving[0]; });
      return same ? { id: 'confirmed', dir: moving[0] } : { id: 'conflict', dir: null };
    }
    return { id: 'hint', dir: moving[0] };
  }

  const VERDICT_LABELS = Object.freeze({
    confirmed: 'תופעה משוחזרת',
    hint: 'רמז — רק בזוג אחד',
    conflict: 'סותר בין הזוגות',
    noise: 'בתוך הרעש'
  });

  return { DATA_PATH, BOOTSTRAP_REPS, BOOTSTRAP_SEED, MIN_EXEMPLAR_MINUTES, SHRINK_MINUTES,
    SHRINK_COUNT, PAIRS, f, METRICS, WEB_TRENDS, TREND_CHECKED, positionGroup, decode, metricById,
    scaleOf, ratio, rowValues, mulberry32, quantile, meanSd, hedgesG, clusters, resample,
    compareMetric, direction, sizeLabel, verdict, VERDICT_LABELS };
}));
