(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIReport = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Hebrew one-page scouting report + shortlist (CSV).
  // Everything in a report is a count or a rate from event data. No photos,
  // no body measures, no face or personality claims — by design.

  const STORAGE_KEY = 'scoutai_shortlist_v1';
  const PEER_MIN_MINUTES = 270;   // who counts as a peer for percentiles
  const LOW_MINUTES = 270;        // below this the report says «מדגם קטן»
  const STRENGTH_PCT = 75;
  const WEAKNESS_PCT = 25;

  function positionGroup(position) {
    const text = String(position || '');
    if (/goalkeeper/i.test(text)) return 'GK';
    if (/midfield/i.test(text)) return 'MF';
    if (/back|defen/i.test(text)) return 'DF';
    if (/forward|wing|striker/i.test(text)) return 'FW';
    return 'OT';
  }

  const GROUP_LABELS = Object.freeze({ GK: 'שוער', DF: 'הגנה', MF: 'קישור', FW: 'התקפה', OT: 'אחר' });

  // kind: rate = per 90; share = %; style = shown, never a strength/weakness.
  const PROFILE = Object.freeze([
    { id: 'passesCompleted90', label: 'מסירות מוצלחות ל-90', kind: 'rate', num: 'passesCompleted', den: 'minutes' },
    { id: 'passAcc', label: 'דיוק מסירה', kind: 'share', num: 'passesCompleted', den: 'passes', minDen: 50 },
    { id: 'progPasses90', label: 'מסירות מקדמות ל-90', kind: 'rate', num: 'progPasses', den: 'minutes' },
    { id: 'progCarries90', label: 'הובלות מקדמות ל-90', kind: 'rate', num: 'progCarries', den: 'minutes' },
    { id: 'keyPasses90', label: 'מסירות מפתח ל-90', kind: 'rate', num: 'keyPasses', den: 'minutes' },
    { id: 'xa90', label: 'xA ל-90 (איכות המצבים שיצר)', kind: 'rate', num: 'xa', den: 'minutes' },
    { id: 'npxg90', label: 'xG בלי פנדלים ל-90', kind: 'rate', num: 'npxg', den: 'minutes' },
    { id: 'shots90', label: 'בעיטות ל-90', kind: 'rate', num: 'npShots', den: 'minutes' },
    { id: 'boxTouches90', label: 'נגיעות ברחבה ל-90', kind: 'rate', num: 'boxTouches', den: 'minutes' },
    { id: 'dribblesWon90', label: 'כדרורים מוצלחים ל-90', kind: 'rate', num: 'dribblesWon', den: 'minutes' },
    { id: 'crosses90', label: 'הגבהות ל-90', kind: 'rate', num: 'crosses', den: 'minutes' },
    { id: 'pressures90', label: 'לחצים ל-90', kind: 'rate', num: 'pressures', den: 'minutes' },
    { id: 'highPress90', label: 'לחצים בשליש ההתקפה ל-90', kind: 'rate', num: 'highPress', den: 'minutes' },
    { id: 'counterpress90', label: 'לחץ-נגד ל-90', kind: 'rate', num: 'counterpress', den: 'minutes' },
    { id: 'tackles90', label: 'תיקולים מוצלחים ל-90', kind: 'rate', num: 'tacklesWon', den: 'minutes' },
    { id: 'interceptions90', label: 'חטיפות ל-90', kind: 'rate', num: 'interceptions', den: 'minutes' },
    { id: 'recoveries90', label: 'השבות כדור ל-90', kind: 'rate', num: 'recoveries', den: 'minutes' },
    { id: 'longShare', label: 'שיעור כדורים ארוכים', kind: 'style', num: 'openLong', den: 'openPasses', minDen: 40 },
    { id: 'gkLongShare', label: 'שוער: שיעור מסירות ארוכות', kind: 'style', num: 'gkLong', den: 'gkPasses', minDen: 20 }
  ].map(Object.freeze));

  const ROLES = Object.freeze({
    GK: [
      { id: 'gkBuild', label: 'שוער שבונה משחק קצר', metrics: ['passesCompleted90', 'passAcc'] },
      { id: 'gkSweep', label: 'שוער שמשתתף בהשבות כדור', metrics: ['recoveries90', 'passesCompleted90'] }
    ],
    DF: [
      { id: 'dfBuild', label: 'בלם/מגן שמוציא כדור', metrics: ['passesCompleted90', 'progPasses90', 'progCarries90'] },
      { id: 'dfFront', label: 'מגן שמשחק קדימה', metrics: ['tackles90', 'interceptions90', 'highPress90', 'pressures90'] },
      { id: 'dfWide', label: 'מגן כנף התקפי', metrics: ['crosses90', 'keyPasses90', 'progCarries90'] }
    ],
    MF: [
      { id: 'mfPress', label: 'קשר לוחץ', metrics: ['pressures90', 'counterpress90', 'recoveries90', 'tackles90'] },
      { id: 'mfCreate', label: 'קשר יוצר', metrics: ['keyPasses90', 'xa90', 'progPasses90'] },
      { id: 'mfCarry', label: 'קשר מוביל כדור', metrics: ['progCarries90', 'dribblesWon90', 'progPasses90'] },
      { id: 'mfHub', label: 'קשר מחלק (מרכז המסירות)', metrics: ['passesCompleted90', 'passAcc', 'progPasses90'] }
    ],
    FW: [
      { id: 'fwFinish', label: 'חלוץ מסיים', metrics: ['npxg90', 'shots90', 'boxTouches90'] },
      { id: 'fwPress', label: 'חלוץ לוחץ גבוה', metrics: ['highPress90', 'counterpress90', 'pressures90'] },
      { id: 'fwCreate', label: 'כנף/חלוץ יוצר', metrics: ['keyPasses90', 'xa90', 'dribblesWon90', 'crosses90'] }
    ],
    OT: []
  });

  const LICENCE_NOTE = 'נתוני StatsBomb Open Data — לימוד, מחקר ושיתוף ציבורי עם קרדיט בלבד; שימוש מסחרי בנתונים ובניתוח שנגזר מהם אסור (LICENSE.pdf, סעיף 1.2.2). דוח זה אינו למכירה. לעבודה מסחרית: הריצו את אותו דוח על נתונים שיש לכם רישיון עליהם («הביאו נתונים שלכם»).';

  const FIXED_CAVEATS = Object.freeze([
    'נתוני אירועים בלבד: אין נתוני מעקב (ריצות בלי כדור, מהירות, מרחק), ואין מדידות גוף — בכוונה.',
    'האחוזונים יחסיים לשחקנים באותה קבוצת עמדה באותו טורניר (270+ דקות), לא לליגה או לעולם.',
    'טורניר נבחרות = מעט משחקים, יריבים שונים וסגנון נבחרת; ביצועים במועדון יכולים להיות שונים.',
    'הדוח לא מסיק אופי, מנטליות או אישיות, ולא משתמש בתמונות.'
  ]);

  function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

  function metricValue(p, m) {
    const n = num(p[m.num]);
    const d = num(p[m.den]);
    if (m.kind === 'rate') return d > 0 ? n / d * 90 : null;
    if (d < (m.minDen || 1)) return null;
    return n / d * 100;
  }

  function percentile(value, peers) {
    if (value == null || !peers.length) return null;
    let below = 0;
    let equal = 0;
    peers.forEach(function (x) { if (x < value) below += 1; else if (x === value) equal += 1; });
    return Math.round((below + equal / 2) / peers.length * 100);
  }

  function peersOf(pool, player) {
    const g = player.positionGroup || positionGroup(player.position);
    return pool.filter(function (p) {
      return p.t === player.t && (p.positionGroup || positionGroup(p.position)) === g && num(p.minutes) >= PEER_MIN_MINUTES;
    });
  }

  function profile(pool, player) {
    const peers = peersOf(pool, player);
    const g = player.positionGroup || positionGroup(player.position);
    return PROFILE.filter(function (m) {
      if (m.id === 'gkLongShare') return g === 'GK';
      if (g === 'GK') return ['passesCompleted90', 'passAcc', 'recoveries90'].indexOf(m.id) >= 0;
      return true;
    }).map(function (m) {
      const v = metricValue(player, m);
      const peerVals = peers.map(function (p) { return metricValue(p, m); }).filter(function (x) { return x != null; });
      return { id: m.id, label: m.label, kind: m.kind, value: v, pct: percentile(v, peerVals), peers: peerVals.length };
    });
  }

  function roleFit(prof, group) {
    const byId = {};
    prof.forEach(function (r) { byId[r.id] = r; });
    return (ROLES[group] || []).map(function (role) {
      const pcts = role.metrics.map(function (id) { return byId[id] && byId[id].pct; }).filter(function (x) { return x != null; });
      const score = pcts.length ? Math.round(pcts.reduce(function (s, x) { return s + x; }, 0) / pcts.length) : null;
      return { id: role.id, label: role.label, score: score, metrics: role.metrics };
    }).sort(function (a, b) { return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score); });
  }

  function fmt(v, kind) {
    if (v == null) return '—';
    return kind === 'share' || kind === 'style' ? v.toFixed(0) + '%' : v.toFixed(2);
  }

  function buildReport(pool, player, tournamentLabel) {
    const group = player.positionGroup || positionGroup(player.position);
    const prof = profile(pool, player);
    const ranked = prof.filter(function (r) { return r.kind !== 'style' && r.pct != null; });
    const strengths = ranked.filter(function (r) { return r.pct >= STRENGTH_PCT; })
      .sort(function (a, b) { return b.pct - a.pct; }).slice(0, 4);
    const weaknesses = ranked.filter(function (r) { return r.pct <= WEAKNESS_PCT; })
      .sort(function (a, b) { return a.pct - b.pct; }).slice(0, 3);
    const roles = roleFit(prof, group);
    const caveats = [];
    const minutes = num(player.minutes);
    if (minutes < LOW_MINUTES) caveats.push('מדגם קטן: ' + Math.round(minutes) + ' דקות בלבד (פחות מ-' + LOW_MINUTES + '). כל אחוזון כאן רועש מאוד.');
    else caveats.push(Math.round(minutes) + ' דקות ב-' + num(player.matches) + ' משחקים — עדיין מדגם של טורניר אחד.');
    const peersN = prof.length ? Math.max.apply(null, prof.map(function (r) { return r.peers; })) : 0;
    if (peersN < 20) caveats.push('רק ' + peersN + ' שחקני השוואה בעמדה — האחוזונים גסים.');
    if (group === 'OT') caveats.push('העמדה לא זוהתה; אין תבנית תפקיד.');
    FIXED_CAVEATS.forEach(function (c) { caveats.push(c); });
    return {
      player: { id: player.id, t: player.t, name: player.name, team: player.team, position: player.position, group: group, groupLabel: GROUP_LABELS[group], minutes: minutes, matches: num(player.matches) },
      tournamentLabel: tournamentLabel || player.t,
      profile: prof,
      strengths: strengths,
      weaknesses: weaknesses,
      noStrengthNote: strengths.length ? '' : 'אין מדד שבו השחקן ברבע העליון בעמדה שלו בטורניר הזה.',
      noWeaknessNote: weaknesses.length ? '' : 'אין מדד שבו השחקן ברבע התחתון בעמדה שלו בטורניר הזה.',
      roles: roles,
      caveats: caveats,
      licence: player.t === 'byod'
        ? 'נתונים שהעליתם מהמחשב שלכם; הם לא נשלחו לשרת. ודאו שיש לכם רישיון להשתמש בהם.'
        : LICENCE_NOTE,
      describe: function (r) { return r.label + ': ' + fmt(r.value, r.kind) + (r.pct != null ? ' (אחוזון ' + r.pct + ')' : ''); }
    };
  }

  // ---------- shortlist ----------
  function keyOf(p) { return String(p.t) + ':' + String(p.id); }

  function loadShortlist(storage) {
    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (x) { return x && x.t != null && x.id != null; }) : [];
    } catch (e) { return []; }
  }

  function saveShortlist(storage, list) {
    try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  function addToShortlist(list, player, note) {
    const k = keyOf(player);
    if (list.some(function (x) { return keyOf(x) === k; })) return list.slice();
    const item = { t: player.t, id: player.id, name: player.name, team: player.team, note: note || '' };
    // BYOD rows are not reloadable from the repo, so keep their numbers.
    if (player.t === 'byod') item.row = player;
    return list.concat([item]);
  }

  function removeFromShortlist(list, player) {
    const k = keyOf(player);
    return list.filter(function (x) { return keyOf(x) !== k; });
  }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // no formula injection in Excel
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const CSV_HEADER = ['שם', 'נבחרת/קבוצה', 'טורניר', 'עמדה', 'דקות', 'משחקים', 'תפקיד מתאים ביותר', 'ציון התאמה (0-100)', 'חוזקות', 'חולשות', 'הערה', 'מקור ורישיון'];

  function shortlistCsv(reports, notes) {
    const lines = [CSV_HEADER.map(csvCell).join(',')];
    reports.forEach(function (r, i) {
      const best = r.roles[0];
      lines.push([
        r.player.name, r.player.team, r.tournamentLabel, r.player.groupLabel,
        Math.round(r.player.minutes), r.player.matches,
        best ? best.label : '', best && best.score != null ? best.score : '',
        r.strengths.map(function (s) { return s.label + ' (' + s.pct + ')'; }).join('; '),
        r.weaknesses.map(function (s) { return s.label + ' (' + s.pct + ')'; }).join('; '),
        (notes && notes[i]) || '',
        r.player.t === 'byod' ? 'נתונים שלכם' : 'StatsBomb Open Data — לא למכירה'
      ].map(csvCell).join(','));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // BYOD players: CSV with name, team, position, minutes and any of the raw
  // count columns used above (passes, passesCompleted, pressures, ...).
  const BYOD_COLUMNS = ['minutes', 'matches', 'passes', 'passesCompleted', 'progPasses', 'progCarries', 'keyPasses', 'xa', 'npxg', 'npShots', 'boxTouches', 'dribblesWon', 'crosses', 'pressures', 'highPress', 'counterpress', 'tacklesWon', 'interceptions', 'recoveries', 'openLong', 'openPasses', 'gkLong', 'gkPasses'];

  function parseByodPlayers(parsed) {
    const h = parsed.header || [];
    const lower = h.map(function (x) { return x.toLowerCase(); });
    const need = ['name', 'position', 'minutes'];
    const missing = need.filter(function (c) { return lower.indexOf(c.toLowerCase()) < 0; });
    if (missing.length) return { error: 'חסרות עמודות: ' + missing.join(', ') + '.', players: [] };
    function col(name) { return h[lower.indexOf(name.toLowerCase())]; }
    const players = [];
    (parsed.rows || []).forEach(function (r, i) {
      const name = r[col('name')];
      if (!name) return;
      const p = { t: 'byod', id: 'byod-' + i, name: name, team: lower.indexOf('team') >= 0 ? r[col('team')] : '', position: r[col('position')] };
      BYOD_COLUMNS.forEach(function (c) {
        const idx = lower.indexOf(c.toLowerCase());
        p[c] = idx >= 0 ? num(r[h[idx]]) : 0;
      });
      if (!p.matches) p.matches = 1;
      p.positionGroup = positionGroup(p.position);
      players.push(p);
    });
    return { players: players };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    PEER_MIN_MINUTES: PEER_MIN_MINUTES,
    PROFILE: PROFILE,
    ROLES: ROLES,
    GROUP_LABELS: GROUP_LABELS,
    LICENCE_NOTE: LICENCE_NOTE,
    CSV_HEADER: CSV_HEADER,
    BYOD_COLUMNS: BYOD_COLUMNS,
    positionGroup: positionGroup,
    metricValue: metricValue,
    percentile: percentile,
    profile: profile,
    roleFit: roleFit,
    buildReport: buildReport,
    fmt: fmt,
    keyOf: keyOf,
    loadShortlist: loadShortlist,
    saveShortlist: saveShortlist,
    addToShortlist: addToShortlist,
    removeFromShortlist: removeFromShortlist,
    csvCell: csvCell,
    shortlistCsv: shortlistCsv,
    parseByodPlayers: parseByodPlayers
  };
}));
