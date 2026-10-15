(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const p1 = isNode ? require('./radar-stats.js') : root.ScoutAIRadarStats;
  const api = factory(p1);
  if (isNode) module.exports = api;
  else root.ScoutAIRadar = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (P1) {
  'use strict';

  // Public module. Split for review size: radar-stats.js -> radar.js (load in that order).
  const { DATA_PATH, BOOTSTRAP_REPS, BOOTSTRAP_SEED, MIN_EXEMPLAR_MINUTES, SHRINK_MINUTES,
    SHRINK_COUNT, PAIRS, METRICS, WEB_TRENDS, TREND_CHECKED, positionGroup, decode, metricById,
    ratio, mulberry32, meanSd, hedgesG, compareMetric, direction, sizeLabel, verdict, VERDICT_LABELS } = P1;

  function teamsOf(data, key) {
    return data.teams.filter(function (r) { return r.t === key; });
  }

  function radar(data, options) {
    const opts = options || {};
    const rows = METRICS.map(function (m, i) {
      const pairs = PAIRS.map(function (p, j) {
        const res = compareMetric(teamsOf(data, p.from), teamsOf(data, p.to), m,
          { reps: opts.reps, seed: BOOTSTRAP_SEED + i * 10 + j });
        res.pair = p.id;
        res.dir = direction(res);
        return res;
      });
      const v = verdict(pairs.map(function (r) { return r.dir; }));
      return { metric: m, pairs: pairs, verdict: v.id, dir: v.dir, verdictLabel: VERDICT_LABELS[v.id] };
    });
    return rows;
  }

  // Placebo: split ONE tournament into alternating matches (by match order)
  // and run the same test. Any «change» found here is noise by construction.
  function placebo(data, key, options) {
    const opts = options || {};
    const teams = teamsOf(data, key);
    const ids = Array.from(new Set(teams.map(function (r) { return r.matchId; })));
    const half = {};
    ids.forEach(function (id, i) { half[id] = i % 2; });
    const A = teams.filter(function (r) { return half[r.matchId] === 0; });
    const B = teams.filter(function (r) { return half[r.matchId] === 1; });
    let flagged = 0;
    const flaggedIds = [];
    METRICS.forEach(function (m, i) {
      const res = compareMetric(A, B, m, { reps: opts.reps, seed: BOOTSTRAP_SEED + 500 + i });
      if (direction(res) !== 'noise') { flagged += 1; flaggedIds.push(m.id); }
    });
    return { tournament: key, flagged: flagged, total: METRICS.length, metrics: flaggedIds };
  }

  // Player-level value of a metric, shrunk toward the pool.
  function playerValue(p, spec, pool) {
    const num = Number(p[spec.num]) || 0;
    const den = Number(p[spec.den]) || 0;
    if (spec.kind === 'rate') {
      if (den <= 0) return null;
      return (num + pool * SHRINK_MINUTES / 90) / (den + SHRINK_MINUTES) * 90;
    }
    if (den < (spec.minDen || 1)) return null;
    const k = spec.minDen && spec.minDen < SHRINK_COUNT ? spec.minDen : SHRINK_COUNT;
    const v = (num + pool * k) / (den + k);
    return spec.kind === 'share' ? v * 100 : v;
  }

  function rawPlayerValue(p, spec) {
    const num = Number(p[spec.num]) || 0;
    const den = Number(p[spec.den]) || 0;
    if (den <= 0) return null;
    if (spec.kind === 'rate') return num / den * 90;
    return spec.kind === 'share' ? num / den * 100 : num / den;
  }

  function poolRate(players, spec) {
    let n = 0;
    let d = 0;
    players.forEach(function (p) { n += Number(p[spec.num]) || 0; d += Number(p[spec.den]) || 0; });
    if (d <= 0) return 0;
    return spec.kind === 'rate' ? n / d * 90 : n / d;
  }

  function eligibleFor(spec, p) {
    if ((Number(p.minutes) || 0) < MIN_EXEMPLAR_MINUTES) return false;
    if (spec.group) return p.positionGroup === spec.group;
    return p.positionGroup !== 'GK';
  }

  // Early exemplars: players in the EARLIER tournament whose own value was
  // furthest in the direction the metric later moved, relative to their own
  // position group (a centre-back is compared with centre-backs). Their value
  // in the later tournament is shown when they played there — descriptive,
  // not a prediction test.
  function exemplars(data, metricId, pairId, dir, limit) {
    const m = metricById(metricId);
    const pair = PAIRS.find(function (p) { return p.id === pairId; });
    if (!m || !m.player || !pair || (dir !== 'up' && dir !== 'down')) return [];
    const spec = m.player;
    const early = data.players.filter(function (p) { return p.t === pair.from && eligibleFor(spec, p); });
    const later = {};
    data.players.forEach(function (p) { if (p.t === pair.to) later[String(p.id)] = p; });
    const groups = {};
    early.forEach(function (p) { (groups[p.positionGroup] = groups[p.positionGroup] || []).push(p); });
    const scored = [];
    Object.keys(groups).forEach(function (g) {
      const peers = groups[g];
      const pool = poolRate(peers, spec);
      const vals = peers.map(function (p) { return playerValue(p, spec, pool); }).filter(function (v) { return v != null; });
      const stats = meanSd(vals);
      if (stats.n < 8 || !(stats.sd > 0)) return;
      peers.forEach(function (p) {
        const v = playerValue(p, spec, pool);
        if (v == null) return;
        scored.push({ player: p, value: v, raw: rawPlayerValue(p, spec), z: (v - stats.mean) / stats.sd, groupMean: stats.mean });
      });
    });
    scored.sort(function (a, b) { return dir === 'up' ? b.z - a.z : a.z - b.z; });
    return scored.slice(0, limit || 5).map(function (x) {
      const l = later[String(x.player.id)];
      return {
        id: x.player.id, t: x.player.t, name: x.player.name, team: x.player.team,
        position: x.player.position, positionGroup: x.player.positionGroup, minutes: x.player.minutes,
        value: x.value, raw: x.raw, z: x.z, groupMean: x.groupMean,
        later: l ? { minutes: l.minutes, raw: rawPlayerValue(l, spec) } : null
      };
    });
  }

  // Team exemplars (used for team-only metrics such as PPDA).
  function teamExemplars(data, metricId, pairId, dir, limit) {
    const m = metricById(metricId);
    const pair = PAIRS.find(function (p) { return p.id === pairId; });
    if (!m || !pair || (dir !== 'up' && dir !== 'down')) return [];
    const byTeam = {};
    teamsOf(data, pair.from).forEach(function (r) { (byTeam[r.team] = byTeam[r.team] || []).push(r); });
    const list = Object.keys(byTeam).filter(function (t) { return byTeam[t].length >= 3; }).map(function (t) {
      return { team: t, matches: byTeam[t].length, value: ratio(byTeam[t], m) };
    }).filter(function (x) { return x.value != null; });
    list.sort(function (a, b) { return dir === 'up' ? b.value - a.value : a.value - b.value; });
    return list.slice(0, limit || 5);
  }

  // ---------- bring your own data (CSV) ----------
  // Columns: group (exactly two values, the earlier one first in the file),
  // optional match_id (bootstrap cluster; default one row = one cluster),
  // and any numeric columns — each becomes a metric (mean of row values).
  function parseCsv(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (quoted) {
        if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i += 1;
        row.push(cell); cell = '';
        if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
    if (!rows.length) return { header: [], rows: [] };
    const header = rows[0].map(function (h) { return h.trim(); });
    return {
      header: header,
      rows: rows.slice(1).map(function (r) {
        const o = {};
        header.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i].trim(); });
        return o;
      })
    };
  }

  function byodRadar(text, options) {
    const opts = options || {};
    const parsed = parseCsv(text);
    const h = parsed.header;
    const lower = h.map(function (x) { return x.toLowerCase(); });
    const gi = lower.indexOf('group');
    if (gi < 0) return { error: 'חסרה עמודה group (שתי קבוצות להשוואה, למשל 2024 ו-2025).' };
    const groupCol = h[gi];
    const mi = lower.indexOf('match_id');
    const matchCol = mi >= 0 ? h[mi] : null;
    const groups = [];
    parsed.rows.forEach(function (r) { if (r[groupCol] !== '' && groups.indexOf(r[groupCol]) < 0) groups.push(r[groupCol]); });
    if (groups.length !== 2) return { error: 'בעמודה group צריכים להיות בדיוק שני ערכים שונים; נמצאו ' + groups.length + '.' };
    const numeric = h.filter(function (col, i) {
      if (i === gi || i === mi || /^(team|player|name)$/i.test(col)) return false;
      const vals = parsed.rows.map(function (r) { return r[col]; }).filter(function (v) { return v !== ''; });
      return vals.length > 0 && vals.every(function (v) { return Number.isFinite(Number(v)); });
    });
    if (!numeric.length) return { error: 'לא נמצאו עמודות מספריות להשוואה.' };
    const rows = parsed.rows.map(function (r, i) {
      const o = { matchId: matchCol ? r[matchCol] : 'row' + i, group: r[groupCol] };
      numeric.forEach(function (c) { o[c] = r[c] === '' ? null : Number(r[c]); });
      return o;
    });
    const results = numeric.map(function (col, i) {
      const metric = {
        id: col, label: col, kind: 'mean',
        num: function (r) { return r[col] == null ? 0 : r[col]; },
        den: function (r) { return r[col] == null ? 0 : 1; }
      };
      const A = rows.filter(function (r) { return r.group === groups[0]; });
      const B = rows.filter(function (r) { return r.group === groups[1]; });
      const res = compareMetric(A, B, metric, { reps: opts.reps || 1000, seed: BOOTSTRAP_SEED + 900 + i });
      res.dir = direction(res);
      res.label = col;
      return res;
    });
    return { groups: groups, rows: rows.length, results: results };
  }

  return {
    DATA_PATH: DATA_PATH,
    BOOTSTRAP_REPS: BOOTSTRAP_REPS,
    MIN_EXEMPLAR_MINUTES: MIN_EXEMPLAR_MINUTES,
    PAIRS: PAIRS,
    METRICS: METRICS,
    WEB_TRENDS: WEB_TRENDS,
    TREND_CHECKED: TREND_CHECKED,
    VERDICT_LABELS: VERDICT_LABELS,
    positionGroup: positionGroup,
    decode: decode,
    metricById: metricById,
    ratio: ratio,
    hedgesG: hedgesG,
    compareMetric: compareMetric,
    direction: direction,
    sizeLabel: sizeLabel,
    verdict: verdict,
    radar: radar,
    placebo: placebo,
    exemplars: exemplars,
    teamExemplars: teamExemplars,
    playerValue: playerValue,
    rawPlayerValue: rawPlayerValue,
    parseCsv: parseCsv,
    byodRadar: byodRadar,
    mulberry32: mulberry32
  };
}));
