(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const p1 = isNode ? require('./clubfit-base.js') : root.ScoutAIClubFitBase;
  const api = factory(p1);
  if (isNode) module.exports = api;
  else root.ScoutAIClubFitFit = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P1) {
  'use strict';

  // Split for review size: clubfit-base.js -> clubfit-fit.js -> clubfit.js (load in that order).
  const { PRIOR_MINUTES, POOL_MINUTES, Z_CLIP, BOOTSTRAP_REPS, BOOTSTRAP_SEED, STYLE_DIMS, DIM_IDS,
    DIM_BY_ID, METRICS, METRIC_IDS, ROLES, roleOf, num, round1, round2, clip, spearman, mulberry32,
    ci95, percentile, SPLITS, teamRowsOf, playerRowsOf, teamProfiles } = P1;

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

  return { aggregatePlayers, playerProfiles, neutralZ, weightsFor, fitScore, contributions,
    driverText, demandReason, suppressReason, reasonsFor, buildModel, teamZ, shortlist,
    teamStability, halfModels };
}));
