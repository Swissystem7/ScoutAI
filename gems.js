(function (root, factory) {
  const demo = (typeof module === 'object' && module.exports)
    ? require('./demo.js')
    : root.ScoutAIDemo;
  const api = factory(demo);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIGems = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Demo) {
  'use strict';

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
