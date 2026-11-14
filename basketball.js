(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const demo = isNode ? require('./demo.js') : root.ScoutAIDemo;
  const api = factory(demo);
  if (isNode) module.exports = api;
  else root.ScoutAIBasketball = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Demo) {
  'use strict';

  // Basketball lab: the same idea as the football lab (a transparent,
  // arguable composite metric), on a CSV the user is licensed to run.
  // There is no bundled real league: only the user's file or the synthetic
  // example in data/basketball.example.csv.

  // FIBA games are 40 minutes (Winner League, EuroLeague); rates are per 40.
  const PER_MINUTES = 40;
  // A file whose highest minutes value is at most one NBA game is per-game
  // averages (Basketball-Reference "Per Game") or a single box score.
  const MAX_GAME_MINUTES = 48;
  const HEADER_SCAN = 5;

  const USER_DATA_PROVENANCE = Demo.USER_DATA_PROVENANCE;
  const SYNTHETIC_PROVENANCE = Demo.SYNTHETIC_PROVENANCE;
  const EXAMPLE_PATH = 'data/basketball.example.csv';

  // Scoring gets the largest default weight because shooting is the largest
  // of Dean Oliver's Four Factors (about 40%; later regressions put it at
  // 45-54%). 250 minutes is the floor Franks et al. (2016, JQAS) used before
  // judging NBA box-score metrics; below it per-minute rates are mostly noise.
  // Sources are listed on basketball/index.html.
  const DEFAULT_SPEC = Object.freeze({
    defense: 30,
    playmaking: 30,
    scoring: 40,
    minMinutes: 250,
    outcomeId: ''
  });

  const COMPONENT_LABELS = Object.freeze({ defense: 'הגנה', playmaking: 'יצירה', scoring: 'קליעה' });

  const FIELDS = Object.freeze([
    'name', 'team', 'position', 'games', 'minutes', 'points', 'rebounds', 'offRebounds', 'defRebounds',
    'assists', 'steals', 'blocks', 'turnovers', 'fgm', 'fga', 'ftm', 'fta', 'threePm', 'threePa',
    'fouls', 'plusMinus', 'pir'
  ]);
  const TEXT_FIELDS = Object.freeze(['name', 'team', 'position']);
  // +/- and efficiency can be negative; every other count cannot.
  const SIGNED_FIELDS = Object.freeze(['plusMinus', 'pir']);

  // Basketball-Reference, NBA/EuroLeague box scores, basket.co.il style
  // Hebrew headers. Keys are plainHeader() forms.
  const HEADER_ALIASES = Object.freeze({
    player: 'name', playername: 'name', fullname: 'name', 'שם': 'name', 'שחקן': 'name', 'שםשחקן': 'name',
    tm: 'team', club: 'team', squad: 'team', 'קבוצה': 'team', 'מועדון': 'team',
    pos: 'position', 'עמדה': 'position',
    g: 'games', gp: 'games', gamesplayed: 'games', 'משחקים': 'games',
    mp: 'minutes', min: 'minutes', mins: 'minutes', minutesplayed: 'minutes', 'דקות': 'minutes',
    pts: 'points', 'נקודות': 'points',
    trb: 'rebounds', reb: 'rebounds', totalrebounds: 'rebounds', 'ריבאונדים': 'rebounds',
    orb: 'offRebounds', oreb: 'offRebounds', offensiverebounds: 'offRebounds', 'ריבאונדהתקפה': 'offRebounds',
    drb: 'defRebounds', dreb: 'defRebounds', defensiverebounds: 'defRebounds', 'ריבאונדהגנה': 'defRebounds',
    ast: 'assists', 'אסיסטים': 'assists',
    stl: 'steals', 'חטיפות': 'steals',
    blk: 'blocks', 'חסימות': 'blocks',
    tov: 'turnovers', to: 'turnovers', 'איבודים': 'turnovers',
    fg: 'fgm', fieldgoals: 'fgm', fieldgoalsmade: 'fgm',
    fieldgoalattempts: 'fga',
    ft: 'ftm', freethrows: 'ftm', freethrowsmade: 'ftm',
    freethrowattempts: 'fta',
    '3p': 'threePm', '3pm': 'threePm', '3fgm': 'threePm',
    '3pa': 'threePa', '3fga': 'threePa',
    pf: 'fouls', 'עבירות': 'fouls',
    '+/-': 'plusMinus', '+-': 'plusMinus', pm: 'plusMinus', plusminus: 'plusMinus', 'פלוסמינוס': 'plusMinus',
    eff: 'pir', efficiency: 'pir', val: 'pir', valuation: 'pir', 'מדד': 'pir', 'מדדיעילות': 'pir'
  });

  // Basketball-Reference lists a traded player once per team plus one
  // combined row whose team is TOT (before 2024) or 2TM / 3TM (since).
  const MULTI_TEAM_RE = /^(tot|\d+tm)$/i;

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function clamp(value, lo, hi) {
    const n = Number(value);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function round1(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function has(row, key) {
    return !!row && typeof row[key] === 'number' && Number.isFinite(row[key]);
  }

  function per40(value, minutes) {
    const mins = Number(minutes) || 0;
    if (mins <= 0) return 0;
    return (Number(value) || 0) * PER_MINUTES / mins;
  }

  function scaleCap(value, cap) {
    return clamp((Number(value) || 0) / cap * 100, 0, 100);
  }

  function fnv1a(text) {
    let h = 2166136261;
    const str = String(text || '');
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
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

  function shownList(items, limit) {
    const max = limit || 5;
    return items.slice(0, max).join(', ') + (items.length > max ? ' ועוד ' + (items.length - max) : '');
  }

  // ---------------------------------------------------------------- CSV ---

  function plainHeader(header) {
    return String(header == null ? '' : header).trim().toLowerCase()
      .replace(/−/g, '-')
      .replace(/[\s_.]+/g, '');
  }

  function resolveHeader(header) {
    const plain = plainHeader(header);
    if (!plain) return null;
    for (let i = 0; i < FIELDS.length; i += 1) {
      if (FIELDS[i].toLowerCase() === plain) return FIELDS[i];
    }
    return own(HEADER_ALIASES, plain) ? HEADER_ALIASES[plain] : null;
  }

  // "32:15" (a box-score clock) is 32.25 minutes; anything else is a number.
  function minutesValue(raw, decimalComma) {
    const text = String(raw).trim();
    const clock = /^(\d{1,4}):([0-5]\d)$/.exec(text);
    if (clock) return { value: Number(clock[1]) + Number(clock[2]) / 60, clock: true };
    const n = Demo.csvNumber(text, decimalComma);
    return n === null ? null : { value: n, clock: false };
  }

  function sameAsHeader(cells, header) {
    const width = Math.max(cells.length, header.length);
    let filled = 0;
    for (let i = 0; i < width; i += 1) {
      const a = String(cells[i] == null ? '' : cells[i]).trim().toLowerCase();
      const b = String(header[i] == null ? '' : header[i]).trim().toLowerCase();
      if (a !== b) return false;
      if (a) filled += 1;
    }
    return filled > 0;
  }

  // Basketball-Reference columns that are only arithmetic on the box score
  // (FG%, eFG%, 2P…) or bookkeeping (Rk, GS). They are not new information,
  // so they are not offered as a "new line".
  function isDerivedBoxColumn(label) {
    const plain = plainHeader(label);
    return plain.indexOf('%') >= 0 || ['rk', 'gs', '2p', '2pa'].indexOf(plain) >= 0;
  }

  function isSummaryName(name) {
    return Demo.isSummaryRowName(name) || /^(team|league|opponent)\s+(totals?|average|avg)$/i.test(String(name).trim());
  }

  function fail(errors) {
    return { ok: false, errors: errors, warnings: [], players: [], provenance: null };
  }

  function parseBasketballCsv(text, options) {
    const opts = options || {};
    const synthetic = opts.synthetic === true;
    if (!synthetic && !opts.attested) {
      return fail(['סמנו שאישרתם שיש לכם רישיון להריץ את הקובץ מקומית.']);
    }
    const raw = String(text == null ? '' : text).replace(/^﻿/, '');
    if (!raw.trim()) return fail(['הקובץ ריק']);
    if (/^\s*[[{]/.test(raw)) {
      return fail(['מעבדת הכדורסל קוראת CSV בלבד (Basketball-Reference, ייצוא Excel או טבלה ידנית). שמרו את הקובץ כ-CSV.']);
    }
    const detected = Demo.detectCsvDelimiter(raw);
    const decimalComma = detected.delimiter === ';';
    let records = Demo.parseCsvRecords(raw, { delimiter: detected.delimiter });
    const errors = [];
    const warnings = [];
    const unclosed = records.unclosedQuote;
    if (unclosed) {
      records = records.filter(function (cells) { return cells !== unclosed.record; });
      errors.push('שורה ' + unclosed.line + ': מירכאה (") נפתחה ולא נסגרה — מה שאחריה נבלע בתא אחד ודולג');
    }
    let headerIdx = -1;
    for (let i = 0; i < Math.min(records.length, HEADER_SCAN) && headerIdx < 0; i += 1) {
      if (records[i].map(resolveHeader).indexOf('name') >= 0) headerIdx = i;
    }
    if (headerIdx < 0) {
      const first = records[0] || [];
      return fail(errors.concat(['חסרה עמודת שם שחקן (Player / שם). כותרות שנמצאו: ' +
        (first.slice(0, 6).join(' | ') || '(אין)')]));
    }
    const lineBase = (detected.offset ? 2 : 1) + headerIdx;
    const header = records[headerIdx];
    if (headerIdx > 0) warnings.push('הכותרת נמצאה בשורה ' + lineBase + '; השורות שלפניה דולגו');

    const col = {};
    const ignored = [];
    const dupes = [];
    const aliased = [];
    // Columns the formula does not read. A numeric one (body-language
    // coding, fWHR from photos, touches per game, a later-season target…)
    // becomes a candidate "new line" the lab can test; see featureTest.
    const extraCols = [];
    header.forEach(function (cell, i) {
      const key = resolveHeader(cell);
      const label = String(cell).trim();
      if (!key) {
        if (!label) return;
        if (isDerivedBoxColumn(label) || extraCols.some(function (c) { return c.label === label; })) ignored.push(label);
        else extraCols.push({ label: label, idx: i, numeric: 0, text: 0 });
        return;
      }
      if (own(col, key)) {
        dupes.push(label);
        return;
      }
      col[key] = i;
      if (plainHeader(label) !== key.toLowerCase()) aliased.push(label + '→' + key);
    });
    if (!own(col, 'minutes')) {
      return fail(errors.concat(['חסרה עמודת דקות (MP / MIN / דקות) — בלי דקות אי אפשר לחשב ערך ל-40 דקות.']));
    }
    if (aliased.length) warnings.push('כותרות שנקראו דרך קיצור: ' + shownList(aliased, 12));
    if (dupes.length) warnings.push('כותרות כפולות — נקרא רק העותק הראשון: ' + shownList(dupes));

    const players = [];
    const missing = {};
    const repeated = [];
    const summaries = [];
    let clockCells = 0;
    records.slice(headerIdx + 1).forEach(function (cells, i) {
      const lineNo = lineBase + 1 + i;
      if (sameAsHeader(cells, header)) {
        repeated.push(lineNo);
        return;
      }
      const name = String(cells[col.name] == null ? '' : cells[col.name]).trim();
      if (!name) {
        errors.push('שורה ' + lineNo + ': חסר שם — השורה דולגה');
        return;
      }
      if (isSummaryName(name)) {
        summaries.push(name);
        return;
      }
      const row = { name: name, line: lineNo };
      ['team', 'position'].forEach(function (key) {
        if (!own(col, key)) return;
        const value = String(cells[col[key]] == null ? '' : cells[col[key]]).trim();
        if (value) row[key] = value;
      });
      FIELDS.forEach(function (key) {
        if (TEXT_FIELDS.indexOf(key) >= 0 || !own(col, key)) return;
        const cell = cells[col[key]];
        if (cell == null || String(cell).trim() === '') return;
        if (Demo.csvMissingMarker(cell)) {
          missing[key] = (missing[key] || 0) + 1;
          return;
        }
        let value;
        if (key === 'minutes') {
          const parsed = minutesValue(cell, decimalComma);
          if (parsed && parsed.clock) clockCells += 1;
          value = parsed ? parsed.value : null;
        } else {
          value = Demo.csvNumber(cell, decimalComma);
        }
        if (value === null) {
          errors.push('שורה ' + lineNo + ' (' + name + '): ' + String(header[col[key]]).trim() + '=«' + cell + '» אינו מספר — התא נשאר ריק');
          return;
        }
        if (value < 0 && SIGNED_FIELDS.indexOf(key) < 0) {
          errors.push('שורה ' + lineNo + ' (' + name + '): ' + String(header[col[key]]).trim() + '=' + value + ' שלילי — נחשב חסר');
          return;
        }
        row[key] = value;
      });
      extraCols.forEach(function (c) {
        const cell = cells[c.idx];
        if (cell == null || String(cell).trim() === '' || Demo.csvMissingMarker(cell)) return;
        const value = Demo.csvNumber(cell, decimalComma);
        if (value === null) {
          c.text += 1;
          return;
        }
        c.numeric += 1;
        if (!row.extra) row.extra = {};
        row.extra[c.label] = value;
      });
      players.push(row);
    });

    // A column is a candidate line only when it is mostly numbers; a text
    // column (nationality, awards) is ignored and said so.
    const lines = [];
    extraCols.forEach(function (c) {
      if (c.numeric >= 2 && c.numeric >= c.text * 4) lines.push(c.label);
      else ignored.push(c.label);
    });
    players.forEach(function (row) {
      if (!row.extra) return;
      Object.keys(row.extra).forEach(function (label) {
        if (lines.indexOf(label) < 0) delete row.extra[label];
      });
    });
    if (lines.length) {
      warnings.push('עמודות נוספות שאפשר לבדוק כ«שורה חדשה» (לא נכנסות לנוסחה): ' + shownList(lines, 8));
    }
    if (ignored.length) warnings.push('עמודות שהמעבדה לא קוראת: ' + shownList(ignored, 8));

    if (repeated.length) warnings.push('שורת הכותרת חוזרת בתוך הקובץ (שורות ' + shownList(repeated.map(String)) + ') — העותקים דולגו');
    if (summaries.length) warnings.push('שורות סיכום דולגו ולא דורגו כשחקן: ' + shownList(summaries));
    if (clockCells) warnings.push(clockCells + ' תאי דקות בפורמט שעון (32:15) נקראו כדקות עשרוניות (32.25)');
    Object.keys(missing).forEach(function (key) {
      warnings.push('עמודת ' + String(header[col[key]]).trim() + ': ' + missing[key] + ' תאים ריקים (- / N/A) נחשבים חסרים, לא 0');
    });

    // Traded players: keep the combined TOT / 2TM row, drop the per-team rows.
    const combined = {};
    players.forEach(function (row) { if (MULTI_TEAM_RE.test(row.team || '')) combined[row.name] = true; });
    let droppedSplits = 0;
    let kept = players.filter(function (row) {
      if (combined[row.name] && !MULTI_TEAM_RE.test(row.team || '')) {
        droppedSplits += 1;
        return false;
      }
      return true;
    });
    if (droppedSplits) {
      warnings.push(Object.keys(combined).length + ' שחקנים עברו קבוצה באמצע העונה (שורת TOT / 2TM): נשארה רק שורת הסיכום שלהם, ו-' +
        droppedSplits + ' שורות לפי קבוצה דולגו כדי לא לספור אותם פעמיים');
    }

    const seen = {};
    const duplicateNames = [];
    kept.forEach(function (row) {
      const key = row.name + '|' + (row.team || '');
      if (seen[key] && duplicateNames.indexOf(row.name) < 0) duplicateNames.push(row.name);
      seen[key] = true;
    });
    if (duplicateNames.length) {
      warnings.push('שם שחקן חוזר באותה קבוצה (שורה שהודבקה פעמיים?): ' + shownList(duplicateNames) + ' — כל שורה מדורגת בנפרד');
    }

    // Per-game files.
    const minuteValues = kept.filter(function (row) { return has(row, 'minutes'); }).map(function (row) { return row.minutes; });
    const maxMinutes = minuteValues.length ? Math.max.apply(null, minuteValues) : 0;
    let perGame = false;
    if (maxMinutes > 0 && maxMinutes <= MAX_GAME_MINUTES) {
      const multiGame = own(col, 'games') && kept.some(function (row) { return has(row, 'games') && row.games > 1; });
      if (multiGame) {
        perGame = true;
        const noGames = [];
        kept = kept.map(function (row) {
          if (!has(row, 'games') || row.games <= 0) {
            noGames.push(row.name);
            return row;
          }
          const total = Object.assign({}, row);
          FIELDS.forEach(function (key) {
            if (TEXT_FIELDS.indexOf(key) >= 0 || key === 'games' || !has(row, key)) return;
            total[key] = round1(row[key] * row.games);
          });
          return total;
        });
        warnings.push('הדקות הגבוהות בקובץ הן ' + round1(maxMinutes) + ' — אלה ממוצעים למשחק. כל ספירה והדקות הוכפלו במספר המשחקים (G) כדי לקבל סכום עונתי. ערכים ל-40 דקות לא משתנים מזה; רק סף הדקות כן.');
        if (noGames.length) warnings.push('בלי מספר משחקים (G) ולכן נשארו כממוצע למשחק: ' + shownList(noGames));
      } else {
        warnings.push('הדקות הגבוהות בקובץ הן ' + round1(maxMinutes) + ' — נראה כמו ממוצע למשחק או משחק בודד, ואין עמודת משחקים (G). ערכים ל-40 דקות נכונים, אבל סף הדקות מתייחס לדקות שבקובץ — הורידו אותו.');
      }
    }

    const noMinutes = kept.filter(function (row) { return !has(row, 'minutes') || row.minutes <= 0; }).map(function (row) { return row.name; });
    if (noMinutes.length) warnings.push('בלי דקות (לא ידורגו): ' + shownList(noMinutes));

    if (!own(col, 'assists')) warnings.push('אין עמודת אסיסטים (AST) — יצירה תהיה 0 לכולם');
    else if (!own(col, 'turnovers')) warnings.push('אין עמודת איבודים (TOV) — יצירה מחושבת מאסיסטים בלבד, בלי יחס אסיסט/איבוד');
    if (!own(col, 'fga')) warnings.push('אין זריקות לסל (FGA) — קליעה מחושבת מנקודות בלבד, בלי אחוז קליעה אמיתי (TS%)');
    if (!own(col, 'defRebounds')) {
      if (own(col, 'rebounds') && own(col, 'offRebounds')) warnings.push('ריבאונד הגנה חושב כ-TRB פחות ORB');
      else if (own(col, 'rebounds')) warnings.push('אין ריבאונד הגנה (DRB) — הוערך כ-75% מהריבאונדים (TRB), הערכה ולא מדידה');
      else warnings.push('אין ריבאונדים בקובץ — הגנה מחושבת מחטיפות וחסימות בלבד');
    }

    if (!kept.length) return fail(errors.length ? errors : ['לא נמצאו שחקנים']);
    if (kept.length < 2) warnings.push('שחקן אחד — הדירוג יהיה טריוויאלי');

    return {
      ok: true,
      errors: errors,
      warnings: warnings,
      players: kept,
      perGame: perGame,
      columns: Object.keys(col),
      lines: lines,
      provenance: synthetic ? SYNTHETIC_PROVENANCE : USER_DATA_PROVENANCE,
      source: {
        dataset: opts.fileName || (synthetic ? EXAMPLE_PATH : 'user-upload'),
        sport: 'basketball',
        license: synthetic
          ? 'Synthetic teaching file shipped with ScoutAI — not match data'
          : 'User attested they licensed this file for local processing; ScoutAI does not grant that licence'
      }
    };
  }

  // --------------------------------------------------------- positions ---

  const POSITION_CODES = Object.freeze({
    G: ['G', 'PG', 'SG', 'CG', 'GUARD'],
    F: ['F', 'SF', 'PF', 'W', 'WING', 'FORWARD'],
    C: ['C', 'CENTER', 'CENTRE']
  });
  const POSITION_WORDS = Object.freeze([
    { group: 'G', re: /guard|רכז|קלע|גארד/i },
    { group: 'C', re: /center|centre|סנטר|פיבוט/i },
    { group: 'F', re: /forward|wing|פורוורד|פאוור|כנף/i }
  ]);

  function positionGroup(position) {
    const text = String(position || '').trim();
    if (!text) return 'OT';
    const tokens = text.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i += 1) {
      const groups = Object.keys(POSITION_CODES);
      for (let j = 0; j < groups.length; j += 1) {
        if (POSITION_CODES[groups[j]].indexOf(tokens[i]) >= 0) return groups[j];
      }
    }
    for (let k = 0; k < POSITION_WORDS.length; k += 1) {
      if (POSITION_WORDS[k].re.test(text)) return POSITION_WORDS[k].group;
    }
    return 'OT';
  }

  // -------------------------------------------------------- components ---

  function componentsFor(row) {
    const minutes = Number(row.minutes) || 0;
    const estimated = [];
    const steals = per40(row.steals, minutes);
    const blocks = per40(row.blocks, minutes);
    let defRebounds = 0;
    if (has(row, 'defRebounds')) {
      defRebounds = per40(row.defRebounds, minutes);
    } else if (has(row, 'rebounds') && has(row, 'offRebounds')) {
      defRebounds = per40(Math.max(0, row.rebounds - row.offRebounds), minutes);
    } else if (has(row, 'rebounds')) {
      defRebounds = per40(row.rebounds * 0.75, minutes);
      estimated.push('defRebounds');
    }
    // Box Plus/Minus 2.0 (Basketball-Reference) values a steal or a block at
    // roughly 0.7-1.4 points and a defensive rebound at 0.12-0.18: "it really
    // doesn't matter who on the team gets them". Hence the small DRB share.
    // BPM also warns the box score is "quite limited" on defense.
    const defense = round1(scaleCap(steals, 2.5) * 0.45 + scaleCap(blocks, 2) * 0.4 + scaleCap(defRebounds, 9) * 0.15);

    const assists = per40(row.assists, minutes);
    let astTo = null;
    let playmaking;
    if (has(row, 'turnovers')) {
      const ast = Number(row.assists) || 0;
      astTo = row.turnovers > 0 ? ast / row.turnovers : (ast > 0 ? 3 : 0);
      playmaking = round1(scaleCap(assists, 9) * 0.6 + scaleCap(astTo, 3) * 0.4);
    } else {
      playmaking = round1(scaleCap(assists, 9));
      estimated.push('turnovers');
    }

    // True Shooting % = PTS / (2 × (FGA + 0.44 × FTA)), Basketball-Reference
    // glossary (Dean Oliver). 0.44 approximates the share of free throws
    // that end a possession.
    const points = per40(row.points, minutes);
    const shots = (Number(row.fga) || 0) + 0.44 * (Number(row.fta) || 0);
    let ts = null;
    let scoring;
    if (has(row, 'fga') && shots > 0) {
      ts = (Number(row.points) || 0) / (2 * shots);
      scoring = round1(scaleCap(points, 30) * 0.5 + clamp((ts - 0.4) / 0.3 * 100, 0, 100) * 0.5);
    } else {
      scoring = round1(scaleCap(points, 30));
      estimated.push('fga');
    }

    return {
      defense: defense,
      playmaking: playmaking,
      scoring: scoring,
      raw: {
        steals40: round2(steals),
        blocks40: round2(blocks),
        defRebounds40: round2(defRebounds),
        assists40: round2(assists),
        astTo: astTo == null ? null : round2(astTo),
        points40: round2(points),
        ts: ts == null ? null : round2(ts)
      },
      estimated: estimated
    };
  }

  function normalizeSpec(spec) {
    const src = spec || {};
    return {
      defense: clamp(src.defense == null ? DEFAULT_SPEC.defense : src.defense, 0, 100),
      playmaking: clamp(src.playmaking == null ? DEFAULT_SPEC.playmaking : src.playmaking, 0, 100),
      scoring: clamp(src.scoring == null ? DEFAULT_SPEC.scoring : src.scoring, 0, 100),
      minMinutes: clamp(src.minMinutes == null ? DEFAULT_SPEC.minMinutes : src.minMinutes, 0, 4000),
      outcomeId: src.outcomeId ? String(src.outcomeId) : '',
      featureId: src.featureId ? String(src.featureId) : '',
      featurePer40: !!src.featurePer40
    };
  }

  function compositeScore(components, spec) {
    const w = normalizeSpec(spec);
    const total = w.defense + w.playmaking + w.scoring;
    if (!total) return 0;
    return round2((components.defense * w.defense + components.playmaking * w.playmaking + components.scoring * w.scoring) / total);
  }

  function formatFormula(spec) {
    const w = normalizeSpec(spec);
    const total = w.defense + w.playmaking + w.scoring;
    if (!total) return 'כל המשקלות 0 — אין מדד';
    const share = function (v) { return round2(v / total); };
    return 'מדד = ' + share(w.defense) + '×הגנה + ' + share(w.playmaking) + '×יצירה + ' + share(w.scoring) + '×קליעה';
  }

  // ---------------------------------------------------------- outcomes ---

  const OUTCOMES = Object.freeze([
    Object.freeze({ id: 'plusMinus', field: 'plusMinus', label: '+/- ל-40 דקות', leaky: false,
      note: '+/- לא נכנס לנוסחה, אבל הוא תלוי בחמישייה ובקבוצה ולכן רועש מאוד: לפי Medvedovsky (2020) צריך «לרפד» אותו ביותר מ-1,000 פוזשנים ממוצעים לפני שהוא אומר משהו.' }),
    Object.freeze({ id: 'pir', field: 'pir', label: 'מדד יעילות (PIR / EFF) ל-40 דקות', leaky: true,
      note: 'PIR (ACB 1991, היורוליג) בנוי מנקודות, ריבאונדים, אסיסטים, חטיפות וחסימות — אותן ספירות שבנוסחה. חלק מהקשר מובנה (דליפה).' }),
    Object.freeze({ id: 'points', field: 'points', label: 'נקודות ל-40 דקות', leaky: true,
      note: 'קליעה בנויה מנקודות — הקשר מובנה (דליפה).' }),
    Object.freeze({ id: 'rebounds', field: 'rebounds', label: 'ריבאונדים ל-40 דקות', leaky: true,
      note: 'הגנה כוללת ריבאונד הגנה — חלק מהקשר מובנה.' })
  ]);

  // Extra CSV columns are addressed as 'x:<header>', both as a new line to
  // test and as a target (e.g. a "+/- second half" column the user adds).
  const EXTRA_PREFIX = 'x:';
  const PANIM_FEATURE = 'panim';

  function extraLabel(id) {
    return String(id || '').indexOf(EXTRA_PREFIX) === 0 ? String(id).slice(EXTRA_PREFIX.length) : null;
  }

  function outcomeMeta(id) {
    const builtIn = OUTCOMES.find(function (o) { return o.id === id; });
    if (builtIn) return builtIn;
    const label = extraLabel(id);
    if (label == null) return null;
    return {
      id: id,
      field: null,
      label: label + ' (מהקובץ)',
      leaky: false,
      extra: true,
      note: 'עמודה מהקובץ שלכם, כפי שהיא (לא ל-40 דקות). ודאו שהיא לא נבנתה מאותן ספירות שבנוסחה.'
    };
  }

  function extraValue(row, label) {
    const v = row && row.extra ? row.extra[label] : undefined;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  function outcomeValue(row, outcomeId) {
    const label = extraLabel(outcomeId);
    if (label != null) return extraValue(row, label);
    const v = row && row.outcomes ? row.outcomes[outcomeId] : null;
    return v == null ? null : v;
  }

  function featureMeta(featureId) {
    if (featureId === PANIM_FEATURE) return { id: PANIM_FEATURE, label: 'PanimGuide (נגזר מהשם)', extra: false };
    const label = extraLabel(featureId);
    return label == null ? null : { id: featureId, label: label, extra: true };
  }

  // perForty: the column is a season count (touches, gestures) and is turned
  // into a rate per 40 minutes, like every box-score count in the formula.
  function featureValue(row, featureId, perForty) {
    if (featureId === PANIM_FEATURE) return row && row.panimScore != null ? row.panimScore : null;
    const v = extraValue(row, extraLabel(featureId));
    if (v == null) return null;
    if (!perForty) return v;
    return row.minutes > 0 ? round2(per40(v, row.minutes)) : null;
  }

  // ------------------------------------------------------------- folds ---

  // Half of the teams train, the other half test, so one team's players
  // never sit on both sides. Teams are ordered by a hash of their name and
  // alternated, which keeps the halves the same size. With fewer than four
  // teams the split falls back to players.
  function assignFolds(rows) {
    const teams = [];
    rows.forEach(function (row) {
      const team = row.team || '';
      if (team && !MULTI_TEAM_RE.test(team) && teams.indexOf(team) < 0) teams.push(team);
    });
    function byPlayer(row) {
      return fnv1a(row.id) % 2 === 0 ? 'train' : 'test';
    }
    if (teams.length >= 4) {
      const foldOf = {};
      teams.slice().sort(function (a, b) { return (fnv1a(a) - fnv1a(b)) || a.localeCompare(b); })
        .forEach(function (team, i) { foldOf[team] = i % 2 === 0 ? 'train' : 'test'; });
      return {
        by: 'team',
        label: 'חצי מהקבוצות אימון, החצי השני מבחן — אותה עונה, לא עונה מוחזקת',
        fold: function (row) { return own(foldOf, row.team || '') ? foldOf[row.team] : byPlayer(row); }
      };
    }
    return {
      by: 'player',
      label: 'פחות מ-4 קבוצות בקובץ — פיצול לפי שחקן (דטרמיניסטי לפי שם), אותה עונה',
      fold: byPlayer
    };
  }

  // ------------------------------------------------------------- store ---

  function prepare(row) {
    const minutes = Number(row.minutes) || 0;
    const outcomes = {};
    OUTCOMES.forEach(function (o) {
      outcomes[o.id] = has(row, o.field) && minutes > 0 ? round2(per40(row[o.field], minutes)) : null;
    });
    return {
      id: row.name + '|' + (row.team || ''),
      name: row.name,
      team: row.team || '',
      position: row.position || '',
      positionGroup: positionGroup(row.position),
      games: has(row, 'games') ? row.games : null,
      minutes: minutes,
      counts: row,
      components: componentsFor(row),
      outcomes: outcomes,
      extra: row.extra ? Object.assign({}, row.extra) : {},
      // PanimGuide reads only the name and team text (see identifyPlayerPanim in demo.js).
      panimScore: Demo.identifyPlayerPanim({ name: row.name, team: row.team || '' }).score
    };
  }

  function createBasketballStore(parsed) {
    const seenIds = {};
    const players = (parsed && parsed.players || []).map(function (row) {
      const prepared = prepare(row);
      if (seenIds[prepared.id]) {
        let n = 2;
        while (seenIds[prepared.id + '#' + n]) n += 1;
        prepared.id = prepared.id + '#' + n;
      }
      seenIds[prepared.id] = true;
      return prepared;
    });
    const lines = (parsed && parsed.lines || []).filter(function (label) {
      return players.some(function (p) { return extraValue(p, label) != null; });
    });
    const available = OUTCOMES.filter(function (o) {
      return players.some(function (p) { return p.outcomes[o.id] != null; });
    }).concat(lines.map(function (label) { return outcomeMeta(EXTRA_PREFIX + label); }));
    const features = lines.map(function (label) { return featureMeta(EXTRA_PREFIX + label); })
      .concat([featureMeta(PANIM_FEATURE)]);

    function derive(spec, options) {
      const metric = normalizeSpec(spec);
      const rows = players
        .filter(function (p) { return p.minutes > 0 && p.minutes >= metric.minMinutes; })
        .map(function (p) { return Object.assign({}, p, { score: compositeScore(p.components, metric) }); })
        .sort(function (a, b) { return (b.score - a.score) || String(a.name).localeCompare(String(b.name)); })
        .map(function (p, i) { return Object.assign({}, p, { rank: i + 1 }); });
      const outcome = available.find(function (o) { return o.id === metric.outcomeId; }) || available[0] || null;
      metric.outcomeId = outcome ? outcome.id : '';
      const feature = features.find(function (f) { return f.id === metric.featureId; }) || features[0];
      metric.featureId = feature.id;
      const maxMinutes = players.reduce(function (m, p) { return Math.max(m, p.minutes); }, 0);
      return {
        spec: metric,
        rows: rows,
        formula: formatFormula(metric),
        outcomes: available,
        outcome: outcome,
        features: features,
        thresholdNote: rows.length ? '' : 'אף שחקן לא עובר סף ' + metric.minMinutes + ' דקות. הדקות הגבוהות בקובץ: ' + round1(maxMinutes) + '.',
        validation: outcome ? validateMetric(rows, outcome.id) : null,
        feature: outcome ? featureTest(rows, feature.id, outcome.id, Object.assign({}, options, { per40: metric.featurePer40 })) : null,
        panim: outcome ? panimTest(rows, outcome.id, options) : null
      };
    }

    return {
      players: players,
      outcomes: available,
      features: features,
      lines: lines,
      derive: derive,
      provenance: parsed && parsed.provenance,
      source: parsed && parsed.source
    };
  }

  // -------------------------------------------------------- validation ---

  function splitRows(rows, outcomeId) {
    const split = assignFolds(rows);
    const folds = { train: [], test: [] };
    let withoutOutcome = 0;
    rows.forEach(function (row) {
      if (outcomeValue(row, outcomeId) == null) {
        withoutOutcome += 1;
        return;
      }
      folds[split.fold(row)].push(row);
    });
    return { split: split, train: folds.train, test: folds.test, withoutOutcome: withoutOutcome };
  }

  function rhoOf(rows, xKey, outcomeId) {
    return Demo.spearman(
      rows.map(function (r) { return xKey === 'score' || xKey === 'panimScore' ? r[xKey] : r.components[xKey]; }),
      rows.map(function (r) { return outcomeValue(r, outcomeId); })
    );
  }

  function validateMetric(rows, outcomeId) {
    const meta = outcomeMeta(outcomeId);
    const parts = splitRows(rows, outcomeId);
    function stats(fold) {
      return {
        n: fold.length,
        rho: rhoOf(fold, 'score', outcomeId),
        componentRho: {
          defense: rhoOf(fold, 'defense', outcomeId),
          playmaking: rhoOf(fold, 'playmaking', outcomeId),
          scoring: rhoOf(fold, 'scoring', outcomeId)
        }
      };
    }
    const train = stats(parts.train);
    const test = stats(parts.test);
    const notes = ['זו אותה עונה, לא עונה חדשה.'];
    if (meta && (meta.leaky || meta.extra)) notes.push(meta.note);
    if (test.n < 20) notes.push('במבחן ' + test.n + ' שחקנים — מדגם קטן, אסור להכריז על תוקף.');
    if (train.rho != null && test.rho != null && train.rho - test.rho >= 0.2) notes.push('ρ באימון גבוה בהרבה מבמבחן — חשד להתאמת-יתר.');
    if (test.rho == null) notes.push('אין מספיק שחקנים לחישוב Spearman במבחן.');
    else if (test.rho < 0.2) notes.push('ρ במבחן חלש — המדד לא חוזה את היעד הזה בקבוצות המוחזקות.');
    else notes.push('ρ במבחן ' + test.rho + ' הוא קשר בתוך אותה עונה, לא הוכחת סקאוטינג.');
    return {
      outcomeId: outcomeId,
      outcomeLabel: meta ? meta.label : outcomeId,
      leaky: !!(meta && meta.leaky),
      splitBy: parts.split.by,
      splitLabel: parts.split.label,
      withoutOutcome: parts.withoutOutcome,
      train: train,
      test: test,
      verdict: notes.join(' ')
    };
  }

  // ---------------------------------------------------- new-line test ---

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function pValue(nullAbs, observed) {
    if (observed == null || !nullAbs.length) return null;
    const target = Math.abs(observed);
    let atLeast = 0;
    nullAbs.forEach(function (v) { if (v >= target - 1e-9) atLeast += 1; });
    // (k + 1) / (N + 1): never 0, so 1000 shuffles can say p ≈ 0.001 at most.
    return Math.round((atLeast + 1) / (nullAbs.length + 1) * 1000) / 1000;
  }

  function fmtP(p) {
    if (p == null) return '—';
    return p <= 0.001 ? 'p≤0.001' : 'p=' + p;
  }

  // Ranks with ties sharing their average rank.
  function rankAvg(values) {
    const idx = values.map(function (v, i) { return { v: Number(v) || 0, i: i }; })
      .sort(function (a, b) { return (a.v - b.v) || (a.i - b.i); });
    const ranks = new Array(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j < idx.length && idx[j].v === idx[i].v) j += 1;
      for (let k = i; k < j; k += 1) ranks[idx[k].i] = (i + 1 + j) / 2;
      i = j;
    }
    return ranks;
  }

  function meanOf(values) {
    return values.reduce(function (s, v) { return s + v; }, 0) / values.length;
  }

  function pearsonRaw(a, b) {
    const ma = meanOf(a);
    const mb = meanOf(b);
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < a.length; i += 1) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) * (a[i] - ma);
      sbb += (b[i] - mb) * (b[i] - mb);
    }
    const den = Math.sqrt(saa * sbb);
    return den > 1e-9 ? sab / den : null;
  }

  // What is left of a after the straight line through b is taken out.
  function residualize(a, b) {
    const ma = meanOf(a);
    const mb = meanOf(b);
    let sab = 0;
    let sbb = 0;
    for (let i = 0; i < a.length; i += 1) {
      sab += (a[i] - ma) * (b[i] - mb);
      sbb += (b[i] - mb) * (b[i] - mb);
    }
    const slope = sbb > 1e-12 ? sab / sbb : 0;
    return a.map(function (v, i) { return v - ma - slope * (b[i] - mb); });
  }

  // Partial Spearman of x and y with z held fixed: does the new line say
  // anything about the target that the box-score metric z does not?
  function partialRho(x, y, z) {
    if (!x || x.length < 4) return null;
    const rz = rankAvg(z);
    const r = pearsonRaw(residualize(rankAvg(x), rz), residualize(rankAvg(y), rz));
    return r == null ? null : round2(r);
  }

  function shuffleInPlace(values, rng) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = values[i];
      values[i] = values[j];
      values[j] = tmp;
    }
    return values;
  }

  // The test for a "new statistical line": a column the formula does not
  // use (body-language coding, fWHR from photos, touches…) or PanimGuide.
  // Same team split as the metric. On the test teams it asks:
  //   1. raw ρ(line, target), against 1,000 shuffles of the line;
  //   2. partial ρ with the metric held fixed — does the line add anything
  //      beyond the box score? — against the same shuffles.
  function featureTest(rows, featureId, outcomeId, options) {
    const opts = options || {};
    const iterations = opts.iterations || 1000;
    const seed = opts.seed == null ? 20261114 : opts.seed;
    const fMeta = featureMeta(featureId);
    const oMeta = outcomeMeta(outcomeId);
    const result = {
      featureId: featureId,
      featureLabel: fMeta ? fMeta.label : String(featureId),
      outcomeId: outcomeId,
      outcomeLabel: oMeta ? oMeta.label : String(outcomeId),
      per40: !!opts.per40,
      iterations: iterations
    };
    if (!fMeta || !oMeta) {
      result.error = 'אין שורה או יעד לבדיקה.';
      return result;
    }
    if (fMeta.extra && extraLabel(featureId) === extraLabel(outcomeId)) {
      result.error = 'השורה והיעד הם אותה עמודה — בחרו יעד אחר.';
      return result;
    }
    const split = assignFolds(rows);
    const folds = { train: [], test: [] };
    let excluded = 0;
    rows.forEach(function (row) {
      const x = featureValue(row, featureId, opts.per40);
      const y = outcomeValue(row, outcomeId);
      if (x == null || y == null) {
        excluded += 1;
        return;
      }
      folds[split.fold(row)].push({ x: x, y: y, z: row.score });
    });
    function stats(fold) {
      const xs = fold.map(function (p) { return p.x; });
      const ys = fold.map(function (p) { return p.y; });
      const zs = fold.map(function (p) { return p.z; });
      return { n: fold.length, rho: Demo.spearman(xs, ys), partial: partialRho(xs, ys, zs), metricRho: Demo.spearman(zs, ys) };
    }
    const train = stats(folds.train);
    const test = stats(folds.test);
    let noiseBand = null;
    let partialNoiseBand = null;
    test.p = null;
    test.partialP = null;
    test.metricP = null;
    if (folds.test.length >= 4) {
      const xs = folds.test.map(function (p) { return p.x; });
      const ys = folds.test.map(function (p) { return p.y; });
      const zs = folds.test.map(function (p) { return p.z; });
      const rng = mulberry32(seed);
      const xShuffled = xs.slice();
      const yShuffled = ys.slice();
      const rhoNull = [];
      const partialNull = [];
      const metricNull = [];
      for (let k = 0; k < iterations; k += 1) {
        shuffleInPlace(xShuffled, rng);
        rhoNull.push(Math.abs(Demo.spearman(xShuffled, ys) || 0));
        partialNull.push(Math.abs(partialRho(xShuffled, ys, zs) || 0));
        shuffleInPlace(yShuffled, rng);
        metricNull.push(Math.abs(Demo.spearman(zs, yShuffled) || 0));
      }
      const byValue = function (a, b) { return a - b; };
      rhoNull.sort(byValue);
      partialNull.sort(byValue);
      metricNull.sort(byValue);
      test.p = pValue(rhoNull, test.rho);
      test.partialP = pValue(partialNull, test.partial);
      test.metricP = pValue(metricNull, test.metricRho);
      noiseBand = round2(quantile(rhoNull, 0.95));
      partialNoiseBand = round2(quantile(partialNull, 0.95));
    }
    result.splitLabel = split.label;
    result.excluded = excluded;
    result.train = train;
    result.test = test;
    result.noiseBand = noiseBand;
    result.partialNoiseBand = partialNoiseBand;
    result.verdict = featureVerdict(result);
    return result;
  }

  const MULTIPLE_TESTS_NOTE = 'כל שורה או יעד נוספים שבודקים הם עוד הזדמנות לתוצאה «מובהקת» במקרה (בערך 1 מכל 20 בדיקות).';

  function featureVerdict(result) {
    const t = result.test;
    const name = '«' + result.featureLabel + '»';
    const notes = [];
    if (t.n < 10 || t.rho == null) {
      notes.push('במבחן יש רק ' + t.n + ' שחקנים עם השורה והיעד — אי אפשר להכריע לכאן או לכאן.');
    } else {
      const rawHit = t.p != null && t.p < 0.05;
      const partialHit = t.partialP != null && t.partialP < 0.05;
      if (rawHit) {
        notes.push(name + ' במבחן: ρ=' + t.rho + ', מחוץ לטווח הרעש (±' + result.noiseBand + ', ' + fmtP(t.p) + ').');
      } else {
        notes.push(name + ' במבחן: ρ=' + t.rho + ', בתוך טווח הרעש (±' + result.noiseBand + ', ' + fmtP(t.p) +
          ') — אין ראיה שהשורה חוזה ' + result.outcomeLabel + '.');
      }
      if (t.partial != null) {
        if (partialHit) {
          notes.push('גם אחרי שמנכים את המדד נשאר קשר (ρ חלקי ' + t.partial + ', ' + fmtP(t.partialP) +
            ') — בקובץ הזה השורה מוסיפה מידע שאין בבוקס-סקור.');
        } else if (rawHit) {
          notes.push('אבל אחרי שמנכים את המדד הקשר נחלש לרעש (ρ חלקי ' + t.partial + ', ' + fmtP(t.partialP) +
            ') — כנראה שהשורה חוזרת על מה שהסטטיסטיקה כבר יודעת.');
        }
      }
      if (rawHit || partialHit) {
        notes.push('זה עדיין לא אישור: עונה אחת ופיצול לפי קבוצות. אישור דורש לחזור על זה בעונה אחרת, עם מדידה שנעשתה בלי לראות את הסטטיסטיקה ויעד שנקבע מראש.');
      }
    }
    notes.push(MULTIPLE_TESTS_NOTE);
    return notes.join(' ');
  }

  // Same player, same team, the name written another way. A score that
  // reads a face cannot move when only the spelling moves.
  function spellingProbe(row) {
    if (!row || !row.name) return null;
    const clean = String(row.name).trim();
    const parts = clean.split(/\s+/);
    const variants = [clean];
    if (parts.length >= 2) {
      variants.push(parts.slice(1).join(' ') + ', ' + parts[0]);
      variants.push(parts[0].charAt(0) + '. ' + parts.slice(1).join(' '));
    }
    if (clean.toUpperCase() !== clean) variants.push(clean.toUpperCase());
    const seen = {};
    const probes = [];
    variants.forEach(function (name) {
      if (seen[name]) return;
      seen[name] = true;
      probes.push({ name: name, score: Demo.identifyPlayerPanim({ name: name, team: row.team || '' }).score });
    });
    const distinct = {};
    probes.forEach(function (p) { distinct[p.score] = true; });
    return { team: row.team || '', probes: probes, changes: Object.keys(distinct).length > 1 };
  }

  // PanimGuide through the same new-line test, plus the spelling probe.
  function panimTest(rows, outcomeId, options) {
    const opts = options || {};
    const f = featureTest(rows, PANIM_FEATURE, outcomeId, { iterations: opts.iterations, seed: opts.seed });
    const train = f.train || { n: 0, rho: null, metricRho: null };
    const test = f.test || { n: 0, rho: null, metricRho: null, p: null, metricP: null, partial: null, partialP: null };
    const result = {
      outcomeId: outcomeId,
      outcomeLabel: f.outcomeLabel,
      splitLabel: f.splitLabel,
      iterations: f.iterations,
      train: { n: train.n, panimRho: train.rho, metricRho: train.metricRho },
      test: {
        n: test.n,
        panimRho: test.rho,
        metricRho: test.metricRho,
        panimP: test.p,
        metricP: test.metricP,
        partial: test.partial,
        partialP: test.partialP
      },
      noiseBand: f.noiseBand,
      spelling: spellingProbe(opts.probeRow || rows[0])
    };
    result.verdict = panimVerdict(result);
    return result;
  }

  function panimVerdict(result) {
    const notes = [];
    const t = result.test;
    if (t.n < 10 || t.panimRho == null) {
      notes.push('במבחן יש רק ' + t.n + ' שחקנים עם היעד — אי אפשר להכריע לכאן או לכאן.');
    } else if (t.panimP >= 0.05) {
      notes.push('ρ של PanimGuide במבחן הוא ' + t.panimRho + ', בתוך טווח הרעש (±' + result.noiseBand +
        ' ב-95% מהערבובים האקראיים, ' + fmtP(t.panimP) + '). לפי הקובץ הזה הוא לא חוזה ' + result.outcomeLabel + '.');
    } else {
      notes.push('ρ של PanimGuide במבחן הוא ' + t.panimRho + ', מחוץ לטווח הרעש (' + fmtP(t.panimP) + '). ' +
        'זה עדיין לא אישור: צריך לחזור על זה בעונה אחרת או בקובץ אחר, וההחלטה מה בודקים חייבת להיקבע לפני שמסתכלים.');
    }
    if (result.spelling && result.spelling.changes) {
      const p = result.spelling.probes;
      const other = p.find(function (x) { return x.score !== p[0].score; });
      notes.push('הציון של «' + p[0].name + '» הוא ' + p[0].score + ', ושל «' + other.name + '» (אותו שחקן, כתיב אחר) ' + other.score +
        ' — הציון נגזר מאותיות השם, לא מפנים.');
    }
    notes.push(MULTIPLE_TESTS_NOTE);
    return notes.join(' ');
  }

  return {
    PER_MINUTES: PER_MINUTES,
    MAX_GAME_MINUTES: MAX_GAME_MINUTES,
    EXAMPLE_PATH: EXAMPLE_PATH,
    DEFAULT_SPEC: DEFAULT_SPEC,
    COMPONENT_LABELS: COMPONENT_LABELS,
    FIELDS: FIELDS,
    HEADER_ALIASES: HEADER_ALIASES,
    OUTCOMES: OUTCOMES,
    EXTRA_PREFIX: EXTRA_PREFIX,
    PANIM_FEATURE: PANIM_FEATURE,
    resolveHeader: resolveHeader,
    minutesValue: minutesValue,
    parseBasketballCsv: parseBasketballCsv,
    positionGroup: positionGroup,
    componentsFor: componentsFor,
    normalizeSpec: normalizeSpec,
    compositeScore: compositeScore,
    formatFormula: formatFormula,
    assignFolds: assignFolds,
    outcomeValue: outcomeValue,
    featureValue: featureValue,
    createBasketballStore: createBasketballStore,
    validateMetric: validateMetric,
    partialRho: partialRho,
    featureTest: featureTest,
    spellingProbe: spellingProbe,
    panimTest: panimTest
  };
}));
