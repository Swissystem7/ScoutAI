(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const p1 = isNode ? require('./clubfit-base.js') : root.ScoutAIClubFitBase;
  const p2 = isNode ? require('./clubfit-fit.js') : root.ScoutAIClubFitFit;
  const api = factory(p1, p2);
  if (isNode) module.exports = api;
  else root.ScoutAIClubFit = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P1, P2) {
  'use strict';

  // Public module. Split for review size: clubfit-base.js -> clubfit-fit.js -> clubfit.js (load in that order).
  const { DATA_PATH, PROVENANCE, USER_PROVENANCE, PRIOR_MINUTES, HALF_MINUTES, BOOTSTRAP_REPS,
    BOOTSTRAP_SEED, STYLE_DIMS, DIM_IDS, METRICS, METRIC_IDS, ROLES, ROLE_IDS, roleOf, round1,
    round2, mean, rankValues, spearman, mulberry32, ci95, percentile, SPLITS, teamRowsOf,
    teamProfiles, formatDimValue, rawFromZ } = P1;
  const { aggregatePlayers, playerProfiles, neutralZ, weightsFor, fitScore, reasonsFor, buildModel,
    teamZ, shortlist, teamStability, halfModels } = P2;

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
