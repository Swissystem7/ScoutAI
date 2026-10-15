(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const demo = isNode ? require('./demo.js') : root.ScoutAIDemo;
  const api = factory(demo);
  if (isNode) module.exports = api;
  else root.ScoutAIGemsBase = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Demo) {
  'use strict';

  // Split for review size: gems-base.js -> gems-validate.js -> gems.js (load in that order); gems.js is the public module.

  // «שוברים את הסטטיסטיקה» — hidden gems and physical-bias correction.
  //
  // 1. Physical share: how much of a player's conventional rating comes from
  //    physical / aerial / duel events vs technical / decision events.
  // 2. Technical-decision index (TDI): six technical / decision components,
  //    NO aerials, NO physical duels, NO headers, z-scored within role.
  // 3. Hidden gems: high TDI, low conventional rating (and often low minutes).
  //
  // Pre-registered before looking at any test result (do not tune on test):
  //   point weights, TDI components, shrinkage, roles, thresholds, the two
  //   splits, the three outcomes, the gem rule and the verdict rule below.
  //
  // Data: data/wc2018_gems_matches.json (tools/build-gems.js) — StatsBomb Open
  // Data WC2018, one row per player per match. Heights: data/wc2018_heights.json
  // (tools/build-heights.js, Wikidata CC0) — only to TEST the size-bias premise.

  const DATA_PATH = 'data/wc2018_gems_matches.json';
  const HEIGHTS_PATH = 'data/wc2018_heights.json';

  const SHRINK_MINUTES = 90;      // pseudo-minutes at the role average for every /90 rate
  const SHRINK_PASSES = 15;       // pseudo-attempts at the role rate for pass accuracy under pressure
  const MIN_TRAIN_MINUTES = 90;   // eligibility in a training split
  const MIN_TEST_MINUTES = 60;    // eligibility for a test outcome
  const GEM_MIN_TDI = 70;         // hidden gem: TDI percentile within role >= 70 ...
  const GEM_MAX_CONV = 50;        // ... and conventional-rating percentile within role <= 50
  const BOOTSTRAP_REPS = 1000;
  const BOOTSTRAP_SEED = 20260929;

  // Roles: finer than DF/MF/FW because centre-backs and full-backs (or
  // holding and attacking midfielders) do different jobs — comparing a
  // full-back's aerials to a centre-back's is itself a size bias.
  const ROLES = Object.freeze({
    CB: 'בלם',
    FB: 'מגן / כנף-מגן',
    CM: 'קשר אחורי / מרכזי',
    AM: 'קשר התקפי / כנף',
    ST: 'חלוץ'
  });

  function roleOf(position) {
    const p = String(position || '');
    if (/goalkeeper/i.test(p)) return 'GK';
    if (/center back/i.test(p)) return 'CB';
    if (/(left|right) (wing )?back/i.test(p) || /^(left|right) back$/i.test(p)) return 'FB';
    if (/defensive midfield|center midfield|^(left|right) center midfield$/i.test(p)) return 'CM';
    if (/attacking midfield|^(left|right) midfield$|wing$/i.test(p)) return 'AM';
    if (/forward|striker/i.test(p)) return 'ST';
    // client data: accept the role codes themselves or DF/MF/FW
    const code = p.trim().toUpperCase();
    if (ROLES[code]) return code;
    if (code === 'DF') return 'CB';
    if (code === 'MF') return 'CM';
    if (code === 'FW') return 'ST';
    return 'OT';
  }

  // ---- 1. conventional rating and its physical share ----------------------
  // A transparent points system in the style of public match ratings: every
  // event earns fixed points. «Physical» = aerial contests, physical duels,
  // blocks, clearances, shielding, fouls drawn and headed-shot xG.

  const PHYSICAL_ITEMS = Object.freeze([
    Object.freeze({ id: 'aerialWon', label: 'דו-קרב אווירי שנוצח', weight: 1 }),
    Object.freeze({ id: 'tacklesWon', label: 'תיקול מוצלח', weight: 1 }),
    Object.freeze({ id: 'fiftyWon', label: '50/50 שנוצח', weight: 0.5 }),
    Object.freeze({ id: 'clearances', label: 'הרחקה (לא אווירית)', weight: 0.5 }),
    Object.freeze({ id: 'blocks', label: 'חסימה', weight: 0.5 }),
    Object.freeze({ id: 'shields', label: 'הגנה על כדור בגוף', weight: 0.5 }),
    Object.freeze({ id: 'foulsWon', label: 'עבירה שנסחטה', weight: 0.5 }),
    Object.freeze({ id: 'headedXg', label: 'xG מנגיחות', weight: 3 })
  ]);

  const TECHNICAL_ITEMS = Object.freeze([
    Object.freeze({ id: 'passesIntoBox', label: 'מסירה לרחבה', weight: 1 }),
    Object.freeze({ id: 'progPasses', label: 'מסירה מקדמת', weight: 0.5 }),
    Object.freeze({ id: 'progCarries', label: 'הובלה מקדמת', weight: 0.5 }),
    Object.freeze({ id: 'receptionsBetweenLines', label: 'קבלה בין הקווים', weight: 0.5 }),
    Object.freeze({ id: 'pressuredPassesCompleted', label: 'מסירה מדויקת תחת לחץ', weight: 0.2 }),
    Object.freeze({ id: 'counterpress', label: 'לחץ-נגד', weight: 0.3 }),
    Object.freeze({ id: 'interceptionsWon', label: 'חטיפה', weight: 1 }),
    Object.freeze({ id: 'recoveries', label: 'השבת כדור', weight: 0.5 }),
    Object.freeze({ id: 'dribblesCompleted', label: 'כדרור מוצלח', weight: 1 }),
    Object.freeze({ id: 'keyPassesOpen', label: 'מסירת מפתח', weight: 1 }),
    Object.freeze({ id: 'footXg', label: 'xG מבעיטות (לא נגיחות)', weight: 3 })
  ]);

  // ---- 2. technical-decision index -----------------------------------------

  const TDI_COMPONENTS = Object.freeze([
    Object.freeze({
      id: 'intoBox', label: 'מסירות לרחבה ל-90', short: 'לרחבה',
      definition: 'מסירה מוצלחת במשחק פתוח שיוצאת מחוץ לרחבה ונגמרת בתוכה.',
      fields: 'passesIntoBox'
    }),
    Object.freeze({
      id: 'progression', label: 'קידום כדור ל-90', short: 'קידום',
      definition: 'מסירות מוצלחות והובלות שמקרבות את הכדור לשער ב-25% לפחות (הובלה: גם 5 יחידות לפחות).',
      fields: 'progPasses + progCarries'
    }),
    Object.freeze({
      id: 'betweenLines', label: 'קבלות בין הקווים ל-90', short: 'בין קווים',
      definition: 'קבלת כדור מוצלחת מול הרחבה, ברוחב הרחבה (x 78–102, y 18–62). קירוב מיקומי: בנתונים הפתוחים של 2018 אין מיקום של שחקני היריב.',
      fields: 'receptionsBetweenLines'
    }),
    Object.freeze({
      id: 'pressAccuracy', label: 'דיוק מסירה תחת לחץ', short: 'תחת לחץ',
      definition: 'שיעור המסירות המוצלחות מבין מסירות במשחק פתוח שסומנו under_pressure. מכווץ לשיעור של התפקיד (15 מסירות מדומות).',
      fields: 'pressuredPassesCompleted / pressuredPasses'
    }),
    Object.freeze({
      id: 'counterpress', label: 'לחץ-נגד ל-90', short: 'לחץ-נגד',
      definition: 'פעולות שסומנו counterpress — לחץ תוך 5 שניות מאיבוד כדור של הקבוצה.',
      fields: 'counterpress'
    }),
    Object.freeze({
      id: 'positional', label: 'חטיפות והשבות ל-90', short: 'מיקום',
      definition: 'חטיפות מוצלחות והשבות כדור — הגנה במיקום ובקריאת משחק, לא בגוף.',
      fields: 'interceptionsWon + recoveries'
    })
  ]);
  const TDI_IDS = TDI_COMPONENTS.map(function (c) { return c.id; });

  const EXCLUDED_FROM_TDI = Object.freeze([
    'דו-קרבות אוויריים (נוצחו / הופסדו)', 'תיקולים ודו-קרבות קרקע', '50/50', 'הרחקות',
    'חסימות', 'הגנה על כדור בגוף', 'עבירות שנסחטו', 'נגיחות ו-xG מנגיחות'
  ]);

  // ---- helpers ---------------------------------------------------------------

  const SUM_FIELDS = Object.freeze([
    'minutes', 'aerialWon', 'aerialLost', 'tacklesWon', 'tacklesLost', 'fiftyWon', 'clearances',
    'blocks', 'shields', 'foulsWon', 'headedShots', 'headedXg',
    'passesIntoBox', 'progPasses', 'progCarries', 'receptionsBetweenLines',
    'pressuredPasses', 'pressuredPassesCompleted', 'counterpress', 'interceptionsWon',
    'recoveries', 'dribblesCompleted', 'keyPassesOpen', 'xa', 'footShots', 'footXg',
    'xgChain', 'xgBuildup', 'npxg',
    'pressures', 'tackles', 'interceptions', 'defensiveActions', 'progressiveActions',
    'keyPasses', 'passesCompleted', 'shotXgSum', 'boxTouches', 'shotsOnTarget'
  ]);

  function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
  function round1(x) { return Math.round(Number(x) * 10) / 10; }
  function round2(x) { return Math.round(Number(x) * 100) / 100; }
  function mean(values) { return values.length ? values.reduce(function (s, x) { return s + x; }, 0) / values.length : 0; }
  function meanSd(values) {
    if (!values.length) return { mean: 0, sd: 1 };
    const m = mean(values);
    const v = values.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / Math.max(1, values.length - 1);
    return { mean: m, sd: Math.sqrt(v) || 1 };
  }
  function percentileWithin(value, peers) {
    if (!peers.length) return 50;
    let below = 0;
    peers.forEach(function (x) { if (x <= value) below += 1; });
    return round1(below / peers.length * 100);
  }
  function matchRows(dataset) {
    if (Array.isArray(dataset)) return dataset;
    if (dataset && Array.isArray(dataset.rows)) return dataset.rows;
    if (dataset && Array.isArray(dataset.players)) return dataset.players;
    return [];
  }
  function playerKey(r) {
    if (r.playerId != null && String(r.playerId)) return String(r.playerId);
    if (r.id != null && String(r.id)) return String(r.id);
    return String(r.name || '') + '|' + String(r.team || '');
  }

  // Sum per-match rows into one row per player (outfield only). Per-player
  // client rows pass straight through (one «match» each).
  function aggregatePlayers(rows) {
    const byId = new Map();
    rows.forEach(function (r) {
      const key = playerKey(r);
      if (!byId.has(key)) {
        const base = { id: key, name: r.name, team: r.team || '', positionMinutes: {}, matches: 0 };
        SUM_FIELDS.forEach(function (f) { base[f] = 0; });
        if (r.heightCm != null && r.heightCm !== '') base.heightCm = num(r.heightCm);
        if (r.birthMonth != null && r.birthMonth !== '') base.birthMonth = num(r.birthMonth);
        byId.set(key, base);
      }
      const p = byId.get(key);
      SUM_FIELDS.forEach(function (f) { p[f] += num(r[f]); });
      const role = roleOf(r.position || r.role);
      p.positionMinutes[role] = (p.positionMinutes[role] || 0) + num(r.minutes);
      if (!p.position) p.position = r.position || r.role || '';
      p.matches += 1;
    });
    const out = [];
    byId.forEach(function (p) {
      const role = Object.keys(p.positionMinutes).sort(function (a, b) {
        return p.positionMinutes[b] - p.positionMinutes[a];
      })[0] || 'OT';
      delete p.positionMinutes;
      p.role = role;
      if (role !== 'GK' && role !== 'OT' && p.minutes > 0) out.push(p);
    });
    return out;
  }

  function points(p, items) {
    return items.reduce(function (s, it) { return s + num(p[it.id]) * it.weight; }, 0);
  }

  // Shrunk per-90 rate: count plus SHRINK_MINUTES at the role's pooled rate.
  function shrunk90(count, minutes, roleRate90) {
    return (count + roleRate90 * SHRINK_MINUTES / 90) / (minutes + SHRINK_MINUTES) * 90;
  }

  function roleRates(players) {
    const pools = {};
    players.forEach(function (p) {
      const t = pools[p.role] = pools[p.role] || { minutes: 0, phys: 0, tech: 0, intoBox: 0, progression: 0, betweenLines: 0, counterpress: 0, positional: 0, pp: 0, ppc: 0 };
      t.minutes += p.minutes;
      t.phys += points(p, PHYSICAL_ITEMS);
      t.tech += points(p, TECHNICAL_ITEMS);
      t.intoBox += p.passesIntoBox;
      t.progression += p.progPasses + p.progCarries;
      t.betweenLines += p.receptionsBetweenLines;
      t.counterpress += p.counterpress;
      t.positional += p.interceptionsWon + p.recoveries;
      t.pp += p.pressuredPasses;
      t.ppc += p.pressuredPassesCompleted;
    });
    const rates = {};
    Object.keys(pools).forEach(function (role) {
      const t = pools[role];
      const per = function (x) { return t.minutes > 0 ? x * 90 / t.minutes : 0; };
      rates[role] = {
        phys: per(t.phys), tech: per(t.tech), intoBox: per(t.intoBox), progression: per(t.progression),
        betweenLines: per(t.betweenLines), counterpress: per(t.counterpress), positional: per(t.positional),
        pressAccuracy: t.pp > 0 ? t.ppc / t.pp : 0.75
      };
    });
    return rates;
  }

  // Raw (pre-z) values for each player from a set of rows.
  function computePlayers(rows) {
    const players = aggregatePlayers(rows);
    const rates = roleRates(players);
    players.forEach(function (p) {
      const r = rates[p.role];
      const phys = points(p, PHYSICAL_ITEMS);
      const tech = points(p, TECHNICAL_ITEMS);
      p.physPoints = phys;
      p.techPoints = tech;
      p.physicalShare = phys + tech > 0 ? phys / (phys + tech) : null;
      p.phys90 = shrunk90(phys, p.minutes, r.phys);
      p.conventional90 = shrunk90(phys + tech, p.minutes, r.phys + r.tech);
      p.aerials90 = p.minutes > 0 ? (p.aerialWon + p.aerialLost) * 90 / p.minutes : 0;
      p.raw = {
        intoBox: shrunk90(p.passesIntoBox, p.minutes, r.intoBox),
        progression: shrunk90(p.progPasses + p.progCarries, p.minutes, r.progression),
        betweenLines: shrunk90(p.receptionsBetweenLines, p.minutes, r.betweenLines),
        pressAccuracy: (p.pressuredPassesCompleted + SHRINK_PASSES * r.pressAccuracy) / (p.pressuredPasses + SHRINK_PASSES),
        counterpress: shrunk90(p.counterpress, p.minutes, r.counterpress),
        positional: shrunk90(p.interceptionsWon + p.recoveries, p.minutes, r.positional)
      };
      p.impact = impactOf(p);
      p.outcomes = {
        xgChain: p.minutes > 0 ? p.xgChain * 90 / p.minutes : 0,
        xgBuildup: p.minutes > 0 ? p.xgBuildup * 90 / p.minutes : 0,
        xgxa: p.minutes > 0 ? (p.npxg + p.xa) * 90 / p.minutes : 0
      };
    });
    return players;
  }

  // The main lab's Impact (40/30/30, same caps), for comparison.
  function impactOf(p) {
    const prepared = Demo.preparePlayer({
      name: p.name, team: p.team, position: p.position, minutes: p.minutes,
      pressures: p.pressures, tackles: p.tackles, interceptions: p.interceptions,
      defensiveActions: p.defensiveActions, progressiveActions: p.progressiveActions,
      keyPasses: p.keyPasses, passesCompleted: p.passesCompleted,
      shotXgSum: p.shotXgSum, boxTouches: p.boxTouches, shotsOnTarget: p.shotsOnTarget
    }, { provenance: 'STATSBOMB_OPEN_DATA' });
    return Demo.compositeScore(prepared.components, { grit: 40, involvement: 30, clutch: 30 });
  }

  return { DATA_PATH, HEIGHTS_PATH, SHRINK_MINUTES, SHRINK_PASSES, MIN_TRAIN_MINUTES,
    MIN_TEST_MINUTES, GEM_MIN_TDI, GEM_MAX_CONV, BOOTSTRAP_REPS, BOOTSTRAP_SEED, ROLES, roleOf,
    PHYSICAL_ITEMS, TECHNICAL_ITEMS, TDI_COMPONENTS, TDI_IDS, EXCLUDED_FROM_TDI, SUM_FIELDS, num,
    round1, round2, mean, meanSd, percentileWithin, matchRows, playerKey, aggregatePlayers, points,
    shrunk90, roleRates, computePlayers, impactOf };
}));
