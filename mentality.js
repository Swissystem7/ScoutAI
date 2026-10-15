(function (root, factory) {
  const demo = (typeof module === 'object' && module.exports)
    ? require('./demo.js')
    : root.ScoutAIDemo;
  const api = factory(demo);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIMentality = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Demo) {
  'use strict';

  // «מדד מנטליות» — a behavioural index from on-pitch event data only.
  // It does not read faces, personality or character. Every component is a
  // count or a rate from StatsBomb Open Data events, per player per match
  // (data/wc2018_mentality_matches.json, built by tools/build-mentality.js).
  //
  // Pre-registered before looking at any test result (do not tune on test):
  //   components, shrinkage constants, equal weights, eligibility thresholds,
  //   the two splits, the two outcomes and the verdict rule below.

  const DATA_PATH = 'data/wc2018_mentality_matches.json';
  const PROVENANCE = 'STATSBOMB_OPEN_DATA';

  const SHRINK_MINUTES = 60;     // minutes-in-state that give half weight
  const SHRINK_MISTAKES = 5;     // pseudo-mistakes toward the pool rate
  const MIN_MATCH_MINUTES = 30;  // a match counts for consistency from here
  const MIN_TRAIN_MINUTES = 90;  // eligibility for the index in a split
  const BOOTSTRAP_REPS = 1000;
  const BOOTSTRAP_SEED = 20260929;

  const COMPONENTS = Object.freeze([
    Object.freeze({
      id: 'trailing',
      label: 'תגובה לפיגור',
      short: 'פיגור',
      definition: 'קצב הפעולות של השחקן כשהקבוצה בפיגור, יחסית לקצב שלו כשהיא בתיקו או ביתרון — פחות אותו יחס של הקבוצה כולה. מכווץ לאפס כשיש מעט דקות בפיגור.',
      fields: 'actTrailing, minTrailing, actLevel+actLeading, minLevel+minLeading'
    }),
    Object.freeze({
      id: 'counterpress',
      label: 'לחץ-נגד ל-90',
      short: 'לחץ-נגד',
      definition: 'פעולות לחץ שסומנו ב-StatsBomb כ-counterpress — תוך 5 שניות מאיבוד כדור של הקבוצה — ל-90 דקות.',
      fields: 'counterpress, minutes'
    }),
    Object.freeze({
      id: 'late',
      label: 'עצימות מאוחרת (75+)',
      short: '75+',
      definition: 'קצב הפעולות מדקה 75 (כולל הארכה) חלקי הקצב של השחקן עצמו בדקות 0–60, פחות אותו יחס של הקבוצה. מכווץ לאפס כשיש מעט דקות.',
      fields: 'actLate, minLate, actEarly, minEarly'
    }),
    Object.freeze({
      id: 'reaction',
      label: 'תגובה לטעות עצמית',
      short: 'אחרי טעות',
      definition: 'שיעור הפעמים שאחרי איבוד כדור של השחקן עצמו (Dispossessed / Miscontrol / כדרור שנכשל) הוא עצמו מבצע לחץ, דו-קרב, חטיפה או השבת כדור תוך 5 שניות. מכווץ לשיעור הכללי.',
      fields: 'mistakesReacted, mistakes'
    }),
    Object.freeze({
      id: 'consistency',
      label: 'עקביות בין משחקים',
      short: 'עקביות',
      definition: '1 פחות מקדם השונות של פעולות-ל-90 בין משחקים (רק משחקים עם 30+ דקות). מכווץ לממוצע כשיש מעט משחקים.',
      fields: 'actions, minutes (per match)'
    })
  ]);

  const COMPONENT_IDS = COMPONENTS.map(function (c) { return c.id; });

  const SPLITS = Object.freeze({
    temporal: Object.freeze({
      id: 'temporal',
      label: 'זמני: משחקים 1–2 של כל נבחרת (אימון) ← משחק 3 ואילך (מבחן)',
      isTrain: function (row) { return row.teamMatchNo <= 2; }
    }),
    oddEven: Object.freeze({
      id: 'oddEven',
      label: 'חצי-מדגם: משחקים אי-זוגיים של כל נבחרת (אימון) ← זוגיים (מבחן)',
      isTrain: function (row) { return row.teamMatchNo % 2 === 1; }
    })
  });

  const OUTCOMES = Object.freeze({
    trailing: Object.freeze({
      id: 'trailing',
      label: 'תגובה לפיגור במשחקים המוחזקים',
      component: 'trailing',
      why: 'אם «לא מוותר» היא תכונה יציבה, מי שהגביר קצב בפיגור במשחקים הראשונים צריך להגביר גם במשחקים הבאים — יותר מחברי קבוצתו.',
      eligible: function (p) { return p.minTrailing >= 15 && (p.minutes - p.minTrailing) >= 45; }
    }),
    late: Object.freeze({
      id: 'late',
      label: 'עצימות 75+ מול 0–60 במשחקים המוחזקים',
      component: 'late',
      why: 'אם «לא נגמר הדלק המנטלי» היא תכונה יציבה, מי ששמר על קצב בסוף המשחקים הראשונים צריך לשמור גם בהמשך.',
      eligible: function (p) { return p.minLate >= 10 && p.minEarly >= 30; }
    })
  });

  function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
  function round2(x) { return Math.round(Number(x) * 100) / 100; }
  function round1(x) { return Math.round(Number(x) * 10) / 10; }
  function rate(count, minutes) { return minutes > 0 ? count * 90 / minutes : null; }

  function positionGroup(position) {
    return Demo.positionGroup(position);
  }

  const SUM_FIELDS = Object.freeze([
    'minutes', 'minTrailing', 'minLevel', 'minLeading', 'minEarly', 'minLate',
    'actions', 'actTrailing', 'actLevel', 'actLeading', 'actEarly', 'actLate',
    'counterpress', 'mistakes', 'mistakesReacted', 'teamGoalsFor', 'teamGoalsAgainst',
    'pressures', 'tackles', 'interceptions', 'defensiveActions', 'progressiveActions',
    'keyPasses', 'passesCompleted', 'shotXgSum', 'boxTouches', 'shotsOnTarget',
    'shots', 'goals', 'assists'
  ]);

  function matchRows(dataset) {
    if (Array.isArray(dataset)) return dataset;
    return dataset && Array.isArray(dataset.rows) ? dataset.rows : [];
  }

  // Sum per-match rows into one row per player (outfield only).
  function aggregatePlayers(rows) {
    const byId = new Map();
    rows.forEach(function (r) {
      const group = positionGroup(r.position);
      if (group === 'GK') return;
      const key = String(r.playerId);
      if (!byId.has(key)) {
        const base = { id: key, name: r.name, team: r.team, positionCounts: {}, matches: [] };
        SUM_FIELDS.forEach(function (f) { base[f] = 0; });
        byId.set(key, base);
      }
      const p = byId.get(key);
      SUM_FIELDS.forEach(function (f) { p[f] += num(r[f]); });
      p.positionCounts[r.position] = (p.positionCounts[r.position] || 0) + num(r.minutes);
      p.matches.push({ matchId: r.matchId, minutes: num(r.minutes), actions: num(r.actions) });
    });
    return Array.from(byId.values()).map(function (p) {
      const position = Object.keys(p.positionCounts).sort(function (a, b) {
        return p.positionCounts[b] - p.positionCounts[a];
      })[0] || '';
      delete p.positionCounts;
      p.position = position;
      p.positionGroup = positionGroup(position);
      return p;
    });
  }

  function teamPools(players) {
    const pools = {};
    players.forEach(function (p) {
      if (!pools[p.team]) pools[p.team] = { actTrailing: 0, minTrailing: 0, actNon: 0, minNon: 0, actLate: 0, minLate: 0, actEarly: 0, minEarly: 0 };
      const t = pools[p.team];
      t.actTrailing += p.actTrailing; t.minTrailing += p.minTrailing;
      t.actNon += p.actLevel + p.actLeading; t.minNon += p.minLevel + p.minLeading;
      t.actLate += p.actLate; t.minLate += p.minLate;
      t.actEarly += p.actEarly; t.minEarly += p.minEarly;
    });
    return pools;
  }

  function ratio(aCount, aMin, bCount, bMin) {
    const a = rate(aCount, aMin);
    const b = rate(bCount, bMin);
    if (a == null || b == null || b <= 0) return null;
    return a / b;
  }

  function trailingRaw(p, t) {
    const own = ratio(p.actTrailing, p.minTrailing, p.actLevel + p.actLeading, p.minLevel + p.minLeading);
    const team = ratio(t.actTrailing, t.minTrailing, t.actNon, t.minNon);
    if (own == null || team == null) return null;
    return own - team;
  }

  function lateRaw(p, t) {
    const own = ratio(p.actLate, p.minLate, p.actEarly, p.minEarly);
    const team = ratio(t.actLate, t.minLate, t.actEarly, t.minEarly);
    if (own == null || team == null) return null;
    return own - team;
  }

  function shrinkWeight(minutesA, minutesB) {
    return (minutesA / (minutesA + SHRINK_MINUTES)) * (minutesB / (minutesB + SHRINK_MINUTES));
  }

  function consistencyRaw(p) {
    const rates = p.matches
      .filter(function (m) { return m.minutes >= MIN_MATCH_MINUTES; })
      .map(function (m) { return m.actions * 90 / m.minutes; });
    if (rates.length < 2) return { value: null, n: rates.length };
    const mean = rates.reduce(function (s, x) { return s + x; }, 0) / rates.length;
    const sd = Math.sqrt(rates.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / (rates.length - 1));
    return { value: mean > 0 ? 1 - sd / mean : null, n: rates.length };
  }

  // Raw (pre-z) component values for each player, from a set of match rows.
  function computeComponents(rows) {
    const players = aggregatePlayers(rows);
    const pools = teamPools(players);
    let poolMistakes = 0;
    let poolReacted = 0;
    players.forEach(function (p) { poolMistakes += p.mistakes; poolReacted += p.mistakesReacted; });
    const p0 = poolMistakes ? poolReacted / poolMistakes : 0;
    const consistency = players.map(consistencyRaw);
    const consValues = consistency.map(function (c) { return c.value; }).filter(function (v) { return v != null; });
    const consMean = consValues.length ? consValues.reduce(function (s, x) { return s + x; }, 0) / consValues.length : 0;

    return players.map(function (p, i) {
      const t = pools[p.team];
      const trail = trailingRaw(p, t);
      const late = lateRaw(p, t);
      const cons = consistency[i];
      const consW = cons.n >= 2 ? (cons.n - 1) / (cons.n + 1) : 0;
      const raw = {
        trailing: trail == null ? 0 : trail * shrinkWeight(p.minTrailing, p.minLevel + p.minLeading),
        counterpress: rate(p.counterpress, p.minutes) || 0,
        late: late == null ? 0 : late * shrinkWeight(p.minLate, p.minEarly),
        reaction: (p.mistakesReacted + SHRINK_MISTAKES * p0) / (p.mistakes + SHRINK_MISTAKES),
        consistency: cons.value == null ? consMean : consW * cons.value + (1 - consW) * consMean
      };
      return Object.assign(p, {
        raw: raw,
        unshrunk: { trailing: trail, late: late, consistency: cons.value, consistencyMatches: cons.n },
        actions90: rate(p.actions, p.minutes) || 0
      });
    });
  }

  function meanSd(values) {
    if (!values.length) return { mean: 0, sd: 1 };
    const mean = values.reduce(function (s, x) { return s + x; }, 0) / values.length;
    const v = values.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / Math.max(1, values.length - 1);
    return { mean: mean, sd: Math.sqrt(v) || 1 };
  }

  function percentileWithin(value, peers) {
    if (!peers.length) return 50;
    let below = 0;
    peers.forEach(function (x) { if (x <= value) below += 1; });
    return round1(below / peers.length * 100);
  }

  // Equal weights, z-scored within position group (DF / MF / FW), then the
  // mean z is shown as a percentile inside the same group.
  function scoreIndex(players, options) {
    const minMinutes = options && options.minMinutes != null ? options.minMinutes : MIN_TRAIN_MINUTES;
    const eligible = players.filter(function (p) { return p.minutes >= minMinutes && p.positionGroup !== 'GK'; });
    const groups = {};
    eligible.forEach(function (p) { (groups[p.positionGroup] = groups[p.positionGroup] || []).push(p); });
    Object.keys(groups).forEach(function (g) {
      const peers = groups[g];
      const stats = {};
      COMPONENT_IDS.forEach(function (id) { stats[id] = meanSd(peers.map(function (p) { return p.raw[id]; })); });
      peers.forEach(function (p) {
        p.z = {};
        COMPONENT_IDS.forEach(function (id) { p.z[id] = round2((p.raw[id] - stats[id].mean) / stats[id].sd); });
        p.meanZ = COMPONENT_IDS.reduce(function (s, id) { return s + p.z[id]; }, 0) / COMPONENT_IDS.length;
      });
      const zs = peers.map(function (p) { return p.meanZ; });
      peers.forEach(function (p) {
        p.index = percentileWithin(p.meanZ, zs);
        p.componentPct = {};
        COMPONENT_IDS.forEach(function (id) {
          p.componentPct[id] = percentileWithin(p.raw[id], peers.map(function (q) { return q.raw[id]; }));
        });
      });
    });
    return eligible.sort(function (a, b) { return b.index - a.index || b.meanZ - a.meanZ; });
  }

  // The main lab's Impact (40/30/30, same caps) on the same match subset,
  // so the comparison is fair: both metrics see only the training matches.
  function impactFromRows(player) {
    const prepared = Demo.preparePlayer({
      name: player.name, team: player.team, position: player.position,
      minutes: player.minutes,
      pressures: player.pressures, tackles: player.tackles, interceptions: player.interceptions,
      defensiveActions: player.defensiveActions, progressiveActions: player.progressiveActions,
      keyPasses: player.keyPasses, passesCompleted: player.passesCompleted,
      shotXgSum: player.shotXgSum, boxTouches: player.boxTouches, shotsOnTarget: player.shotsOnTarget
    }, { provenance: PROVENANCE });
    return Demo.compositeScore(prepared.components, { grit: 40, involvement: 30, clutch: 30 });
  }

  function buildTournament(dataset, options) {
    const players = scoreIndex(computeComponents(matchRows(dataset)), options);
    players.forEach(function (p) { p.impact = impactFromRows(p); });
    return players;
  }

  // ---- statistics ----------------------------------------------------------

  function spearman(xs, ys) {
    if (!xs || xs.length < 3) return null;
    const rx = Demo.rankValues(xs);
    const ry = Demo.rankValues(ys);
    const n = xs.length;
    let mx = 0; let my = 0;
    for (let i = 0; i < n; i += 1) { mx += rx[i]; my += ry[i]; }
    mx /= n; my /= n;
    let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = rx[i] - mx; const dy = ry[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (!sxx || !syy) return 0;
    return sxy / Math.sqrt(sxx * syy);
  }

  // AUC of a score for a binary label (Mann-Whitney, ties = 0.5).
  function auc(scores, labels) {
    const ranks = Demo.rankValues(scores);
    let pos = 0; let neg = 0; let sumPos = 0;
    for (let i = 0; i < labels.length; i += 1) {
      if (labels[i]) { pos += 1; sumPos += ranks[i]; } else neg += 1;
    }
    if (!pos || !neg) return null;
    return (sumPos - pos * (pos + 1) / 2) / (pos * neg);
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

  function median(values) {
    return quantile(values.slice().sort(function (a, b) { return a - b; }), 0.5);
  }

  const PREDICTORS = Object.freeze([
    Object.freeze({ id: 'index', label: 'מדד מנטליות (אימון)', kind: 'index' }),
    Object.freeze({ id: 'component', label: 'הרכיב המקביל לבדו (אימון)', kind: 'index' }),
    Object.freeze({ id: 'minutes', label: 'דקות משחק (אימון)', kind: 'baseline' }),
    Object.freeze({ id: 'impact', label: 'Impact 40/30/30 (אימון)', kind: 'baseline' }),
    Object.freeze({ id: 'actions90', label: 'פעולות ל-90 (אימון)', kind: 'baseline' })
  ]);

  // Hold-out validation. Index and baselines use only training matches; the
  // outcome uses only test matches. The label for AUC = outcome above the
  // test median.
  function validate(dataset, options) {
    const opts = options || {};
    const split = SPLITS[opts.splitId] || SPLITS.temporal;
    const outcome = OUTCOMES[opts.outcomeId] || OUTCOMES.trailing;
    const reps = opts.reps || BOOTSTRAP_REPS;
    const rows = matchRows(dataset);
    const trainRows = rows.filter(split.isTrain);
    const testRows = rows.filter(function (r) { return !split.isTrain(r); });

    const train = scoreIndex(computeComponents(trainRows), { minMinutes: MIN_TRAIN_MINUTES });
    const trainById = {};
    train.forEach(function (p) { trainById[p.id] = p; });
    const testPlayers = computeComponents(testRows);

    const sample = [];
    testPlayers.forEach(function (q) {
      const p = trainById[q.id];
      if (!p || !outcome.eligible(q)) return;
      const y = outcome.id === 'trailing' ? q.unshrunk.trailing : q.unshrunk.late;
      if (y == null || !Number.isFinite(y)) return;
      sample.push({
        id: p.id, name: p.name, team: p.team, positionGroup: p.positionGroup, y: y,
        x: {
          index: p.meanZ,
          component: p.z[outcome.component],
          minutes: p.minutes,
          impact: impactFromRows(p),
          actions90: p.actions90
        }
      });
    });

    const n = sample.length;
    const ys = sample.map(function (s) { return s.y; });
    const cut = median(ys);
    const labels = ys.map(function (y) { return y > cut; });
    function stats(idx) {
      const y = idx.map(function (i) { return ys[i]; });
      const yMed = median(y);
      const lab = y.map(function (v) { return v > yMed; });
      const out = {};
      PREDICTORS.forEach(function (pr) {
        const x = idx.map(function (i) { return sample[i].x[pr.id]; });
        out[pr.id] = { rho: spearman(x, y), auc: auc(x, lab) };
      });
      return out;
    }
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    const point = stats(all);
    // keep the point AUC on the full-sample median label
    PREDICTORS.forEach(function (pr) {
      point[pr.id].auc = auc(sample.map(function (s) { return s.x[pr.id]; }), labels);
    });

    const rand = mulberry32(BOOTSTRAP_SEED + (split.id === 'oddEven' ? 1 : 0) + (outcome.id === 'late' ? 2 : 0));
    const boot = {};
    PREDICTORS.forEach(function (pr) { boot[pr.id] = { rho: [], auc: [] }; });
    const diffs = { minutes: [], impact: [], actions90: [] };
    for (let b = 0; b < reps && n >= 10; b += 1) {
      const idx = [];
      for (let i = 0; i < n; i += 1) idx.push(Math.floor(rand() * n));
      const s = stats(idx);
      PREDICTORS.forEach(function (pr) {
        if (s[pr.id].rho != null) boot[pr.id].rho.push(s[pr.id].rho);
        if (s[pr.id].auc != null) boot[pr.id].auc.push(s[pr.id].auc);
      });
      Object.keys(diffs).forEach(function (k) {
        if (s.index.rho != null && s[k].rho != null) diffs[k].push(s.index.rho - s[k].rho);
      });
    }
    function ci(values) {
      const sorted = values.slice().sort(function (a, b) { return a - b; });
      return [round2(quantile(sorted, 0.025)), round2(quantile(sorted, 0.975))];
    }
    const predictors = PREDICTORS.map(function (pr) {
      return {
        id: pr.id,
        label: pr.id === 'component'
          ? 'רכיב «' + COMPONENTS.find(function (c) { return c.id === outcome.component; }).label + '» לבדו (אימון)'
          : pr.label,
        kind: pr.kind,
        rho: point[pr.id].rho == null ? null : round2(point[pr.id].rho),
        rhoCi: n >= 10 ? ci(boot[pr.id].rho) : [null, null],
        auc: point[pr.id].auc == null ? null : round2(point[pr.id].auc),
        aucCi: n >= 10 ? ci(boot[pr.id].auc) : [null, null]
      };
    });
    const byId = {};
    predictors.forEach(function (p) { byId[p.id] = p; });
    const deltas = Object.keys(diffs).map(function (k) {
      return {
        vs: k,
        label: byId[k].label,
        delta: byId.index.rho == null || byId[k].rho == null ? null : round2(byId.index.rho - byId[k].rho),
        ci: n >= 10 ? ci(diffs[k]) : [null, null]
      };
    });
    const idx = byId.index;
    const signal = n >= 30 && idx.rhoCi[0] != null && idx.rhoCi[0] > 0 &&
      deltas.every(function (d) { return d.ci[0] != null && d.ci[0] > 0; });
    return {
      splitId: split.id,
      splitLabel: split.label,
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      outcomeWhy: outcome.why,
      nTrainPlayers: train.length,
      n: n,
      reps: reps,
      predictors: predictors,
      deltas: deltas,
      signal: signal,
      verdict: verdictText(signal, idx, deltas, n)
    };
  }

  function fmtCi(ci) { return '[' + ci[0] + ', ' + ci[1] + ']'; }

  function verdictText(signal, idx, deltas, n) {
    if (n < 30) return 'לא נמצא אות: רק ' + n + ' שחקנים עומדים בתנאי המבחן — מעט מדי כדי לקבוע משהו.';
    if (signal) {
      return 'נמצא אות: ρ=' + idx.rho + ' ' + fmtCi(idx.rhoCi) + ' על ' + n +
        ' שחקנים, ורווח חיובי מובהק מול כל קווי הבסיס. זה קשר סטטיסטי בטורניר אחד — לא קריאת אישיות.';
    }
    const reasons = [];
    if (!(idx.rhoCi[0] > 0)) reasons.push('רווח הסמך של ρ למדד (' + fmtCi(idx.rhoCi) + ') כולל אפס');
    deltas.forEach(function (d) {
      if (!(d.ci[0] > 0)) reasons.push('היתרון מול «' + d.label + '» (' + d.delta + ', ' + fmtCi(d.ci) + ') לא מובהק');
    });
    return 'לא נמצא אות: ' + reasons.join('; ') + '. על ' + n + ' שחקנים במבחן, המדד לא מראה יותר מסטטיסטיקה שטחית.';
  }

  function validateAll(dataset, options) {
    const out = [];
    Object.keys(SPLITS).forEach(function (splitId) {
      Object.keys(OUTCOMES).forEach(function (outcomeId) {
        out.push(validate(dataset, Object.assign({}, options, { splitId: splitId, outcomeId: outcomeId })));
      });
    });
    return out;
  }

  // Test-retest of each component: raw value on training matches vs raw value
  // on test matches, same players (90+ minutes in both halves). A trait must at
  // least repeat itself before it can predict anything else.
  function componentReliability(dataset, splitId) {
    const split = SPLITS[splitId] || SPLITS.oddEven;
    const rows = matchRows(dataset);
    const a = computeComponents(rows.filter(split.isTrain));
    const b = computeComponents(rows.filter(function (r) { return !split.isTrain(r); }));
    const byId = {};
    b.forEach(function (p) { byId[p.id] = p; });
    const pairs = a.filter(function (p) {
      return p.minutes >= MIN_TRAIN_MINUTES && byId[p.id] && byId[p.id].minutes >= MIN_TRAIN_MINUTES;
    });
    const items = COMPONENTS.map(function (c) {
      const rho = spearman(pairs.map(function (p) { return p.raw[c.id]; }), pairs.map(function (p) { return byId[p.id].raw[c.id]; }));
      return { id: c.id, label: c.label, rho: rho == null ? null : round2(rho) };
    });
    const act = spearman(pairs.map(function (p) { return p.actions90; }), pairs.map(function (p) { return byId[p.id].actions90; }));
    items.push({ id: 'actions90', label: 'פעולות ל-90 (סטטיסטיקה שטחית, להשוואה)', rho: act == null ? null : round2(act) });
    return { splitId: split.id, splitLabel: split.label, n: pairs.length, items: items };
  }

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
    COMPONENTS: COMPONENTS,
    COMPONENT_IDS: COMPONENT_IDS,
    SPLITS: SPLITS,
    OUTCOMES: OUTCOMES,
    PREDICTORS: PREDICTORS,
    SHRINK_MINUTES: SHRINK_MINUTES,
    MIN_TRAIN_MINUTES: MIN_TRAIN_MINUTES,
    aggregatePlayers: aggregatePlayers,
    computeComponents: computeComponents,
    scoreIndex: scoreIndex,
    buildTournament: buildTournament,
    impactFromRows: impactFromRows,
    spearman: spearman,
    auc: auc,
    validate: validate,
    validateAll: validateAll,
    componentReliability: componentReliability,
    loadData: loadData
  };
}));
