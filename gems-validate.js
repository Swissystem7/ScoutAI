(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const p1 = isNode ? require('./gems-base.js') : root.ScoutAIGemsBase;
  const demo = isNode ? require('./demo.js') : root.ScoutAIDemo;
  const api = factory(p1, demo);
  if (isNode) module.exports = api;
  else root.ScoutAIGemsValidate = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P1, Demo) {
  'use strict';

  // Split for review size: gems-base.js -> gems-validate.js -> gems.js (load in that order).
  const { MIN_TRAIN_MINUTES, MIN_TEST_MINUTES, GEM_MIN_TDI, GEM_MAX_CONV, BOOTSTRAP_REPS,
    BOOTSTRAP_SEED, PHYSICAL_ITEMS, TECHNICAL_ITEMS, TDI_IDS, num, round1, round2, mean, meanSd,
    percentileWithin, matchRows, points, computePlayers } = P1;

  // z within role (eligible players only) for TDI components and for every
  // comparison rating, so all predictors are role-adjusted the same way.
  function scorePlayers(players, options) {
    const minMinutes = options && options.minMinutes != null ? options.minMinutes : MIN_TRAIN_MINUTES;
    const eligible = players.filter(function (p) { return p.minutes >= minMinutes; });
    const groups = {};
    eligible.forEach(function (p) { (groups[p.role] = groups[p.role] || []).push(p); });
    Object.keys(groups).forEach(function (role) {
      const peers = groups[role];
      const stats = {};
      TDI_IDS.forEach(function (id) { stats[id] = meanSd(peers.map(function (p) { return p.raw[id]; })); });
      const conv = meanSd(peers.map(function (p) { return p.conventional90; }));
      const phys = meanSd(peers.map(function (p) { return p.phys90; }));
      const imp = meanSd(peers.map(function (p) { return p.impact; }));
      const mins = meanSd(peers.map(function (p) { return p.minutes; }));
      peers.forEach(function (p) {
        p.z = {};
        TDI_IDS.forEach(function (id) { p.z[id] = (p.raw[id] - stats[id].mean) / stats[id].sd; });
        p.tdiZ = mean(TDI_IDS.map(function (id) { return p.z[id]; }));
        p.convZ = (p.conventional90 - conv.mean) / conv.sd;
        p.physZ = (p.phys90 - phys.mean) / phys.sd;
        p.impactZ = (p.impact - imp.mean) / imp.sd;
        p.minutesZ = (p.minutes - mins.mean) / mins.sd;
      });
      const tdis = peers.map(function (p) { return p.tdiZ; });
      const convs = peers.map(function (p) { return p.conventional90; });
      const minutes = peers.map(function (p) { return p.minutes; });
      const shares = peers.map(function (p) { return p.physicalShare == null ? 0 : p.physicalShare; });
      peers.forEach(function (p) {
        p.tdiPct = percentileWithin(p.tdiZ, tdis);
        p.convPct = percentileWithin(p.conventional90, convs);
        p.minutesPct = percentileWithin(p.minutes, minutes);
        p.sharePct = percentileWithin(p.physicalShare == null ? 0 : p.physicalShare, shares);
        p.componentPct = {};
        TDI_IDS.forEach(function (id) {
          p.componentPct[id] = percentileWithin(p.raw[id], peers.map(function (q) { return q.raw[id]; }));
        });
        p.gap = round1(p.tdiPct - p.convPct);
        p.isGem = p.tdiPct >= GEM_MIN_TDI && p.convPct <= GEM_MAX_CONV;
        p.isFavourite = p.convPct >= GEM_MIN_TDI && p.tdiPct <= GEM_MAX_CONV;
      });
    });
    return eligible;
  }

  function buildTournament(dataset, options) {
    return scorePlayers(computePlayers(matchRows(dataset)), options)
      .sort(function (a, b) { return b.tdiZ - a.tdiZ; });
  }

  function hiddenGems(players) {
    return players.filter(function (p) { return p.isGem; })
      .sort(function (a, b) { return b.gap - a.gap || b.tdiZ - a.tdiZ; });
  }

  // Share of conventional points by item, for one player (for the breakdown bar).
  function breakdown(p) {
    const items = PHYSICAL_ITEMS.map(function (it) { return { id: it.id, label: it.label, kind: 'physical', points: num(p[it.id]) * it.weight, count: num(p[it.id]) }; })
      .concat(TECHNICAL_ITEMS.map(function (it) { return { id: it.id, label: it.label, kind: 'technical', points: num(p[it.id]) * it.weight, count: num(p[it.id]) }; }));
    const total = items.reduce(function (s, it) { return s + it.points; }, 0);
    items.forEach(function (it) { it.share = total > 0 ? round1(it.points / total * 100) : 0; it.points = round2(it.points); it.count = round2(it.count); });
    return { total: round2(total), physicalShare: p.physicalShare == null ? null : round1(p.physicalShare * 100), items: items };
  }

  // ---- statistics ------------------------------------------------------------

  function spearman(xs, ys) {
    if (!xs || xs.length < 3) return null;
    const rx = Demo.rankValues(xs);
    const ry = Demo.rankValues(ys);
    const n = xs.length;
    const mx = mean(rx);
    const my = mean(ry);
    let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = rx[i] - mx; const dy = ry[i] - my;
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

  function ci(values) {
    if (!values.length) return [null, null];
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    return [round2(quantile(sorted, 0.025)), round2(quantile(sorted, 0.975))];
  }

  function zWithinRole(items, getter) {
    const groups = {};
    items.forEach(function (it) { (groups[it.role] = groups[it.role] || []).push(it); });
    const out = new Map();
    Object.keys(groups).forEach(function (role) {
      const s = meanSd(groups[role].map(getter));
      groups[role].forEach(function (it) { out.set(it, (getter(it) - s.mean) / s.sd); });
    });
    return items.map(function (it) { return out.get(it); });
  }

  // ---- 4. hold-out validation ------------------------------------------------

  const SPLITS = Object.freeze({
    temporal: Object.freeze({
      id: 'temporal',
      label: 'זמני: משחקים 1–2 של כל נבחרת (אימון) ← משחק 3 ואילך (מבחן)',
      isTrain: function (row) { return num(row.teamMatchNo) <= 2; }
    }),
    oddEven: Object.freeze({
      id: 'oddEven',
      label: 'חצי-מדגם: משחקים אי-זוגיים של כל נבחרת (אימון) ← זוגיים (מבחן)',
      isTrain: function (row) { return num(row.teamMatchNo) % 2 === 1; }
    })
  });

  const OUTCOMES = Object.freeze({
    xgChain: Object.freeze({
      id: 'xgChain', label: 'xGChain ל-90 (תרומה ל-xG של הקבוצה)',
      why: 'סכום ה-xG (בלי פנדלים) של כל התקפה שהשחקן נגע בה — מסירה, הובלה, קבלה, כדרור או בעיטה. זו «תרומה ל-xG של הקבוצה», לא רק לשערים שלו.'
    }),
    xgBuildup: Object.freeze({
      id: 'xgBuildup', label: 'xGBuildup ל-90 (תרומה טכנית לבנייה)',
      why: 'כמו xGChain, אבל בלי התקפות שבהן השחקן בעט או מסר את מסירת המפתח — מודד תרומה לבניית ההתקפה, גם של בלמים וקשרים.'
    }),
    xgxa: Object.freeze({
      id: 'xgxa', label: 'xG + xA ל-90 (בלי פנדלים)',
      why: 'איכות המצבים שהשחקן יצר לעצמו ולאחרים. כאן המדד הקונבנציונלי מקבל יתרון מובנה, כי xG הוא חלק ממנו.'
    })
  });

  const PREDICTORS = Object.freeze([
    Object.freeze({ id: 'tdi', label: 'מדד טכני-החלטתי (אימון)', kind: 'index', key: 'tdiZ' }),
    Object.freeze({ id: 'conventional', label: 'דירוג קונבנציונלי כולל פיזי (אימון)', kind: 'baseline', key: 'convZ' }),
    Object.freeze({ id: 'minutes', label: 'דקות משחק (אימון)', kind: 'baseline', key: 'minutesZ' }),
    Object.freeze({ id: 'physical', label: 'נקודות פיזיות בלבד ל-90 (אימון)', kind: 'baseline', key: 'physZ' }),
    Object.freeze({ id: 'impact', label: 'Impact 40/30/30 של המעבדה (אימון)', kind: 'baseline', key: 'impactZ' })
  ]);
  const VERDICT_BASELINES = Object.freeze(['conventional', 'minutes']);

  function splitRows(dataset, split) {
    const rows = matchRows(dataset);
    return {
      train: rows.filter(split.isTrain),
      test: rows.filter(function (r) { return !split.isTrain(r); })
    };
  }

  function validate(dataset, options) {
    const opts = options || {};
    const split = SPLITS[opts.splitId] || SPLITS.temporal;
    const outcome = OUTCOMES[opts.outcomeId] || OUTCOMES.xgChain;
    const reps = opts.reps || BOOTSTRAP_REPS;
    const parts = splitRows(dataset, split);
    const train = scorePlayers(computePlayers(parts.train), { minMinutes: MIN_TRAIN_MINUTES });
    const trainById = {};
    train.forEach(function (p) { trainById[p.id] = p; });
    const test = computePlayers(parts.test).filter(function (q) {
      return q.minutes >= MIN_TEST_MINUTES && trainById[q.id];
    });
    // outcome: raw /90 in test, z-scored within the player's TRAIN role
    const sample = test.map(function (q) {
      const p = trainById[q.id];
      const x = {};
      PREDICTORS.forEach(function (pr) { x[pr.id] = p[pr.key]; });
      return { id: p.id, name: p.name, team: p.team, role: p.role, raw: q.outcomes[outcome.id], x: x, isGem: p.isGem, isFavourite: p.isFavourite };
    });
    const zs = zWithinRole(sample, function (s) { return s.raw; });
    sample.forEach(function (s, i) { s.y = zs[i]; });
    const n = sample.length;

    function stats(idx) {
      const y = idx.map(function (i) { return sample[i].y; });
      const out = {};
      PREDICTORS.forEach(function (pr) {
        out[pr.id] = spearman(idx.map(function (i) { return sample[i].x[pr.id]; }), y);
      });
      const g = idx.filter(function (i) { return sample[i].isGem; }).map(function (i) { return sample[i].y; });
      const f = idx.filter(function (i) { return sample[i].isFavourite; }).map(function (i) { return sample[i].y; });
      out.gemMinusFav = g.length && f.length ? mean(g) - mean(f) : null;
      return out;
    }
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(i);
    const point = stats(all);
    const rand = mulberry32(BOOTSTRAP_SEED + (split.id === 'oddEven' ? 1 : 0) + Object.keys(OUTCOMES).indexOf(outcome.id) * 2);
    const boot = {};
    PREDICTORS.forEach(function (pr) { boot[pr.id] = []; });
    const diffs = {};
    PREDICTORS.forEach(function (pr) { if (pr.id !== 'tdi') diffs[pr.id] = []; });
    const gemBoot = [];
    for (let b = 0; b < reps && n >= 10; b += 1) {
      const idx = [];
      for (let i = 0; i < n; i += 1) idx.push(Math.floor(rand() * n));
      const s = stats(idx);
      PREDICTORS.forEach(function (pr) { if (s[pr.id] != null) boot[pr.id].push(s[pr.id]); });
      Object.keys(diffs).forEach(function (k) { if (s.tdi != null && s[k] != null) diffs[k].push(s.tdi - s[k]); });
      if (s.gemMinusFav != null) gemBoot.push(s.gemMinusFav);
    }
    const predictors = PREDICTORS.map(function (pr) {
      return {
        id: pr.id, label: pr.label, kind: pr.kind,
        rho: point[pr.id] == null ? null : round2(point[pr.id]),
        rhoCi: n >= 10 ? ci(boot[pr.id]) : [null, null]
      };
    });
    const byId = {};
    predictors.forEach(function (p) { byId[p.id] = p; });
    const deltas = Object.keys(diffs).map(function (k) {
      return {
        vs: k, label: byId[k].label, inVerdict: VERDICT_BASELINES.indexOf(k) >= 0,
        delta: point.tdi == null || point[k] == null ? null : round2(point.tdi - point[k]),
        ci: n >= 10 ? ci(diffs[k]) : [null, null]
      };
    });
    const gems = sample.filter(function (s) { return s.isGem; });
    const favs = sample.filter(function (s) { return s.isFavourite; });
    const gemTest = {
      nGems: gems.length, nFavourites: favs.length,
      gemMean: gems.length ? round2(mean(gems.map(function (s) { return s.y; }))) : null,
      favMean: favs.length ? round2(mean(favs.map(function (s) { return s.y; }))) : null,
      diff: point.gemMinusFav == null ? null : round2(point.gemMinusFav),
      ci: gems.length >= 5 && favs.length >= 5 ? ci(gemBoot) : [null, null]
    };
    const idx = byId.tdi;
    const signal = n >= 30 && idx.rhoCi[0] != null && idx.rhoCi[0] > 0 &&
      deltas.filter(function (d) { return d.inVerdict; }).every(function (d) { return d.ci[0] != null && d.ci[0] > 0; });
    return {
      splitId: split.id, splitLabel: split.label,
      outcomeId: outcome.id, outcomeLabel: outcome.label, outcomeWhy: outcome.why,
      nTrainPlayers: train.length, n: n, reps: reps,
      predictors: predictors, deltas: deltas, gemTest: gemTest,
      signal: signal,
      verdict: verdictText(signal, idx, deltas, n)
    };
  }

  function fmtNum(x) { return Object.is(x, -0) ? '-0.00' : String(x); }
  // LTR isolate so numbers and intervals render correctly inside Hebrew text.
  function ltr(x) { return '\u2066' + x + '\u2069'; }
  function fmtCi(c) { return ltr('[' + fmtNum(c[0]) + ', ' + fmtNum(c[1]) + ']'); }

  function verdictText(signal, idx, deltas, n) {
    if (n < 30) return 'לא נמצא אות: רק ' + n + ' שחקנים עומדים בתנאי המבחן — מעט מדי כדי לקבוע משהו.';
    const main = deltas.filter(function (d) { return d.inVerdict; });
    if (signal) {
      return 'נמצא אות: ' + ltr('ρ=' + idx.rho) + ' ' + fmtCi(idx.rhoCi) + ' על ' + n + ' שחקנים, ויתרון מובהק על הדירוג הקונבנציונלי (' +
        ltr(main[0].delta) + ' ' + fmtCi(main[0].ci) + ') ועל דקות המשחק (' + ltr(main[1].delta) + ' ' + fmtCi(main[1].ci) + '). טורניר אחד — לא הכללה לכל כדורגל.';
    }
    const reasons = [];
    if (!(idx.rhoCi[0] > 0)) reasons.push('רווח הסמך של ρ למדד (' + fmtCi(idx.rhoCi) + ') כולל אפס');
    main.forEach(function (d) {
      if (!(d.ci[0] > 0)) reasons.push('היתרון מול «' + d.label + '» (' + ltr(d.delta) + ', ' + fmtCi(d.ci) + ') לא מובהק');
    });
    return 'לא נמצא אות: ' + reasons.join('; ') + '. n=' + n + ' שחקנים במבחן.';
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

  return { scorePlayers, buildTournament, hiddenGems, breakdown, spearman, mulberry32, quantile, ci,
    zWithinRole, SPLITS, OUTCOMES, PREDICTORS, VERDICT_BASELINES, splitRows, validate, fmtNum, ltr,
    fmtCi, verdictText, validateAll };
}));
