(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const p1 = isNode ? require('./gems-base.js') : root.ScoutAIGemsBase;
  const p2 = isNode ? require('./gems-validate.js') : root.ScoutAIGemsValidate;
  const api = factory(p1, p2);
  if (isNode) module.exports = api;
  else root.ScoutAIGems = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P1, P2) {
  'use strict';

  // Public module. Split for review size: gems-base.js -> gems-validate.js -> gems.js (load in that order).
  const { DATA_PATH, HEIGHTS_PATH, MIN_TRAIN_MINUTES, MIN_TEST_MINUTES, GEM_MIN_TDI, GEM_MAX_CONV,
    BOOTSTRAP_SEED, ROLES, roleOf, PHYSICAL_ITEMS, TECHNICAL_ITEMS, TDI_COMPONENTS, TDI_IDS,
    EXCLUDED_FROM_TDI, SUM_FIELDS, num, round1, round2, mean, aggregatePlayers, computePlayers } = P1;
  const { scorePlayers, buildTournament, hiddenGems, breakdown, spearman, mulberry32, ci,
    zWithinRole, SPLITS, OUTCOMES, PREDICTORS, VERDICT_BASELINES, splitRows, validate, ltr, fmtCi,
    validateAll } = P2;

  // Test-retest: the same measure on training vs test matches, same players
  // (90+ minutes in both). Shows what is a stable trait and what is noise.
  function reliability(dataset, splitId) {
    const split = SPLITS[splitId] || SPLITS.oddEven;
    const parts = splitRows(dataset, split);
    const a = scorePlayers(computePlayers(parts.train), { minMinutes: MIN_TRAIN_MINUTES });
    const b = scorePlayers(computePlayers(parts.test), { minMinutes: MIN_TRAIN_MINUTES });
    const byId = {};
    b.forEach(function (p) { byId[p.id] = p; });
    const pairs = a.filter(function (p) { return byId[p.id] && byId[p.id].role === p.role; });
    const measures = [
      { id: 'tdi', label: 'מדד טכני-החלטתי', get: function (p) { return p.tdiZ; } },
      { id: 'conventional', label: 'דירוג קונבנציונלי', get: function (p) { return p.convZ; } },
      { id: 'physical', label: 'נקודות פיזיות ל-90', get: function (p) { return p.physZ; } },
      { id: 'share', label: 'חלק פיזי מהדירוג', get: function (p) { return p.physicalShare || 0; } }
    ].concat(TDI_COMPONENTS.map(function (c) {
      return { id: c.id, label: 'רכיב: ' + c.label, get: function (p) { return p.z[c.id]; } };
    }));
    const rand = mulberry32(BOOTSTRAP_SEED + 7);
    const items = measures.map(function (m) {
      const xs = pairs.map(m.get);
      const ys = pairs.map(function (p) { return m.get(byId[p.id]); });
      const rho = spearman(xs, ys);
      const boot = [];
      for (let r = 0; r < 500 && pairs.length >= 10; r += 1) {
        const bx = []; const by = [];
        for (let i = 0; i < pairs.length; i += 1) { const k = Math.floor(rand() * pairs.length); bx.push(xs[k]); by.push(ys[k]); }
        const v = spearman(bx, by);
        if (v != null) boot.push(v);
      }
      return { id: m.id, label: m.label, rho: rho == null ? null : round2(rho), ci: ci(boot) };
    });
    return { splitId: split.id, splitLabel: split.label, n: pairs.length, items: items };
  }

  // ---- 5. the size-bias premise: heights (Wikidata) and birth months -------

  function attachHeights(players, heights) {
    const table = heights && heights.players ? heights.players : {};
    players.forEach(function (p) {
      const h = table[p.id];
      if (h) { p.heightCm = h.heightCm; p.birthMonth = h.birthMonth; }
    });
    return players;
  }

  // Role-adjusted Spearman between height and each measure (both z within
  // role), with bootstrap CI. Positive = taller players score higher.
  function heightBias(players) {
    const withH = players.filter(function (p) { return num(p.heightCm) > 0; });
    const hz = zWithinRole(withH, function (p) { return p.heightCm; });
    const measures = [
      { id: 'share', label: 'חלק פיזי מהדירוג', get: function (p) { return p.physicalShare || 0; } },
      { id: 'aerials', label: 'דו-קרבות אוויריים ל-90', get: function (p) { return p.aerials90; } },
      { id: 'conventional', label: 'דירוג קונבנציונלי', get: function (p) { return p.conventional90; } },
      { id: 'tdi', label: 'מדד טכני-החלטתי', get: function (p) { return p.tdiZ; } },
      { id: 'impact', label: 'Impact 40/30/30', get: function (p) { return p.impact; } },
      { id: 'minutes', label: 'דקות בטורניר', get: function (p) { return p.minutes; } }
    ];
    const rand = mulberry32(BOOTSTRAP_SEED + 11);
    const n = withH.length;
    const items = measures.map(function (m) {
      const mz = zWithinRole(withH, m.get);
      const rho = spearman(hz, mz);
      const boot = [];
      for (let r = 0; r < 1000 && n >= 10; r += 1) {
        const bx = []; const by = [];
        for (let i = 0; i < n; i += 1) { const k = Math.floor(rand() * n); bx.push(hz[k]); by.push(mz[k]); }
        const v = spearman(bx, by);
        if (v != null) boot.push(v);
      }
      return { id: m.id, label: m.label, rho: rho == null ? null : round2(rho), ci: ci(boot) };
    });
    const byRole = {};
    withH.forEach(function (p) { (byRole[p.role] = byRole[p.role] || []).push(p.heightCm); });
    const roleHeights = Object.keys(ROLES).filter(function (r) { return byRole[r]; }).map(function (r) {
      return { role: r, label: ROLES[r], n: byRole[r].length, meanCm: round1(mean(byRole[r])) };
    });
    return { n: n, items: items, roleHeights: roleHeights };
  }

  // Relative age effect: birth quarter of the players in the data vs a
  // uniform spread (chi-square, 3 df). Uniform is an approximation: births are
  // not perfectly even across the year.
  function relativeAge(players) {
    const q = [0, 0, 0, 0];
    players.forEach(function (p) {
      const m = num(p.birthMonth);
      if (m >= 1 && m <= 12) q[Math.floor((m - 1) / 3)] += 1;
    });
    const n = q[0] + q[1] + q[2] + q[3];
    const e = n / 4;
    const chi2 = e > 0 ? q.reduce(function (s, x) { return s + (x - e) * (x - e) / e; }, 0) : 0;
    // chi-square survival function, 3 df: Q = erfc(sqrt(x/2)) + sqrt(2x/pi) * exp(-x/2)
    const p = erfc(Math.sqrt(chi2 / 2)) + Math.sqrt(2 * chi2 / Math.PI) * Math.exp(-chi2 / 2);
    return { n: n, quarters: q, sharePct: q.map(function (x2) { return n ? round1(x2 / n * 100) : 0; }), chi2: round2(chi2), p: n ? Number(p.toPrecision(2)) : null, q1q4: q[3] ? round2(q[0] / q[3]) : null };
  }

  function erfc(x) {
    // Abramowitz-Stegun 7.1.26
    const t = 1 / (1 + 0.3275911 * x);
    const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return y * Math.exp(-x * x);
  }

  // ---- bring your own data (CSV) -------------------------------------------

  const CSV_REQUIRED = Object.freeze(['name', 'minutes']);
  const CSV_TEXT = Object.freeze(['name', 'team', 'position', 'role', 'playerId', 'id']);

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted;
      } else if ((ch === ',' || ch === ';' || ch === '\t') && !quoted) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  function parseCsv(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return { ok: false, errors: ['צריך שורת כותרת ולפחות שורה אחת'], rows: [] };
    const known = SUM_FIELDS.concat(CSV_TEXT, ['teamMatchNo', 'matchId', 'heightCm', 'birthMonth']);
    const lower = {};
    known.forEach(function (k) { lower[k.toLowerCase()] = k; });
    const headers = splitCsvLine(lines[0]).map(function (h) { return lower[h.toLowerCase()] || null; });
    const missing = CSV_REQUIRED.filter(function (k) { return headers.indexOf(k) < 0; });
    if (missing.length) return { ok: false, errors: ['חסרות עמודות חובה: ' + missing.join(', ')], rows: [] };
    if (headers.indexOf('position') < 0 && headers.indexOf('role') < 0) return { ok: false, errors: ['חסרה עמודת position או role'], rows: [] };
    const errors = [];
    const rows = [];
    lines.slice(1).forEach(function (line, i) {
      const cells = splitCsvLine(line);
      const r = {};
      headers.forEach(function (h, j) {
        if (!h) return;
        const v = cells[j] == null ? '' : cells[j];
        if (CSV_TEXT.indexOf(h) >= 0) r[h] = v;
        else if (v !== '') {
          const n = Number(v);
          if (Number.isFinite(n)) r[h] = n; else errors.push('שורה ' + (i + 2) + ': ' + h + ' אינו מספר');
        }
      });
      if (!r.name || !(num(r.minutes) > 0)) { errors.push('שורה ' + (i + 2) + ': חסר שם או דקות'); return; }
      rows.push(r);
    });
    const unknown = splitCsvLine(lines[0]).filter(function (h, j) { return !headers[j]; });
    return {
      ok: rows.length > 0, errors: errors, rows: rows, unknownColumns: unknown,
      canValidate: headers.indexOf('teamMatchNo') >= 0,
      hasHeights: headers.indexOf('heightCm') >= 0
    };
  }

  function loadJson(fetchImpl, p) {
    const load = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!load) return Promise.reject(new Error('fetch unavailable'));
    return load(p).then(function (res) {
      if (!res.ok) throw new Error(p + ' ' + res.status);
      return res.json();
    });
  }

  function loadData(fetchImpl) {
    return Promise.all([loadJson(fetchImpl, DATA_PATH), loadJson(fetchImpl, HEIGHTS_PATH)])
      .then(function (both) { return { matches: both[0], heights: both[1] }; });
  }

  return {
    DATA_PATH: DATA_PATH,
    HEIGHTS_PATH: HEIGHTS_PATH,
    ROLES: ROLES,
    PHYSICAL_ITEMS: PHYSICAL_ITEMS,
    TECHNICAL_ITEMS: TECHNICAL_ITEMS,
    TDI_COMPONENTS: TDI_COMPONENTS,
    TDI_IDS: TDI_IDS,
    EXCLUDED_FROM_TDI: EXCLUDED_FROM_TDI,
    SPLITS: SPLITS,
    OUTCOMES: OUTCOMES,
    PREDICTORS: PREDICTORS,
    VERDICT_BASELINES: VERDICT_BASELINES,
    GEM_MIN_TDI: GEM_MIN_TDI,
    GEM_MAX_CONV: GEM_MAX_CONV,
    MIN_TRAIN_MINUTES: MIN_TRAIN_MINUTES,
    MIN_TEST_MINUTES: MIN_TEST_MINUTES,
    roleOf: roleOf,
    fmtCi: fmtCi,
    ltr: ltr,
    aggregatePlayers: aggregatePlayers,
    computePlayers: computePlayers,
    scorePlayers: scorePlayers,
    buildTournament: buildTournament,
    hiddenGems: hiddenGems,
    breakdown: breakdown,
    spearman: spearman,
    validate: validate,
    validateAll: validateAll,
    reliability: reliability,
    attachHeights: attachHeights,
    heightBias: heightBias,
    relativeAge: relativeAge,
    parseCsv: parseCsv,
    loadData: loadData
  };
}));
