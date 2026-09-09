(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIDemo = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hashSeed(seed) {
    const text = String(seed || 'scoutai-demo-001');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // 7 group games are impossible; 7 × 90 + 4 × 30 extra-time minutes is the
  // hard ceiling for a World Cup run. 480 was a leftover from mixed season
  // snapshots and would falsely flag genuine WC2018 finalists (~620 min).
  const WORLD_CUP_MAX_MINUTES = 750;
  const SEASON_MISLABELED = 'season data, mislabeled';

  function isWorldCupLabel(comp) {
    return /world\s*cup/i.test(String(comp || ''));
  }

  function minutesImpossibleForCompetition(row) {
    const minutes = Number(row && row.minutes);
    if (!Number.isFinite(minutes)) return false;
    return isWorldCupLabel(row.comp) && minutes > WORLD_CUP_MAX_MINUTES;
  }

  function flagImpossibleMinutes(rows) {
    return rows.map(function (row) {
      if (!minutesImpossibleForCompetition(row)) return row;
      return Object.assign({}, row, {
        labeledComp: row.comp,
        comp: SEASON_MISLABELED,
        hygiene: SEASON_MISLABELED
      });
    });
  }

  const DEFAULT_METRIC = Object.freeze({
    grit: 40,
    involvement: 30,
    clutch: 30,
    minMinutes: 270,
    normalizePosition: false,
    selectedId: '',
    compareId: '',
    outcomeId: 'assists',
    splitId: 'groups',
    curriculumIndex: 0,
    weightsLocked: false,
    weightAttempts: 0
  });

  const WC2018_GROUPS = Object.freeze({
    A: Object.freeze(['Russia', 'Saudi Arabia', 'Egypt', 'Uruguay']),
    B: Object.freeze(['Portugal', 'Spain', 'Morocco', 'Iran']),
    C: Object.freeze(['France', 'Australia', 'Peru', 'Denmark']),
    D: Object.freeze(['Argentina', 'Iceland', 'Croatia', 'Nigeria']),
    E: Object.freeze(['Brazil', 'Switzerland', 'Costa Rica', 'Serbia']),
    F: Object.freeze(['Germany', 'Mexico', 'Sweden', 'South Korea']),
    G: Object.freeze(['Belgium', 'Panama', 'Tunisia', 'England']),
    H: Object.freeze(['Poland', 'Senegal', 'Colombia', 'Japan'])
  });

  const WC2018_TEAM_GROUP = (function () {
    const map = {};
    Object.keys(WC2018_GROUPS).forEach(function (group) {
      WC2018_GROUPS[group].forEach(function (team) { map[team] = group; });
    });
    return Object.freeze(map);
  }());

  const COUNT_FIELDS = Object.freeze([
    'pressures', 'tackles', 'interceptions', 'defensiveActions',
    'progressiveActions', 'keyPasses', 'passesCompleted',
    'shotXgSum', 'boxTouches', 'shotsOnTarget',
    'shots', 'goals', 'assists', 'dribbles', 'duelsWon', 'bigChanceProxy'
  ]);

  const COMPONENT_INPUT_FIELDS = Object.freeze({
    grit: Object.freeze(['pressures', 'tackles', 'interceptions', 'defensiveActions']),
    involvement: Object.freeze(['progressiveActions', 'keyPasses', 'passesCompleted']),
    clutch: Object.freeze(['shotXgSum', 'boxTouches', 'shotsOnTarget'])
  });

  const USER_DATASET_COLUMNS = Object.freeze(
    ['name', 'team', 'position', 'minutes'].concat(COUNT_FIELDS)
  );

  const OPEN_DATA_PROVENANCE = 'STATSBOMB_OPEN_DATA';
  const USER_DATA_PROVENANCE = 'USER_LICENSED_DATA';
  const SYNTHETIC_PROVENANCE = 'SYNTHETIC_EXAMPLE';

  const OPEN_DATA_SOURCE = Object.freeze({
    dataset: 'data/wc2018_event_aggregates.json',
    competition: 'FIFA World Cup 2018',
    competitionId: 43,
    seasonId: 3,
    license: 'StatsBomb Open Data — research and public sharing with credit; commercial use prohibited'
  });

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

  function playerKey(row) {
    if (row && row.id != null && String(row.id)) return String(row.id);
    return String(row && row.name || '') + '|' + String(row && row.team || '');
  }

  // Disambiguate duplicate name|team rows (two Yossi Cohens) without changing
  // the first occurrence's key — Open Data fold hashes stay stable.
  function ensureDistinctPlayerIds(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const seen = Object.create(null);
    return list.map(function (row) {
      if (!row || typeof row !== 'object') return row;
      if (row.id != null && String(row.id)) return row;
      const base = String(row.name || '') + '|' + String(row.team || '');
      const n = (seen[base] = (seen[base] || 0) + 1);
      const id = n === 1 ? base : base + '|#' + n;
      return Object.assign({}, row, { id: id });
    });
  }

  // Minimum peers inside a position group before mid-rank normalize runs.
  // Groups smaller than this keep raw component scores and a visible reason.
  const MIN_POSITION_PEERS = 5;

  // Short codes + Hebrew labels that StatsBomb-style English regexes miss.
  // Overridable per store via createStore(..., { positionAliases }) or
  // positionGroup(text, aliases) — the mapping step can pass a custom table.
  const DEFAULT_POSITION_ALIASES = Object.freeze({
    GK: 'GK',
    CB: 'DF', LB: 'DF', RB: 'DF',
    DM: 'MF', CM: 'MF', AM: 'MF',
    LW: 'FW', RW: 'FW', ST: 'FW', CF: 'FW',
    'שוער': 'GK',
    'בלם': 'DF',
    'מגן': 'DF',
    'קשר': 'MF',
    'כנף': 'FW',
    'חלוץ': 'FW'
  });

  function positionGroup(position, aliases) {
    const text = String(position || '').trim();
    if (!text) return 'OT';
    // Only an object table counts — Array#map would otherwise pass the index.
    const table = (aliases && typeof aliases === 'object') ? aliases : DEFAULT_POSITION_ALIASES;
    const upper = text.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(table, upper)) return table[upper];
    if (Object.prototype.hasOwnProperty.call(table, text)) return table[text];
    // Full English labels (StatsBomb Open Data style) stay on the regex path.
    if (/goalkeeper/i.test(text)) return 'GK';
    if (/midfield/i.test(text)) return 'MF';
    if (/back|defen/i.test(text)) return 'DF';
    if (/forward|wing|striker/i.test(text)) return 'FW';
    return 'OT';
  }

  function mergePositionAliases(overrides) {
    if (!overrides || typeof overrides !== 'object') return DEFAULT_POSITION_ALIASES;
    return Object.assign({}, DEFAULT_POSITION_ALIASES, overrides);
  }

  function countOtRows(rows) {
    let n = 0;
    (rows || []).forEach(function (row) {
      if ((row && row.positionGroup) === 'OT') n += 1;
    });
    return n;
  }

  function buildNormalizationNote(rows, metric, otCount) {
    if (!metric || !metric.normalizePosition) return null;
    const skipped = (rows || []).filter(function (row) {
      return row && row.components && row.components.normalizationSkipped;
    });
    const parts = [];
    parts.push('נרמול עמדה דורש לפחות ' + MIN_POSITION_PEERS + ' עמיתים בקבוצה');
    if (otCount > 0) {
      parts.push(otCount + ' שורות נפלו ל-OT (עמדה לא מזוהה)');
    }
    if (skipped.length) {
      parts.push(skipped.length + ' שורות לא נורמלו כי הקבוצה קטנה מ-' + MIN_POSITION_PEERS);
    }
    return parts.join('. ') + '.';
  }

  function per90(value, minutes) {
    const mins = Number(minutes) || 0;
    if (mins <= 0) return 0;
    return (Number(value) || 0) * 90 / mins;
  }

  function scaleCap(value, cap) {
    if (!cap) return 0;
    return clamp((Number(value) || 0) / cap * 100, 0, 100);
  }

  // Fixed WC2018 teaching caps (7-game tournament + StatsBomb defs). Kept as
  // the Open Data / research scale. Commercial USER_LICENSED_DATA must NOT
  // reuse this set — see deriveFileCaps / createStore({ caps: 'file' }).
  const WC2018_CAPS = Object.freeze({
    pressures90: 18,
    tacklesInt90: 6,
    defensive90: 14,
    progressive90: 22,
    keyPasses90: 4,
    passes90: 80,
    xg90: 0.6,
    boxTouches90: 8,
    shotsOnTarget90: 2
  });

  const CAP_RECIPE_KEYS = Object.freeze([
    'pressures90', 'tacklesInt90', 'defensive90',
    'progressive90', 'keyPasses90', 'passes90',
    'xg90', 'boxTouches90', 'shotsOnTarget90'
  ]);

  function copyCaps(caps) {
    const out = {};
    CAP_RECIPE_KEYS.forEach(function (key) {
      const v = caps && caps[key];
      out[key] = Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : WC2018_CAPS[key];
    });
    return out;
  }

  function resolveCapsSource(opts, openData, provenance) {
    const asked = opts && opts.caps;
    if (asked === 'file' || asked === 'wc2018') return asked;
    if (openData || provenance === OPEN_DATA_PROVENANCE) return 'wc2018';
    return 'file';
  }

  // Per-90 recipe inputs for one raw row (caps-independent).
  function rawRecipePer90(player) {
    const press = rawPer90(player, 'pressures', 'pressuresPer90');
    const tackles = rawPer90(player, 'tackles', 'tacklesPer90');
    const intercepts = rawPer90(player, 'interceptions', 'interceptionsPer90');
    const defense = rawPer90(player, 'defensiveActions', 'defensiveActionsPer90');
    const gritAvailable = componentAvailableOnPlayer(player, 'grit');
    const prog = rawPer90(player, 'progressiveActions', 'progressiveActionsPer90');
    const keyPasses = rawPer90(player, 'keyPasses', 'keyPassesPer90');
    const passes = rawPer90(player, 'passesCompleted', 'passesCompletedPer90');
    const involvementAvailable = componentAvailableOnPlayer(player, 'involvement');
    const xg = rawPer90(player, 'shotXgSum', 'shotXgSumPer90');
    const box = rawPer90(player, 'boxTouches', 'boxTouchesPer90');
    const onTarget = rawPer90(player, 'shotsOnTarget', 'shotsOnTargetPer90');
    const clutchAvailable = componentAvailableOnPlayer(player, 'clutch');
    return {
      pressures90: gritAvailable ? round2(press) : null,
      tacklesInt90: gritAvailable ? round2(tackles + intercepts) : null,
      defensive90: gritAvailable ? round2(defense) : null,
      progressive90: involvementAvailable ? round2(prog) : null,
      keyPasses90: involvementAvailable ? round2(keyPasses) : null,
      passes90: involvementAvailable ? round2(passes) : null,
      xg90: clutchAvailable ? round2(xg) : null,
      boxTouches90: clutchAvailable ? round2(box) : null,
      shotsOnTarget90: clutchAvailable ? round2(onTarget) : null
    };
  }

  // Roster max per recipe key — the active commercial scale for BYOD.
  // Deterministic; does not blend in WC2018 numbers (licence 1.2.2).
  function deriveFileCaps(rawList) {
    const caps = {};
    CAP_RECIPE_KEYS.forEach(function (key) {
      let max = 0;
      let found = false;
      (rawList || []).forEach(function (row) {
        const raw = rawRecipePer90(row);
        const v = Number(raw[key]);
        if (!Number.isFinite(v)) return;
        found = true;
        if (v > max) max = v;
      });
      caps[key] = found && max > 0 ? round2(max) : 1;
    });
    return Object.freeze(caps);
  }

  function measureCapSaturation(players, caps) {
    const c = caps || WC2018_CAPS;
    let cells = 0;
    let saturated = 0;
    const byKey = {};
    CAP_RECIPE_KEYS.forEach(function (key) {
      byKey[key] = { n: 0, saturated: 0 };
    });
    (players || []).forEach(function (player) {
      const raw = player && player.components && player.components.raw || {};
      CAP_RECIPE_KEYS.forEach(function (key) {
        const v = Number(raw[key]);
        if (!Number.isFinite(v)) return;
        cells += 1;
        byKey[key].n += 1;
        // Strict > : at the ceiling (v === cap) still scales to 100, but
        // "saturation rate" means the head that was clipped above the cap.
        if (v > c[key]) {
          saturated += 1;
          byKey[key].saturated += 1;
        }
      });
    });
    return {
      saturated: saturated,
      cells: cells,
      rate: cells ? round2(saturated / cells) : 0,
      byKey: byKey
    };
  }

  function rawPer90(player, totalKey, per90Key) {
    const minutes = player.totalMinutesProxy || player.minutes || 0;
    if (player.per90 && Number.isFinite(Number(player.per90[per90Key]))) {
      return Number(player.per90[per90Key]);
    }
    return per90(player[totalKey], minutes);
  }

  function inputPresent(player, totalKey, per90Key) {
    if (takeCount(player, totalKey) != null) return true;
    if (player && player.per90 && Number.isFinite(Number(player.per90[per90Key]))) return true;
    return false;
  }

  function componentAvailableOnPlayer(player, name) {
    const fields = COMPONENT_INPUT_FIELDS[name] || [];
    const per90Keys = {
      pressures: 'pressuresPer90',
      tackles: 'tacklesPer90',
      interceptions: 'interceptionsPer90',
      defensiveActions: 'defensiveActionsPer90',
      progressiveActions: 'progressiveActionsPer90',
      keyPasses: 'keyPassesPer90',
      passesCompleted: 'passesCompletedPer90',
      shotXgSum: 'shotXgSumPer90',
      boxTouches: 'boxTouchesPer90',
      shotsOnTarget: 'shotsOnTargetPer90'
    };
    for (let i = 0; i < fields.length; i += 1) {
      const key = fields[i];
      if (inputPresent(player, key, per90Keys[key])) return true;
    }
    return false;
  }

  function componentsFromEvents(player, caps) {
    const c = caps || WC2018_CAPS;
    const raw = rawRecipePer90(player);
    const gritOk = componentAvailableOnPlayer(player, 'grit');
    const involvementOk = componentAvailableOnPlayer(player, 'involvement');
    const clutchOk = componentAvailableOnPlayer(player, 'clutch');
    const press = rawPer90(player, 'pressures', 'pressuresPer90');
    const tackles = rawPer90(player, 'tackles', 'tacklesPer90');
    const intercepts = rawPer90(player, 'interceptions', 'interceptionsPer90');
    const defense = rawPer90(player, 'defensiveActions', 'defensiveActionsPer90');
    const grit = gritOk
      ? round1(scaleCap(press, c.pressures90) * 0.45 + scaleCap(tackles + intercepts, c.tacklesInt90) * 0.3 + scaleCap(defense, c.defensive90) * 0.25)
      : null;

    const prog = rawPer90(player, 'progressiveActions', 'progressiveActionsPer90');
    const keyPasses = rawPer90(player, 'keyPasses', 'keyPassesPer90');
    const passes = rawPer90(player, 'passesCompleted', 'passesCompletedPer90');
    const involvement = involvementOk
      ? round1(scaleCap(prog, c.progressive90) * 0.5 + scaleCap(keyPasses, c.keyPasses90) * 0.3 + scaleCap(passes, c.passes90) * 0.2)
      : null;

    const xg = rawPer90(player, 'shotXgSum', 'shotXgSumPer90');
    const box = rawPer90(player, 'boxTouches', 'boxTouchesPer90');
    const onTarget = rawPer90(player, 'shotsOnTarget', 'shotsOnTargetPer90');
    const clutch = clutchOk
      ? round1(scaleCap(xg, c.xg90) * 0.4 + scaleCap(box, c.boxTouches90) * 0.35 + scaleCap(onTarget, c.shotsOnTarget90) * 0.25)
      : null;

    return {
      grit: grit,
      involvement: involvement,
      clutch: clutch,
      raw: raw
    };
  }

  // Mid-rank percentile via rankValues. Full-group ties share the average
  // rank (five zeros → 50). Partial ties use the floor of the tie block so a
  // zero-tied majority below positive peers is not inflated toward 100 (the
  // old <= count bug that put GK Clutch at 92.6).
  function percentileCells(peers) {
    const n = peers.length;
    if (!n) return [];
    const ranks = rankValues(peers);
    const nums = peers.map(function (v) { return Number(v) || 0; });
    return ranks.map(function (avgRank, i) {
      const value = nums[i];
      let tiedPeers = 0;
      for (let j = 0; j < n; j += 1) {
        if (nums[j] === value) tiedPeers += 1;
      }
      // Full-group tie → mid-rank; otherwise floor of the tie block.
      const reportRank = tiedPeers === n
        ? avgRank
        : avgRank - (tiedPeers - 1) / 2;
      return {
        value: round1((reportRank - 0.5) / n * 100),
        tiedPeers: tiedPeers,
        groupN: n
      };
    });
  }

  function percentile(value, peers) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    const usable = (peers || []).filter(function (p) {
      return p != null && Number.isFinite(Number(p));
    });
    if (!usable.length) return null;
    const cells = percentileCells(usable);
    const target = Number(value);
    for (let i = 0; i < usable.length; i += 1) {
      if (Number(usable[i]) === target) return cells[i].value;
    }
    return cells[0] ? cells[0].value : null;
  }

  function normalizeByPosition(rows, options) {
    const opts = options || {};
    const minPeers = opts.minPeers != null ? Number(opts.minPeers) : MIN_POSITION_PEERS;
    const groups = {};
    rows.forEach(function (row, rowIndex) {
      const key = row.positionGroup || 'OT';
      if (!groups[key]) groups[key] = [];
      groups[key].push(rowIndex);
    });
    const cellMaps = rows.map(function () { return {}; });
    const skipReason = rows.map(function () { return null; });
    Object.keys(groups).forEach(function (key) {
      const idxs = groups[key];
      if (idxs.length < minPeers) {
        const reason = 'קבוצת עמדה ' + key + ' עם ' + idxs.length +
          ' עמיתים — מתחת למינימום ' + minPeers;
        idxs.forEach(function (ri) { skipReason[ri] = reason; });
        return;
      }
      ['grit', 'involvement', 'clutch'].forEach(function (comp) {
        const finiteIdxs = [];
        const vals = [];
        idxs.forEach(function (ri) {
          const v = rows[ri].components[comp];
          if (v != null && Number.isFinite(Number(v))) {
            finiteIdxs.push(ri);
            vals.push(Number(v));
          }
        });
        const cells = vals.length ? percentileCells(vals) : [];
        finiteIdxs.forEach(function (ri, j) {
          cellMaps[ri][comp] = cells[j];
        });
      });
    });
    return rows.map(function (row, ri) {
      if (skipReason[ri]) {
        return Object.assign({}, row, {
          components: Object.assign({}, row.components, {
            raw: row.components.raw,
            normalized: false,
            normalizationSkipped: true,
            normalizationReason: skipReason[ri],
            ties: {
              grit: { tiedPeers: 0, groupN: 0 },
              involvement: { tiedPeers: 0, groupN: 0 },
              clutch: { tiedPeers: 0, groupN: 0 }
            }
          })
        });
      }
      const map = cellMaps[ri];
      function cell(name) {
        return map[name] || { value: null, tiedPeers: 0, groupN: 0 };
      }
      const gritCell = cell('grit');
      const involvementCell = cell('involvement');
      const clutchCell = cell('clutch');
      const gritIn = row.components.grit;
      const involvementIn = row.components.involvement;
      const clutchIn = row.components.clutch;
      return Object.assign({}, row, {
        components: {
          grit: (gritIn == null || !Number.isFinite(Number(gritIn))) ? null : gritCell.value,
          involvement: (involvementIn == null || !Number.isFinite(Number(involvementIn))) ? null : involvementCell.value,
          clutch: (clutchIn == null || !Number.isFinite(Number(clutchIn))) ? null : clutchCell.value,
          raw: row.components.raw,
          normalized: true,
          normalizationSkipped: false,
          normalizationReason: null,
          ties: {
            grit: { tiedPeers: gritCell.tiedPeers, groupN: gritCell.groupN },
            involvement: { tiedPeers: involvementCell.tiedPeers, groupN: involvementCell.groupN },
            clutch: { tiedPeers: clutchCell.tiedPeers, groupN: clutchCell.groupN }
          }
        }
      });
    });
  }

  const OUTCOME_IDS = Object.freeze(['assists', 'dribbles', 'duelsWon', 'goals', 'box']);
  const CURRICULUM_LENGTH = 8;

  function normalizeMetricSpec(spec) {
    const src = spec || {};
    const outcome = String(src.outcomeId || DEFAULT_METRIC.outcomeId);
    const split = String(src.splitId || DEFAULT_METRIC.splitId);
    const attemptsRaw = Number(src.weightAttempts);
    return {
      grit: clamp(src.grit, 0, 100),
      involvement: clamp(src.involvement, 0, 100),
      clutch: clamp(src.clutch, 0, 100),
      minMinutes: clamp(src.minMinutes, 0, 900),
      normalizePosition: !!src.normalizePosition,
      selectedId: src.selectedId ? String(src.selectedId) : '',
      compareId: src.compareId ? String(src.compareId) : '',
      outcomeId: OUTCOME_IDS.indexOf(outcome) >= 0 ? outcome : 'assists',
      splitId: split === 'hash' ? 'hash' : 'groups',
      curriculumIndex: clamp(src.curriculumIndex, 0, CURRICULUM_LENGTH - 1),
      weightsLocked: !!src.weightsLocked,
      weightAttempts: Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.round(attemptsRaw) : 0
    };
  }

  function weightTripleKey(spec) {
    const metric = normalizeMetricSpec(spec);
    return Math.round(metric.grit) + '|' + Math.round(metric.involvement) + '|' + Math.round(metric.clutch);
  }

  function compositeScore(components, spec) {
    const weights = normalizeMetricSpec(spec);
    const parts = components || {};
    let total = 0;
    let sum = 0;
    ['grit', 'involvement', 'clutch'].forEach(function (key) {
      if (parts[key] == null || !Number.isFinite(Number(parts[key]))) return;
      total += weights[key];
      sum += Number(parts[key]) * weights[key];
    });
    if (!total) return 0;
    return round2(sum / total);
  }

  const LAB_PATHS = Object.freeze({
    events: 'data/wc2018_event_aggregates.json'
  });

  function eventPlayers(dataset) {
    if (Array.isArray(dataset)) return dataset;
    if (dataset && Array.isArray(dataset.players)) return dataset.players;
    return [];
  }

  function takeCount(row, key) {
    if (!row) return null;
    const raw = row[key];
    if (raw === undefined || raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function countsFromRow(row) {
    const counts = {};
    COUNT_FIELDS.forEach(function (key) {
      counts[key] = takeCount(row, key);
    });
    return counts;
  }

  function buildCoverage(players) {
    const rows = Array.isArray(players) ? players : [];
    const n = rows.length;
    const fields = {};
    COUNT_FIELDS.forEach(function (key) {
      let present = 0;
      for (let i = 0; i < rows.length; i += 1) {
        if (takeCount(rows[i], key) != null) present += 1;
      }
      fields[key] = {
        present: present,
        absent: n - present,
        fillRate: n ? round2(present / n) : 0
      };
    });
    function componentCoverage(name) {
      const needed = COMPONENT_INPUT_FIELDS[name] || [];
      const missingFields = needed.filter(function (key) {
        return !fields[key] || fields[key].present === 0;
      });
      return {
        available: missingFields.length < needed.length,
        missingFields: missingFields.slice()
      };
    }
    const components = {
      grit: componentCoverage('grit'),
      involvement: componentCoverage('involvement'),
      clutch: componentCoverage('clutch')
    };
    const outcomes = {};
    ['assists', 'dribbles', 'duelsWon', 'goals'].forEach(function (key) {
      outcomes[key] = {
        available: !!(fields[key] && fields[key].present > 0),
        missingFields: (fields[key] && fields[key].present > 0) ? [] : [key]
      };
    });
    const boxGoals = fields.goals && fields.goals.present > 0;
    const boxAssists = fields.assists && fields.assists.present > 0;
    outcomes.box = {
      available: boxGoals || boxAssists,
      missingFields: [].concat(boxGoals ? [] : ['goals'], boxAssists ? [] : ['assists'])
    };
    return {
      fields: fields,
      components: components,
      outcomes: outcomes,
      banner: coverageBannerText(components)
    };
  }

  function coverageBannerText(components) {
    const missing = [];
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    ['grit', 'involvement', 'clutch'].forEach(function (key) {
      const c = components && components[key];
      if (c && !c.available && c.missingFields && c.missingFields.length) {
        missing.push(labels[key] + ': ' + c.missingFields.join(', '));
      }
    });
    if (!missing.length) return null;
    return 'רכיבים חסרים בקובץ (מוצגים כ«לא זמין», המשקל מנורמל מחדש בין הרכיבים הזמינים): ' +
      missing.join(' · ');
  }

  function preparePlayer(row, options) {
    const opts = options || {};
    const provenance = opts.provenance || row.provenance || OPEN_DATA_PROVENANCE;
    const minutes = row.totalMinutesProxy || row.minutes || 0;
    const defaultComp = provenance === OPEN_DATA_PROVENANCE ? 'WorldCup2018' : 'USER_DATASET';
    return {
      id: playerKey(row),
      name: row.name,
      team: row.team,
      comp: row.comp || row.competition || defaultComp,
      category: row.category,
      position: row.position || '',
      positionGroup: positionGroup(row.position, opts.positionAliases),
      minutes: minutes,
      matchesPlayed: row.matchesPlayed,
      group: WC2018_TEAM_GROUP[row.team] || null,
      counts: countsFromRow(row),
      per90File: row.per90 || null,
      components: componentsFromEvents(row, opts.caps || WC2018_CAPS),
      provenance: provenance
    };
  }

  // ב10: count scorePrepared calls so tests can assert derive ranks each
  // distinct needed spec once (~5) instead of re-ranking the same set ~11 times.
  let RANK_CALLS = 0;
  function resetRankCalls() { RANK_CALLS = 0; }
  function getRankCalls() { return RANK_CALLS; }

  function metricRankKey(spec) {
    const metric = normalizeMetricSpec(spec);
    return [
      Math.round(metric.grit),
      Math.round(metric.involvement),
      Math.round(metric.clutch),
      Math.round(metric.minMinutes),
      metric.normalizePosition ? 1 : 0
    ].join('|');
  }

  function createRankCache() {
    return { __scoutRankCache: true };
  }

  function isRankCache(value) {
    return !!(value && typeof value === 'object' && value.__scoutRankCache === true);
  }

  function rankOnce(prepared, spec, options, cache) {
    if (!cache) return scorePrepared(prepared, spec, options);
    const key = metricRankKey(spec);
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    const rows = scorePrepared(prepared, spec, options);
    cache[key] = rows;
    return rows;
  }

  function scorePrepared(prepared, spec, options) {
    RANK_CALLS += 1;
    const opts = options || {};
    const metric = normalizeMetricSpec(spec);
    const eligible = prepared.filter(function (row) {
      return row && row.name && row.minutes >= metric.minMinutes;
    });
    const adjusted = metric.normalizePosition
      ? normalizeByPosition(eligible, { minPeers: opts.minPeers })
      : eligible;
    return adjusted
      .map(function (row) {
        const score = compositeScore(row.components, metric);
        return Object.assign({}, row, { score: score, index: score });
      })
      .sort(function (a, b) {
        const delta = b.score - a.score;
        if (delta !== 0) return delta;
        return String(a.name).localeCompare(String(b.name));
      })
      .map(function (row, i) {
        return Object.assign({}, row, { rank: i + 1 });
      });
  }

  function attachDeltas(current, baseline) {
    const byId = {};
    (baseline || []).forEach(function (row) { byId[row.id] = row; });
    return current.map(function (row) {
      const prev = byId[row.id];
      return Object.assign({}, row, {
        baselineScore: prev ? prev.score : null,
        baselineRank: prev ? prev.rank : null,
        deltaScore: prev ? round2(row.score - prev.score) : null,
        deltaRank: prev ? prev.rank - row.rank : null
      });
    });
  }

  function lessonContributions(row, spec) {
    if (!row || !row.components) return [];
    const metric = normalizeMetricSpec(spec);
    const keys = ['grit', 'involvement', 'clutch'];
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    let total = 0;
    keys.forEach(function (key) {
      if (row.components[key] != null && Number.isFinite(Number(row.components[key]))) total += metric[key];
    });
    if (!total) total = 1;
    return keys.map(function (key) {
      const value = row.components[key];
      const available = value != null && Number.isFinite(Number(value));
      return {
        key: key,
        label: labels[key],
        value: available ? value : null,
        weight: metric[key],
        share: available ? round2(Number(value) * metric[key] / total) : null,
        available: available
      };
    });
  }

  function lessonMapping(row) {
    const raw = row && row.components && row.components.raw || {};
    return [
      { factor: 'לחיצות /90', value: raw.pressures90, feeds: 'Grit' },
      { factor: 'תיקולים+חטיפות /90', value: raw.tacklesInt90, feeds: 'Grit' },
      { factor: 'פעולות הגנה /90', value: raw.defensive90, feeds: 'Grit' },
      { factor: 'התקדמות /90', value: raw.progressive90, feeds: 'Involvement' },
      { factor: 'מסירות מפתח /90', value: raw.keyPasses90, feeds: 'Involvement' },
      { factor: 'מסירות /90', value: raw.passes90, feeds: 'Involvement' },
      { factor: 'xG /90', value: raw.xg90, feeds: 'Clutch' },
      { factor: 'נגיעות ברחבה /90', value: raw.boxTouches90, feeds: 'Clutch' },
      { factor: 'בעיטות למסגרת /90', value: raw.shotsOnTarget90, feeds: 'Clutch' }
    ];
  }

  function fragilityFromPrepared(prepared, spec, delta, rankCache, scoreOpts) {
    const step = delta == null ? 10 : delta;
    const baseRows = rankOnce(prepared, spec, scoreOpts, rankCache);
    const byId = {};
    baseRows.forEach(function (row) { byId[row.id] = row; });
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    const baseSpec = normalizeMetricSpec(spec);
    return ['grit', 'involvement', 'clutch'].map(function (key) {
      const before = baseSpec[key];
      const bumped = bumpSpec(spec, key, step);
      // clamp at 0/100 can make +delta a silent no-op (e.g. grit already 100).
      // Tag blocked explicitly — never pretend the minutes threshold is why ranks
      // did not move.
      const blocked = step !== 0 && bumped[key] === before;
      if (blocked) {
        return {
          key: key,
          label: 'אין הפרעה אפשרית במשקל 100',
          blocked: true,
          swings: []
        };
      }
      const ranked = rankOnce(prepared, bumped, scoreOpts, rankCache);
      const swings = ranked
        .map(function (row) {
          const prev = byId[row.id];
          return {
            id: row.id,
            name: row.name,
            team: row.team,
            from: prev ? prev.rank : null,
            to: row.rank,
            deltaRank: prev ? prev.rank - row.rank : 0
          };
        })
        .filter(function (row) { return row.deltaRank; })
        .sort(function (a, b) { return Math.abs(b.deltaRank) - Math.abs(a.deltaRank); })
        .slice(0, 5);
      return { key: key, label: labels[key] + ' +' + step, blocked: false, swings: swings };
    });
  }

  // א6: rank swing for the selected player under each +delta weight bump
  // (same scorePrepared/bumpSpec path as fragilityFromPrepared).
  function selectedWeightSwing(prepared, spec, selectedId, delta) {
    const step = delta == null ? 10 : delta;
    if (!prepared || !selectedId) return [];
    const baseRows = scorePrepared(prepared, spec);
    const prev = baseRows.find(function (row) { return row.id === selectedId; });
    if (!prev) return [];
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    const baseSpec = normalizeMetricSpec(spec);
    return ['grit', 'involvement', 'clutch'].map(function (key) {
      const before = baseSpec[key];
      const bumped = bumpSpec(spec, key, step);
      const blocked = step !== 0 && bumped[key] === before;
      if (blocked) {
        return {
          key: key,
          label: 'אין הפרעה אפשרית במשקל 100',
          blocked: true,
          from: prev.rank,
          to: prev.rank,
          deltaRank: 0
        };
      }
      const ranked = scorePrepared(prepared, bumped);
      const row = ranked.find(function (item) { return item.id === selectedId; });
      const to = row ? row.rank : prev.rank;
      return {
        key: key,
        label: labels[key] + ' +' + step,
        blocked: false,
        from: prev.rank,
        to: to,
        deltaRank: prev.rank - to
      };
    });
  }

  function bestHelpfulBump(swings) {
    let best = null;
    (swings || []).forEach(function (row) {
      if (row.deltaRank > 0 && (!best || row.deltaRank > best.deltaRank)) best = row;
    });
    return best ? best.key : 'none';
  }

  function nearNumber(answer, expected, tolerance) {
    const a = Number(String(answer == null ? '' : answer).trim());
    const e = Number(expected);
    if (!Number.isFinite(a) || !Number.isFinite(e)) return false;
    const tol = tolerance == null ? 0.05 : Number(tolerance);
    return Math.abs(a - e) <= tol;
  }

  // Abbreviated FNV-1a hashes of the 605 shipped name|team pairs from
  // data/wc2018_event_aggregates.json. Hashes only — no names republished here.
  // Used by looksLikeOpenDataPayload / parseUserDataset to reject Open Data
  // re-imports after JSON→CSV / metadata stripping. Not a warranty: altered
  // names still pass.
  const OPEN_DATA_PAIR_HASHES = Object.freeze([3402295,17982568,30628002,36264985,43664628,49952631,50989188,62214482,73012815,103582407,121761618,121821095,122967694,126108370,134940375,139827721,141573744,141991555,158534505,159238821,171503129,171644639,173765583,173874685,174515382,180543043,180722012,182001117,193794494,195188370,204281010,220414680,224791094,233335982,238848997,246160701,246687877,261289167,265184516,273856228,281876617,299103923,299491445,303446044,320283342,323634349,327973451,333441680,335946533,345182793,351413416,353897638,359147528,376992819,379540838,380679064,384363093,390144562,413875858,420283453,420480008,426830037,442943677,455500882,478738466,479033382,493282182,504062007,504524605,505784612,508801073,516979727,517974634,537885475,563578340,579799126,609545190,610014018,612622652,613288160,613779094,614323552,621811889,622923308,634873014,639170530,643380090,645496968,649291855,650021681,650971047,652954658,663023860,669275556,671895809,688033359,688524047,708353003,708871169,716368645,718763985,721564515,729451221,743052737,748101774,761536380,766324834,768083771,778732435,782819844,785391516,787870529,803595454,814326472,818604885,824840899,831325227,833087500,836371393,846059972,852503628,875707831,894942765,896086314,898819835,901501267,907570132,937229210,943210868,943787449,944333867,958324528,959806107,961665701,962071473,968622923,973725616,977625482,980872705,992106674,1001906244,1002394021,1022480848,1023064938,1033421109,1037385313,1037889396,1041246530,1056640028,1061077049,1069107852,1077714957,1082218538,1084177616,1089542013,1092796602,1092857550,1094600610,1099123145,1106540672,1113537656,1128436879,1128912726,1129956345,1135838036,1136032440,1138327879,1140679282,1148795881,1151323329,1159132682,1162497080,1174467531,1178889769,1183630914,1196990436,1233573757,1238535786,1239880742,1259111536,1261068160,1265670642,1269615137,1273991267,1281026374,1294151557,1307695630,1312755830,1320577288,1324250389,1336887824,1337258612,1346345114,1346873999,1357208476,1359912433,1362204612,1378312107,1378646708,1381214879,1383475247,1390025156,1395333809,1400731097,1404177072,1405319699,1406115166,1413029381,1419029336,1430584523,1438454270,1443585354,1448068271,1459426009,1463260578,1478669678,1480382800,1481169346,1487209298,1487920882,1501366362,1512619258,1521408795,1529023811,1533870747,1543220902,1545683763,1549829822,1565337729,1569183915,1583408102,1587528117,1587978521,1593543109,1604678627,1609806226,1627884835,1630354584,1636740797,1637472436,1642328745,1645295576,1661412534,1661885897,1675529678,1677670193,1679877382,1684873200,1690254486,1702885909,1713607646,1721625689,1724417588,1726598501,1729482716,1742349761,1743108074,1753865629,1766113046,1766476960,1783990279,1799356216,1825454906,1830894242,1843457062,1845036757,1845301835,1847583035,1854040310,1862413638,1880508381,1881421326,1883948548,1892424806,1902646618,1903969264,1905162998,1914098928,1914303089,1929304831,1931758398,1933900185,1943632157,1952432830,1957221335,1957852423,1965982137,1969111536,1976397825,1980521336,1990710765,2003785900,2025087993,2026198000,2042224098,2044929915,2046533752,2046974380,2066663890,2074654130,2076114419,2094576789,2098764636,2108126367,2110959151,2123895132,2128375809,2139512192,2142254530,2146737657,2150176516,2159206952,2159944450,2166157933,2173265092,2175213189,2175786064,2176497695,2181619352,2193599805,2201315397,2208937401,2211851872,2212194962,2212330171,2212519195,2228004912,2234265814,2238276784,2251497212,2251949709,2262664827,2264884288,2286242101,2293128143,2298713439,2301126154,2303277888,2303695713,2318980008,2328806384,2331677070,2339414051,2340959210,2344034673,2358398673,2383145100,2384846217,2386251702,2391074103,2408302884,2425112794,2428606381,2434158277,2439797451,2440276720,2454610854,2466057819,2471261091,2471407689,2473896700,2482915498,2488959289,2490867040,2494354264,2506111052,2515194826,2516549503,2554339270,2561509353,2563356044,2567794205,2568996482,2581177248,2599927746,2605424772,2605557427,2618664448,2623017958,2623294582,2637017083,2646229486,2648248985,2661885203,2666967782,2696455033,2706867317,2710483325,2737490341,2740339209,2740407900,2748260554,2770646079,2778985679,2787449450,2804596923,2818503958,2824622943,2830434900,2832860449,2834902856,2838670751,2851690208,2881541467,2882802515,2901279285,2904452409,2906561057,2915106458,2916347400,2926238993,2931169997,2938722360,2943193911,2944601076,2945647744,2947558776,2958411163,2962892680,2963174571,2965694512,2966211729,2988593078,2994794678,2997849944,3006113466,3013136352,3013301334,3013879380,3014222723,3017439692,3020321009,3031602415,3047098721,3050897804,3079592504,3086257518,3090850741,3102564456,3103158011,3104778436,3105186353,3112870609,3117673873,3140997548,3141777519,3147208987,3150226372,3151132107,3153824880,3157627369,3172889328,3175607326,3190218360,3201632164,3201704829,3207336173,3207886813,3213349813,3229934949,3233563516,3237268821,3237422466,3241699543,3250149292,3254370738,3255362318,3259968821,3262825636,3267675632,3267739881,3274918842,3278139825,3282570578,3328384951,3339635708,3340810051,3356976692,3361964525,3368495002,3383262198,3394358285,3399741904,3408201895,3417762312,3422564537,3442344521,3447437836,3464529524,3468694118,3479313432,3484368409,3487663394,3487972040,3491840578,3499299805,3547380585,3549750598,3573777790,3575126505,3585272000,3596692510,3610140395,3613928575,3614752531,3622626368,3625629290,3632944332,3633891530,3639080099,3648847476,3650302411,3651815446,3654057199,3654208711,3661587520,3672020132,3673047353,3693914690,3697054480,3698395473,3701624248,3707902994,3712152087,3726523748,3757704288,3759903142,3763957625,3769100721,3785802577,3791013987,3804224117,3815449586,3827741647,3835216308,3836592253,3838261270,3844958469,3847101527,3856695765,3857684998,3872054716,3880976956,3888895346,3893616028,3894540257,3896471385,3910836741,3914679374,3918254364,3918562208,3922998689,3931169104,3933469261,3943290485,3943691521,3957906816,3966551456,3974054563,3974392573,3982577538,4000256985,4002057701,4008011073,4020350394,4028099372,4030332170,4036835904,4042515006,4052155293,4070613137,4081783416,4083456089,4085581677,4104228656,4105107102,4106936507,4107029522,4112342362,4113179313,4117408803,4123073083,4130285872,4130891177,4131616892,4151761989,4164225818,4175230843,4179823937,4186277334,4199817043,4200101470,4204924813,4211671900,4215961647,4232996538,4240341696,4241207600,4260940734,4279352141,4282959539,4285495849,4288775646,4290479707,4293096867]);
  let openDataPairHashSet = null;
  function openDataPairHashLookup() {
    if (!openDataPairHashSet) {
      openDataPairHashSet = new Set(OPEN_DATA_PAIR_HASHES);
    }
    return openDataPairHashSet;
  }

  function openDataPairKey(row) {
    return String(row && row.name || '').trim().toLowerCase() + '|' +
      String(row && row.team || '').trim().toLowerCase();
  }

  function openDataPairHash(row) {
    return hashSeed(openDataPairKey(row));
  }

  /** Reject when overlap ≥ min(20, ceil(0.30 * rowCount)). */
  function openDataRejectThreshold(rowCount) {
    const n = Number(rowCount) || 0;
    if (n <= 0) return 0;
    return Math.min(20, Math.ceil(0.30 * n));
  }

  function openDataPairOverlap(players) {
    const rows = Array.isArray(players) ? players : [];
    const set = openDataPairHashLookup();
    let hits = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if (set.has(openDataPairHash(rows[i]))) hits += 1;
    }
    return hits;
  }

  function openDataContentFingerprintMatch(players) {
    const rows = Array.isArray(players) ? players : [];
    if (!rows.length) return false;
    return openDataPairOverlap(rows) >= openDataRejectThreshold(rows.length);
  }

  function looksLikeOpenDataPayload(dataset) {
    if (!dataset || typeof dataset !== 'object') return false;
    if (!Array.isArray(dataset)) {
      const source = String(dataset.source || dataset.license || '').toLowerCase();
      if (source.indexOf('statsbomb') >= 0) return true;
      if (Number(dataset.competitionId) === 43 && Number(dataset.seasonId) === 3) return true;
    }
    // Content fingerprint after JSON/CSV unification (players[] or bare array).
    // Catches Open Data re-imports after Excel→CSV or metadata stripping.
    // Does NOT catch altered names — that gap is intentional and documented.
    if (openDataContentFingerprintMatch(eventPlayers(dataset))) return true;
    return false;
  }

  function createStore(rawPlayers, options) {
    const opts = options || {};
    const openData = looksLikeOpenDataPayload(rawPlayers);
    const provenance = openData
      ? OPEN_DATA_PROVENANCE
      : (opts.provenance || (rawPlayers && rawPlayers.provenance) || OPEN_DATA_PROVENANCE);
    const source = opts.source || (provenance === OPEN_DATA_PROVENANCE
      ? OPEN_DATA_SOURCE
      : {
        dataset: opts.fileName || 'user-upload',
        competition: (rawPlayers && (rawPlayers.competition || rawPlayers.comp)) || 'USER_DATASET',
        license: provenance === USER_DATA_PROVENANCE
          ? 'User attested they licensed this file for local processing; ScoutAI does not grant that licence'
          : 'Synthetic teaching file shipped with ScoutAI — not match data'
      });
    const rawList = ensureDistinctPlayerIds(eventPlayers(rawPlayers));
    const coverage = buildCoverage(rawList);
    const positionAliases = mergePositionAliases(
      opts.positionAliases || (rawPlayers && rawPlayers.positionAliases) || null
    );
    const capsSource = resolveCapsSource(opts, openData, provenance);
    const caps = Object.freeze(
      capsSource === 'file' ? copyCaps(deriveFileCaps(rawList)) : copyCaps(WC2018_CAPS)
    );
    const players = flagImpossibleMinutes(rawList.map(function (row) {
      return preparePlayer(row, { provenance: provenance, positionAliases: positionAliases, caps: caps });
    }));
    const capSaturation = measureCapSaturation(players, caps);
    const otCount = countOtRows(players);
    // Unique normalized weight triples tried before (and including) lock.
    // Owner decision: hide test fold on free Open Data layer too until lock.
    const attemptedWeightKeys = Object.create(null);
    let weightAttemptCount = 0;
    let attemptSeedApplied = false;
    function noteWeightAttempt(metric) {
      const key = weightTripleKey(metric);
      // Restore floor from hash once; current triple is included in that count.
      if (!attemptSeedApplied && metric.weightAttempts > 0) {
        weightAttemptCount = metric.weightAttempts;
        attemptedWeightKeys[key] = true;
        attemptSeedApplied = true;
        return weightAttemptCount;
      }
      attemptSeedApplied = true;
      if (!attemptedWeightKeys[key]) {
        attemptedWeightKeys[key] = true;
        weightAttemptCount += 1;
      }
      return weightAttemptCount;
    }
    function derive(spec, baselineSpec) {
      const metric = normalizeMetricSpec(spec);
      const attempts = noteWeightAttempt(metric);
      metric.weightAttempts = attempts;
      const scoreOpts = { minPeers: opts.minPeers };
      // ב10: one rank per distinct needed spec (metric, baseline/DEFAULT, +3 weight bumps).
      const rankCache = createRankCache();
      let rows = rankOnce(players, metric, scoreOpts, rankCache);
      if (baselineSpec) rows = attachDeltas(rows, rankOnce(players, baselineSpec, scoreOpts, rankCache));
      const rankSamples = opts.rankSamples == null ? 0 : Number(opts.rankSamples) || 0;
      if (rankSamples > 0) {
        const seed = opts.rankSeed || ('scoutai-rank|' + [
          Math.round(metric.grit),
          Math.round(metric.involvement),
          Math.round(metric.clutch),
          Math.round(metric.minMinutes),
          metric.normalizePosition ? 1 : 0
        ].join('|'));
        const intervals = rankInterval(players, metric, {
          samples: rankSamples,
          seed: seed,
          minPeers: opts.minPeers,
          caps: caps
        });
        const byId = Object.create(null);
        intervals.forEach(function (iv) { byId[iv.id] = iv; });
        rows = rows.map(function (row) {
          return Object.assign({}, row, { rankInterval: byId[row.id] || null });
        });
      }
      const selected = rows.find(function (row) { return row.id === metric.selectedId; }) || rows[0] || null;
      if (selected && !metric.selectedId) metric.selectedId = selected.id;
      const compared = findPrepared(rows, players, metric.compareId);
      const fragility = fragilityFromPrepared(players, metric, 10, rankCache, scoreOpts);
      const layer = { provenance: provenance, source: source, caps: caps, capsSource: capsSource, capSaturation: capSaturation };
      const explorer = buildEventExplorer(selected, layer);
      const validation = validateMetric(players, metric, {
        outcomeId: metric.outcomeId,
        splitId: metric.splitId,
        revealed: !!metric.weightsLocked,
        attempts: attempts,
        seed: opts.validationSeed || 'scoutai-demo-001',
        rankCache: rankCache,
        scoreOpts: scoreOpts
      });
      // Single exercise eval; reuse ranks. Browser re-runs evaluateCurriculum with real answers.
      const exercise = evaluateExercise(players, metric, null, rankCache, scoreOpts);
      return {
        spec: metric,
        rows: rows,
        selected: selected,
        compared: compared,
        lesson: buildLesson(selected, metric, layer),
        contributions: lessonContributions(selected, metric),
        mapping: lessonMapping(selected),
        fragility: fragility,
        formula: formatFormula(metric),
        exercise: exercise,
        radar: buildCompareRadar(selected, compared, { caps: caps }),
        explorer: explorer,
        validation: validation,
        glossary: glossaryForPlayer(selected),
        exportBundle: exportMetricBundle(metric, selected, {
          compared: compared,
          provenance: provenance,
          source: source
        }),
        provenance: provenance,
        source: source,
        commercialAllowed: provenance === USER_DATA_PROVENANCE,
        coverage: coverage,
        coverageBanner: coverage.banner,
        otCount: otCount,
        positionAliases: positionAliases,
        normalizationNote: buildNormalizationNote(rows, metric, otCount),
        caps: caps,
        capsSource: capsSource,
        capSaturation: capSaturation
      };
    }
    return {
      players: players,
      derive: derive,
      provenance: provenance,
      source: source,
      coverage: coverage,
      otCount: otCount,
      positionAliases: positionAliases,
      caps: caps,
      capsSource: capsSource,
      capSaturation: capSaturation
    };
  }

  function applyMetric(dataset, spec, baselineSpec) {
    return createStore(dataset).derive(spec, baselineSpec || null).rows;
  }

  function readJson(fetchImpl, path) {
    return fetchImpl(path).then(function (response) {
      if (!response.ok) throw new Error('failed to load ' + path);
      return response.json();
    });
  }

  function loadLabSources(fetchImpl) {
    const load = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!load) return Promise.reject(new Error('fetch is not available'));
    return readJson(load, LAB_PATHS.events).then(function (events) {
      return {
        store: createStore(events, { provenance: OPEN_DATA_PROVENANCE, source: OPEN_DATA_SOURCE })
      };
    });
  }

  function serializeMetricHash(spec) {
    const metric = normalizeMetricSpec(spec);
    const parts = [
      'g=' + Math.round(metric.grit),
      'i=' + Math.round(metric.involvement),
      'c=' + Math.round(metric.clutch),
      'min=' + Math.round(metric.minMinutes),
      'npos=' + (metric.normalizePosition ? '1' : '0')
    ];
    if (metric.selectedId) parts.push('sel=' + encodeURIComponent(metric.selectedId));
    if (metric.compareId) parts.push('cmp=' + encodeURIComponent(metric.compareId));
    if (metric.outcomeId && metric.outcomeId !== DEFAULT_METRIC.outcomeId) {
      parts.push('out=' + encodeURIComponent(metric.outcomeId));
    }
    if (metric.splitId && metric.splitId !== DEFAULT_METRIC.splitId) {
      parts.push('fold=' + encodeURIComponent(metric.splitId));
    }
    if (metric.curriculumIndex) parts.push('cur=' + metric.curriculumIndex);
    if (metric.weightsLocked) parts.push('lock=1');
    if (metric.weightAttempts > 0) parts.push('att=' + metric.weightAttempts);
    return parts.join('&');
  }

  function parseMetricHash(hash) {
    const text = String(hash || '').replace(/^#/, '');
    if (!text) return normalizeMetricSpec(DEFAULT_METRIC);
    const params = {};
    text.split('&').forEach(function (pair) {
      const parts = pair.split('=');
      if (parts.length < 2) return;
      params[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('='));
    });
    return normalizeMetricSpec({
      grit: params.g,
      involvement: params.i,
      clutch: params.c,
      minMinutes: params.min,
      normalizePosition: params.npos === '1' || params.npos === 'true',
      selectedId: params.sel || '',
      compareId: params.cmp || '',
      outcomeId: params.out || DEFAULT_METRIC.outcomeId,
      splitId: params.fold || DEFAULT_METRIC.splitId,
      curriculumIndex: params.cur,
      weightsLocked: params.lock === '1' || params.lock === 'true',
      weightAttempts: params.att
    });
  }

  function formatFormula(spec) {
    const metric = normalizeMetricSpec(spec);
    const total = metric.grit + metric.involvement + metric.clutch;
    return 'ציון = (' + metric.grit + '×Grit + ' + metric.involvement + '×Involvement + ' +
      metric.clutch + '×Clutch) / ' + (total || 1);
  }

  // Static WC2018 teaching recipe (same numbers as WC2018_CAPS). Active scoring
  // uses store.caps — file-derived for USER_LICENSED_DATA, WC2018 for Open Data.
  const COMPONENT_RECIPE = Object.freeze({
    grit: Object.freeze([
      { key: 'pressures90', label: 'לחיצות /90', cap: WC2018_CAPS.pressures90, weight: 0.45 },
      { key: 'tacklesInt90', label: 'תיקולים+חטיפות /90', cap: WC2018_CAPS.tacklesInt90, weight: 0.3 },
      { key: 'defensive90', label: 'פעולות הגנה /90', cap: WC2018_CAPS.defensive90, weight: 0.25 }
    ]),
    involvement: Object.freeze([
      { key: 'progressive90', label: 'התקדמות /90', cap: WC2018_CAPS.progressive90, weight: 0.5 },
      { key: 'keyPasses90', label: 'מסירות מפתח /90', cap: WC2018_CAPS.keyPasses90, weight: 0.3 },
      { key: 'passes90', label: 'מסירות /90', cap: WC2018_CAPS.passes90, weight: 0.2 }
    ]),
    clutch: Object.freeze([
      { key: 'xg90', label: 'xG /90', cap: WC2018_CAPS.xg90, weight: 0.4 },
      { key: 'boxTouches90', label: 'נגיעות ברחבה /90', cap: WC2018_CAPS.boxTouches90, weight: 0.35 },
      { key: 'shotsOnTarget90', label: 'בעיטות למסגרת /90', cap: WC2018_CAPS.shotsOnTarget90, weight: 0.25 }
    ])
  });

  const RADAR_AXES = Object.freeze(
    COMPONENT_RECIPE.grit
      .concat(COMPONENT_RECIPE.involvement, COMPONENT_RECIPE.clutch)
      .map(function (axis, index) {
        const feeds = index < 3 ? 'Grit' : index < 6 ? 'Involvement' : 'Clutch';
        return Object.freeze({
          key: axis.key,
          label: axis.label,
          cap: axis.cap,
          weight: axis.weight,
          feeds: feeds
        });
      })
  );

  const EVENT_GLOSSARY = Object.freeze([
    {
      type: 'Pressure',
      he: 'לחיצה',
      feeds: 'Grit',
      usedInScore: true,
      field: 'pressures',
      per90Field: 'pressuresPer90',
      recipeKey: 'pressures90',
      filePath: 'players[].pressures',
      body: 'אירוע Pressure ב-StatsBomb: שחקן סוגר על מחזיק הכדור. נספר ללחיצות, ואז ל-90 דקות, ואז ל-Grit.'
    },
    {
      type: 'Duel / Tackle',
      he: 'דו-קרב / תיקול',
      feeds: 'Grit',
      usedInScore: true,
      field: 'tackles',
      per90Field: 'tacklesPer90',
      recipeKey: 'tacklesInt90',
      filePath: 'players[].tackles',
      body: 'Duel מסוג Tackle שהסתיים ב-Won/Success. נספר לתיקולים ולפעולות הגנה. תיקול שנכשל אינו נכנס.'
    },
    {
      type: 'Interception',
      he: 'חטיפה',
      feeds: 'Grit',
      usedInScore: true,
      field: 'interceptions',
      per90Field: 'interceptionsPer90',
      recipeKey: 'tacklesInt90',
      filePath: 'players[].interceptions',
      body: 'אירוע Interception: ניתוק מסירה. נספר לחטיפות ולפעולות הגנה.'
    },
    {
      type: 'Ball Recovery',
      he: 'שחזור כדור',
      feeds: 'Grit',
      usedInScore: true,
      field: 'defensiveActions',
      per90Field: 'defensiveActionsPer90',
      recipeKey: 'defensive90',
      filePath: 'players[].defensiveActions',
      body: 'Ball Recovery נספר לפעולות הגנה בלבד, בלי תיקול או חטיפה נפרדים.'
    },
    {
      type: 'Block',
      he: 'חסימה',
      feeds: 'Grit',
      usedInScore: true,
      field: 'defensiveActions',
      per90Field: 'defensiveActionsPer90',
      recipeKey: 'defensive90',
      filePath: 'players[].defensiveActions',
      body: 'Block נספר לפעולות הגנה. אין רכיב Block נפרד בנוסחה — הוא חלק מהתקרה של defensiveActions.'
    },
    {
      type: 'Pass',
      he: 'מסירה',
      feeds: 'Involvement',
      usedInScore: true,
      field: 'passesCompleted',
      per90Field: 'passesCompletedPer90',
      recipeKey: 'passes90',
      filePath: 'players[].passesCompleted',
      body: 'Pass בלי outcome נספר כהושלמה. shot_assist או goal_assist נספרים כמסירת מפתח. מסירה שמתקדמת במגרש נספרת גם כהתקדמות.'
    },
    {
      type: 'Carry',
      he: 'הובלת כדור',
      feeds: 'Involvement',
      usedInScore: true,
      field: 'progressiveActions',
      per90Field: 'progressiveActionsPer90',
      recipeKey: 'progressive90',
      filePath: 'players[].progressiveActions',
      body: 'Carry שמתקדם במגרש נספר ל-progressiveActions יחד עם מסירות מתקדמות. אין הפרדה בין מסירה להובלה ברכיב.'
    },
    {
      type: 'Shot + statsbomb_xg',
      he: 'בעיטה ו-xG',
      feeds: 'Clutch',
      usedInScore: true,
      field: 'shotXgSum',
      per90Field: 'shotXgSumPer90',
      recipeKey: 'xg90',
      filePath: 'players[].shotXgSum',
      body: 'Shot תורם את statsbomb_xg לסכום ה-xG. Outcome Saved או Goal נספר כבעיטה למסגרת. התווית Clutch היא לימודית — זה לא מודל רגעים מכריעים.'
    },
    {
      type: 'location (penalty box)',
      he: 'מיקום ברחבה',
      feeds: 'Clutch',
      usedInScore: true,
      field: 'boxTouches',
      per90Field: 'boxTouchesPer90',
      recipeKey: 'boxTouches90',
      filePath: 'players[].boxTouches',
      body: 'כל אירוע שנרשם בתוך רחבת ה-16 נספר כנגיעה ברחבה. זה קירוב גס, לא נגיעת כדור מאומתת.'
    },
    {
      type: 'Starting XI / Substitution',
      he: 'הרכב וחילוף',
      feeds: 'סף דקות',
      usedInScore: false,
      field: 'totalMinutesProxy',
      per90Field: null,
      recipeKey: null,
      filePath: 'players[].totalMinutesProxy',
      body: 'הדקות הן פרוקסי מקומי מאירועי הרכב וחילוף, לא שעון רשמי של פיפ״א. לכן יש סף דקות — מדגם קטן משקר.'
    },
    {
      type: 'Dribble / Goal / Assist',
      he: 'כדרור, שער, בישול',
      feeds: 'לא בנוסחה',
      usedInScore: false,
      field: 'dribbles',
      per90Field: 'dribblesPer90',
      recipeKey: null,
      filePath: 'players[].dribbles | players[].goals | players[].assists | players[].duelsWon | players[].bigChanceProxy',
      body: 'הספירות האלה קיימות בקובץ המצטבר (dribbles, goals, assists, duelsWon, bigChanceProxy) אבל אינן נכנסות ל-Grit/Involvement/Clutch. שקיפות: מה שנאסף לא בהכרח מה שמחושב.'
    }
  ]);

  const DEFENDER_EXERCISE = Object.freeze({
    id: 'defenders-sensible',
    title: 'תרגיל מודרך: מדד שמדרג בלמים באופן הגיוני',
    prompt: 'מדד ברירת המחדל 40/30/30 מעדיף חלוצים, כי Clutch נבנה מ-xG, נגיעות ברחבה ובעיטות למסגרת. בנו מדד שבו בלמים (בלם/מגן, לא קשר הגנתי) עולים בלי להעמיד פנים שזה מודל מדעי.',
    hint: Object.freeze({
      grit: 70,
      involvement: 20,
      clutch: 10,
      minMinutes: 270,
      normalizePosition: true
    })
  });

  const LEARNING_STORAGE_KEY = 'scoutai.learning.v1';
  const LEARNING_ROSE_IDS = Object.freeze(['grit', 'involvement', 'clutch']);
  const LEARNING_COST_IDS = Object.freeze(['DF', 'MF', 'FW', 'GK', 'none']);

  function emptyLearningState() {
    return {
      answers: {
        unusedField: '',
        per90: '',
        cappedField: '',
        weightsManual: '',
        fragilityPredict: '',
        splitIsSeason: '',
        whatMatters: '',
        beatsMinutes: '',
        unusedTerm: '',
        commercial: ''
      },
      defence: '',
      roseComponent: '',
      costGroup: ''
    };
  }

  function serializeLearningState(state) {
    const base = emptyLearningState();
    const src = state && typeof state === 'object' ? state : {};
    const srcAnswers = src.answers && typeof src.answers === 'object' ? src.answers : {};
    const answers = {};
    Object.keys(base.answers).forEach(function (key) {
      answers[key] = srcAnswers[key] == null ? '' : String(srcAnswers[key]);
    });
    const rose = src.roseComponent == null ? '' : String(src.roseComponent);
    const cost = src.costGroup == null ? '' : String(src.costGroup);
    return JSON.stringify({
      answers: answers,
      defence: src.defence == null ? '' : String(src.defence),
      roseComponent: LEARNING_ROSE_IDS.indexOf(rose) >= 0 ? rose : (rose === '' ? '' : rose),
      costGroup: LEARNING_COST_IDS.indexOf(cost) >= 0 ? cost : (cost === '' ? '' : cost)
    });
  }

  function parseLearningState(raw) {
    try {
      if (raw == null || raw === '') return emptyLearningState();
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyLearningState();
      const normalized = JSON.parse(serializeLearningState(parsed));
      const base = emptyLearningState();
      const rose = normalized.roseComponent;
      const cost = normalized.costGroup;
      return {
        answers: Object.assign({}, base.answers, normalized.answers || {}),
        defence: normalized.defence == null ? '' : String(normalized.defence),
        roseComponent: LEARNING_ROSE_IDS.indexOf(rose) >= 0 ? rose : '',
        costGroup: LEARNING_COST_IDS.indexOf(cost) >= 0 ? cost : ''
      };
    } catch (err) {
      return emptyLearningState();
    }
  }

  function loadLearningState(storage) {
    try {
      if (!storage || typeof storage.getItem !== 'function') return emptyLearningState();
      return parseLearningState(storage.getItem(LEARNING_STORAGE_KEY));
    } catch (err) {
      return emptyLearningState();
    }
  }

  function saveLearningState(storage, state) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(LEARNING_STORAGE_KEY, serializeLearningState(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function normalizeLearningClaim(claim) {
    const src = claim || {};
    let rose = src.roseComponent != null ? String(src.roseComponent) : (src.rose != null ? String(src.rose) : '');
    let cost = src.costGroup != null ? String(src.costGroup) : (src.cost != null ? String(src.cost) : '');
    if (/no\s*cost\s*to\s*forwards/i.test(cost) || cost === 'no-cost-forwards') cost = 'none';
    if (LEARNING_ROSE_IDS.indexOf(rose) < 0) rose = '';
    if (LEARNING_COST_IDS.indexOf(cost) < 0) cost = '';
    return { roseComponent: rose, costGroup: cost };
  }

  function expectedTradeoff(metric, current, baseline) {
    const deltas = {
      grit: metric.grit - DEFAULT_METRIC.grit,
      involvement: metric.involvement - DEFAULT_METRIC.involvement,
      clutch: metric.clutch - DEFAULT_METRIC.clutch
    };
    let roseComponent = '';
    let best = 0;
    LEARNING_ROSE_IDS.forEach(function (key) {
      if (deltas[key] > best) {
        best = deltas[key];
        roseComponent = key;
      }
    });
    const groups = ['DF', 'MF', 'FW', 'GK'];
    let costGroup = 'none';
    let worst = 0;
    groups.forEach(function (group) {
      const before = medianRank(baseline, group);
      const after = medianRank(current, group);
      if (before == null || after == null) return;
      const delta = after - before;
      if (delta > worst) {
        worst = delta;
        costGroup = group;
      }
    });
    if (worst <= 0) costGroup = 'none';
    return {
      roseComponent: roseComponent,
      costGroup: costGroup,
      weightDeltas: deltas
    };
  }

  function medianRank(rows, group) {
    const ranks = rows
      .filter(function (row) { return row.positionGroup === group; })
      .map(function (row) { return row.rank; })
      .sort(function (a, b) { return a - b; });
    if (!ranks.length) return null;
    return ranks[Math.floor((ranks.length - 1) / 2)];
  }

  function countGroup(rows, group) {
    return rows.filter(function (row) { return row.positionGroup === group; }).length;
  }

  function asPrepared(input) {
    if (Array.isArray(input)) return input;
    return createStore(input).players;
  }

  // Defender self-check needs a window of 12 and peer groups; rosters ≤12 are
  // not-evaluable (smallSample) rather than a quiet fail.
  const EXERCISE_SMALL_SAMPLE_MAX = 12;

  function evaluateExercise(prepared, spec, claim, rankCache, scoreOpts) {
    // Additive optional args: claim stays 3rd; rankCache may also be passed as 3rd
    // when it is a createRankCache() object (existing claim-shaped calls keep working).
    if (isRankCache(claim) && rankCache == null) {
      rankCache = claim;
      claim = null;
    }
    const players = asPrepared(prepared);
    const metric = normalizeMetricSpec(spec);
    const rosterN = players.length;
    const smallSample = rosterN <= EXERCISE_SMALL_SAMPLE_MAX;
    const current = rankOnce(players, metric, scoreOpts, rankCache);
    const baseline = rankOnce(players, DEFAULT_METRIC, scoreOpts, rankCache);
    const windowSize = Math.min(12, current.length);
    const nowTop = current.slice(0, windowSize);
    const baseTop = baseline.slice(0, windowSize);
    const dfNow = countGroup(nowTop, 'DF');
    const dfBase = countGroup(baseTop, 'DF');
    const fwNow = countGroup(nowTop, 'FW');
    const medianDf = medianRank(current, 'DF');
    const medianFw = medianRank(current, 'FW');
    const trade = expectedTradeoff(metric, current, baseline);
    const declared = normalizeLearningClaim(claim);
    const medianBit = (medianDf != null && medianFw != null)
      ? ('חציון דירוג חי: DF #' + medianDf + ' · FW #' + medianFw + '.')
      : 'חציון דירוג DF/FW לא זמין.';
    const smallMsg = 'אי אפשר להעריך את הבדיקה הזאת ב-n=' + rosterN;
    let tradeDetail;
    let tradePass = false;
    if (smallSample) {
      tradePass = false;
      tradeDetail = smallMsg;
    } else if (!declared.roseComponent || !declared.costGroup) {
      tradeDetail = 'הצהירו איזה רכיב עלה ואיזו קבוצת עמדה שילמה את המחיר. ' + medianBit;
    } else if (declared.costGroup === 'none' && trade.costGroup !== 'none') {
      tradePass = false;
      tradeDetail = 'לא נכון שאין עלות לחלוצים (או לאף אחד). בפועל שילמה ' + trade.costGroup +
        '. ' + medianBit + ' הרכיב שעלה מול 40/30/30: ' + (trade.roseComponent || 'אין') + '.';
    } else {
      tradePass = declared.roseComponent === trade.roseComponent && declared.costGroup === trade.costGroup;
      tradeDetail = tradePass
        ? ('נכון: ' + trade.roseComponent + ' עלה; ' + trade.costGroup + ' שילמה את המחיר. ' + medianBit)
        : ('ההצהרה לא תואמת את הדירוג החי. בפועל עלה ' + (trade.roseComponent || 'אין') +
          ' ואת המחיר שילמה ' + trade.costGroup + '. ' + medianBit);
    }
    const checks = [
      {
        id: 'minutes',
        label: 'סף דקות לפחות 270 — כדי לא לדרג מחליף של משחק אחד',
        pass: metric.minMinutes >= 270,
        evaluable: true,
        detail: 'סף נוכחי: ' + metric.minMinutes + ' דקות.'
      },
      {
        id: 'grit-over-clutch',
        label: 'Grit גבוה מ-Clutch — בלם לא נמדד בעיקר ב-xG',
        pass: metric.grit > metric.clutch,
        evaluable: true,
        detail: 'Grit ' + metric.grit + ' מול Clutch ' + metric.clutch + '.'
      },
      {
        id: 'defenders-surface',
        label: 'יותר בלמים ב-12 הראשונים מאשר במדד הבסיס 40/30/30',
        pass: smallSample ? false : (dfNow > dfBase),
        evaluable: !smallSample,
        detail: smallSample ? smallMsg : ('עכשיו ' + dfNow + ' בלמים בחלון, בבסיס היו ' + dfBase + '.')
      },
      {
        id: 'fair-comparison',
        label: 'נרמול עמדה או משקל מאמץ דומיננטי (Grit ≥ 60)',
        pass: metric.normalizePosition || metric.grit >= 60,
        evaluable: true,
        detail: metric.normalizePosition
          ? 'נרמול עמדה דולק (אחוזון mid-rank): בלם מושווה לבלמים, לא לחלוץ.'
          : 'בלי נרמול צריך Grit גבוה, אחרת xG של חלוצים שולט.'
      },
      {
        id: 'not-just-attackers',
        label: 'בחלון העליון יש לפחות אותו מספר בלמים כמו חלוצים',
        pass: smallSample ? false : (windowSize === 0 || dfNow >= fwNow),
        evaluable: !smallSample,
        detail: smallSample ? smallMsg : ('בלמים ' + dfNow + ' · חלוצים ' + fwNow +
          (medianDf != null && medianFw != null ? ' · חציון דירוג DF #' + medianDf + ' / FW #' + medianFw : '') + '.')
      },
      {
        id: 'tradeoff-defence',
        label: 'הצהרת פשרה: איזה רכיב עלה, ואיזו קבוצת עמדה שילמה את המחיר בחציון הדירוג',
        pass: smallSample ? false : tradePass,
        evaluable: !smallSample,
        detail: tradeDetail
      }
    ];
    const passed = !smallSample && checks.every(function (item) { return item.pass; });
    return {
      id: DEFENDER_EXERCISE.id,
      title: DEFENDER_EXERCISE.title,
      prompt: DEFENDER_EXERCISE.prompt,
      hint: DEFENDER_EXERCISE.hint,
      checks: checks,
      passed: passed,
      smallSample: smallSample,
      rosterN: rosterN,
      windowSize: windowSize,
      dfNow: dfNow,
      dfBase: dfBase,
      fwNow: fwNow,
      medianDf: medianDf,
      medianFw: medianFw,
      expectedRose: trade.roseComponent,
      expectedCostGroup: trade.costGroup,
      claim: declared,
      summary: smallSample
        ? smallMsg
        : (passed
          ? 'עברתם את הבדיקה העצמית. זה עדיין מדד ידני — לא הוכחה שמצאתם בלם טוב.'
          : 'עוד לא. המדד עדיין מתנהג כמו מדד חלוצים, או שהמדגם קטן מדי, או שההצהרה על הפשרה לא מדויקת.')
    };
  }

  function radarValues(row, caps) {
    const c = caps || WC2018_CAPS;
    const raw = row && row.components && row.components.raw || {};
    return RADAR_AXES.map(function (axis) {
      const value = Number(raw[axis.key]);
      const cap = c[axis.key] != null ? c[axis.key] : axis.cap;
      return {
        key: axis.key,
        label: axis.label,
        feeds: axis.feeds,
        cap: cap,
        raw: Number.isFinite(value) ? value : 0,
        scaled: round1(scaleCap(Number.isFinite(value) ? value : 0, cap))
      };
    });
  }

  function polarPoint(index, total, value, cx, cy, radius) {
    const angle = -Math.PI / 2 + (2 * Math.PI * index / total);
    const r = radius * clamp(value, 0, 100) / 100;
    return {
      x: round2(cx + Math.cos(angle) * r),
      y: round2(cy + Math.sin(angle) * r)
    };
  }

  function radarPolygon(values, cx, cy, radius) {
    return values.map(function (item, index) {
      return polarPoint(index, values.length, item.scaled, cx, cy, radius);
    });
  }

  function pointsToAttr(points) {
    return points.map(function (point) { return point.x + ',' + point.y; }).join(' ');
  }

  function findPrepared(rows, prepared, id) {
    if (!id) return null;
    return (rows || []).find(function (row) { return row.id === id; }) ||
      (prepared || []).find(function (row) { return row.id === id; }) ||
      null;
  }

  function buildCompareRadar(rowA, rowB, options) {
    const cx = options && options.cx != null ? options.cx : 160;
    const cy = options && options.cy != null ? options.cy : 160;
    const radius = options && options.radius != null ? options.radius : 110;
    const caps = options && options.caps ? options.caps : WC2018_CAPS;
    const aValues = radarValues(rowA, caps);
    const bValues = rowB ? radarValues(rowB, caps) : null;
    const axisGuide = aValues.map(function (item, index) {
      const tip = polarPoint(index, aValues.length, 100, cx, cy, radius);
      const labelAt = polarPoint(index, aValues.length, 118, cx, cy, radius);
      return {
        key: item.key,
        label: item.label,
        feeds: item.feeds,
        x: tip.x,
        y: tip.y,
        labelX: labelAt.x,
        labelY: labelAt.y
      };
    });
    return {
      cx: cx,
      cy: cy,
      radius: radius,
      axes: axisGuide,
      a: rowA ? {
        id: rowA.id,
        name: rowA.name,
        team: rowA.team,
        positionGroup: rowA.positionGroup,
        values: aValues,
        points: pointsToAttr(radarPolygon(aValues, cx, cy, radius))
      } : null,
      b: rowB ? {
        id: rowB.id,
        name: rowB.name,
        team: rowB.team,
        positionGroup: rowB.positionGroup,
        values: bValues,
        points: pointsToAttr(radarPolygon(bValues, cx, cy, radius))
      } : null
    };
  }

  function methodologyParagraph(spec, selected, sourceMeta) {
    const metric = normalizeMetricSpec(spec);
    const playerBit = selected
      ? ' דוגמת השחקן בשיעור: ' + selected.name + ' (' + (selected.team || '') + '), ציון ' +
        selected.score + ', דירוג #' + selected.rank + '.'
      : '';
    const provenance = (sourceMeta && sourceMeta.provenance) ||
      (selected && selected.provenance) || OPEN_DATA_PROVENANCE;
    const recipe =
      formatFormula(metric) +
      '. Grit = 0.45×לחיצות + 0.30×(תיקולים+חטיפות) + 0.25×פעולות הגנה, אחרי נרמול לתקרות קבועות ל-90 דקות. ' +
      'Involvement = 0.50×התקדמות + 0.30×מסירות מפתח + 0.20×מסירות שהושלמו. ' +
      'Clutch = 0.40×xG + 0.35×נגיעות ברחבה + 0.25×בעיטות למסגרת — התווית לימודית, לא מודל רגעים מכריעים. ' +
      'סף הדקות הוא ' + metric.minMinutes +
      (metric.normalizePosition ? '; הרכיבים הם אחוזון mid-rank בתוך קבוצת עמדה (תיקו מקבל דרגה ממוצעת).' : '; בלי נרמול עמדה.') +
      ' המשקלות ידניות ושרירותיות, בלי כיול מדעי.' + playerBit;
    if (provenance === USER_DATA_PROVENANCE) {
      return 'המדד חושב במעבדת ScoutAI ככלי לימוד, לא כהמלצת סקאוטינג ולא כחוות דעת רפואית או חוזית. ' +
        'השכבה היא USER_LICENSED_DATA: הקובץ נשאר במחשב המשתמש. ScoutAI לא מעניק רישיון לנתונים האלה. ' +
        'האחריות לעמידה ברישיון הספק (Wyscout / Hudl Statsbomb מסחרי / מנהלת / איסוף עצמי) היא על המשתמש. ' +
        recipe;
    }
    if (provenance === SYNTHETIC_PROVENANCE) {
      return 'המדד חושב במעבדת ScoutAI על קובץ סינתטי להדגמת פורמט, לא על משחק אמיתי ולא על StatsBomb Open Data. ' +
        'זה כלי לימוד, לא המלצת סקאוטינג. ' + recipe;
    }
    return 'המדד חושב במעבדת ScoutAI ככלי לימוד לאנליסט מתחיל, לא כהמלצת סקאוטינג, לא כחוות דעת רפואית או חוזית, ולא כמוצר למכירה. ' +
      'המקור הוא קובץ ספירות מקומי שנבנה מ-StatsBomb Open Data למונדיאל 2018 (תחרות 43, עונה 3). ' +
      'הרישיון מתיר מחקר ושיתוף ציבורי עם קרדיט, ואוסר שימוש מסחרי בנתונים ובכל ניתוח שנגזר מהם. ' +
      recipe;
  }

  function exportMetricBundle(spec, selected, extras) {
    const metric = normalizeMetricSpec(spec);
    const extra = extras || {};
    const provenance = extra.provenance || (selected && selected.provenance) || OPEN_DATA_PROVENANCE;
    const source = extra.source || (provenance === OPEN_DATA_PROVENANCE ? OPEN_DATA_SOURCE : {
      dataset: extra.fileName || 'user-upload',
      competition: extra.competition || 'USER_DATASET',
      license: provenance === USER_DATA_PROVENANCE
        ? 'User attested they licensed this file for local processing; ScoutAI does not grant that licence'
        : 'Synthetic teaching file shipped with ScoutAI — not match data'
    });
    const commercial = false;
    const learningIn = extra.learning && typeof extra.learning === 'object' ? extra.learning : {};
    const learningRecord = Array.isArray(learningIn.record)
      ? learningIn.record.map(function (item) {
        return {
          id: item && item.id != null ? String(item.id) : '',
          pass: !!(item && item.pass),
          label: item && item.label != null ? String(item.label) : ''
        };
      })
      : [];
    const learning = {
      defence: learningIn.defence == null ? '' : String(learningIn.defence),
      passed: typeof learningIn.passed === 'boolean' ? learningIn.passed : null,
      roseComponent: learningIn.roseComponent == null ? '' : String(learningIn.roseComponent),
      costGroup: learningIn.costGroup == null ? '' : String(learningIn.costGroup),
      record: learningRecord
    };
    return {
      tool: 'ScoutAI',
      purpose: 'educational metric lab',
      commercial: commercial,
      provenance: provenance,
      source: source,
      metric: {
        grit: metric.grit,
        involvement: metric.involvement,
        clutch: metric.clutch,
        minMinutes: metric.minMinutes,
        normalizePosition: metric.normalizePosition
      },
      formula: formatFormula(metric),
      recipe: COMPONENT_RECIPE,
      selected: selected ? {
        id: selected.id,
        name: selected.name,
        team: selected.team,
        position: selected.position,
        positionGroup: selected.positionGroup,
        minutes: selected.minutes,
        rank: selected.rank,
        score: selected.score,
        components: selected.components
      } : null,
      compared: extra.compared ? {
        id: extra.compared.id,
        name: extra.compared.name,
        team: extra.compared.team,
        positionGroup: extra.compared.positionGroup,
        components: extra.compared.components
      } : null,
      methodologyHe: methodologyParagraph(metric, selected, { provenance: provenance }),
      learning: learning,
      citationEn: provenance === USER_DATA_PROVENANCE
        ? 'ScoutAI educational metric lab on USER_LICENSED_DATA processed locally. ScoutAI does not license the uploaded file. Weights are manual and uncalibrated; not a scouting recommendation.'
        : provenance === SYNTHETIC_PROVENANCE
          ? 'ScoutAI educational metric lab on a synthetic teaching file. Not match data and not StatsBomb Open Data. Weights are manual and uncalibrated.'
          : 'ScoutAI educational metric lab on StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). Non-commercial research/education only. Weights are manual and uncalibrated; not a scouting recommendation.',
      generatedLocally: true
    };
  }


  function buildCompletionRecord(context) {
    const ctx = context || {};
    const provenance = ctx.provenance
      || (ctx.selected && ctx.selected.provenance)
      || OPEN_DATA_PROVENANCE;
    const curriculum = Array.isArray(ctx.curriculum)
      ? ctx.curriculum
      : evaluateCurriculum(ctx);
    const stepIds = CURRICULUM_LESSONS.map(function (lesson) { return lesson.id; });
    const steps = curriculum.map(function (lesson) {
      return {
        id: lesson.id,
        title: lesson.title || '',
        passed: !!lesson.passed,
        checks: (lesson.checks || []).map(function (item) {
          return {
            id: item && item.id != null ? String(item.id) : '',
            pass: !!(item && item.pass),
            label: item && item.label != null ? String(item.label) : ''
          };
        })
      };
    });
    const passed = steps.length > 0 && steps.every(function (step) { return step.passed; });
    const disclaimerHe =
      'רשומת השלמה מקומית לדיווח עצמי — לא תעודת מנהלת הליגות ולא הסמכה רשמית. ' +
      'accredited:false. NO_HELD_OUT_SEASON: אין עונה מוחזקת בריפו; פיצול הבתים הוא אותו טורניר. ' +
      'המשקלות ידניות ולא מכוילות — לא המלצת סקאוטינג.';
    const stamp = provenance === OPEN_DATA_PROVENANCE
      ? 'NON_COMMERCIAL · STATSBOMB_OPEN_DATA · education/research only · not for sale'
      : (provenance === USER_DATA_PROVENANCE
        ? 'USER_LICENSED_DATA · local self-report · not a management certificate'
        : 'SYNTHETIC_EXAMPLE · teaching only · not a management certificate');
    const record = {
      tool: 'ScoutAI',
      kind: 'local-completion-record',
      purpose: 'educational self-report',
      accredited: false,
      commercial: false,
      provenance: provenance,
      stamp: stamp,
      stepIds: stepIds,
      steps: steps,
      passed: passed,
      warnings: [
        'NO_HELD_OUT_SEASON',
        'HAND_WEIGHTS_UNCALIBRATED',
        'NOT_MANAGEMENT_CERTIFICATE'
      ],
      disclaimerHe: disclaimerHe,
      heldOutSeason: false,
      generatedLocally: true
    };
    // Open Data: never embed player rows (licence 1.2.2 — no derived commercial artefact packing roster).
    if (provenance !== OPEN_DATA_PROVENANCE && Array.isArray(ctx.players) && ctx.players.length) {
      record.players = ctx.players.map(function (row) {
        return {
          id: row && row.id != null ? String(row.id) : '',
          name: row && row.name != null ? String(row.name) : '',
          team: row && row.team != null ? String(row.team) : ''
        };
      });
    }
    return record;
  }

  function sourceLayer(meta, row) {
    const extra = meta || {};
    const provenance = extra.provenance || (row && row.provenance) || OPEN_DATA_PROVENANCE;
    const source = extra.source || (provenance === OPEN_DATA_PROVENANCE ? OPEN_DATA_SOURCE : {
      dataset: extra.fileName || 'user-upload'
    });
    return { provenance: provenance, source: source };
  }

  function sourceSentence(layer) {
    const provenance = layer.provenance;
    const dataset = (layer.source && layer.source.dataset) || 'user-upload';
    if (provenance === USER_DATA_PROVENANCE) {
      return 'מקור: USER_LICENSED_DATA, הקובץ ' + dataset + ' נשאר אצלכם. ScoutAI לא מעניק רישיון.';
    }
    if (provenance === SYNTHETIC_PROVENANCE) {
      return 'מקור: SYNTHETIC_EXAMPLE, ' + dataset + ' — לא נתוני משחק ולא Open Data.';
    }
    return 'מקור: STATSBOMB_OPEN_DATA, מונדיאל 2018, קובץ ' + dataset + '.';
  }

  function buildLesson(row, spec, meta) {
    const metric = normalizeMetricSpec(spec);
    const layer = sourceLayer(meta, row);
    if (!row) {
      return [{
        title: 'בחרו שחקן',
        body: 'לחצו על שורה בטבלה כדי לראות איך הציון שלו מורכב ממספרים גולמיים.'
      }];
    }
    const raw = row.components && row.components.raw || {};
    const contrib = lessonContributions(row, metric);
    const gritPart = contrib[0] ? contrib[0].share : null;
    const invPart = contrib[1] ? contrib[1].share : null;
    const clutchPart = contrib[2] ? contrib[2].share : null;
    function showComp(v) { return v == null ? 'לא זמין' : v; }
    const scaleNote = row.components.normalized
      ? 'אחרי נרמול עמדה כל רכיב הוא אחוזון mid-rank 0–100 בתוך קבוצת העמדה ' + row.positionGroup + ' (תיקו משמר tiedPeers/groupN).'
      : 'בלי נרמול עמדה הרכיבים הם סקייל 0–100 מול תקרות קבועות (לא כיול מדעי).';
    return [
      {
        title: '1. מי השחקן ומה המקור',
        body: row.name + ' · ' + (row.team || '') + ' · ' + (row.position || 'בלי עמדה') +
          ' · ' + row.minutes + ' דקות. ' + sourceSentence(layer) +
          ' זה שיעור לימודי, לא סקאוטינג מקצועי ולא מוצר מסחרי.'
      },
      {
        title: '2. מספרים גולמיים ל-90 דקות',
        body: 'לחיצות ' + raw.pressures90 + '/90, תיקולים+חטיפות ' + raw.tacklesInt90 +
          '/90, פעולות הגנה ' + raw.defensive90 + '/90, התקדמות ' + raw.progressive90 +
          '/90, מסירות מפתח ' + raw.keyPasses90 + '/90, מסירות ' + raw.passes90 +
          '/90, xG ' + raw.xg90 + '/90, נגיעות ברחבה ' + raw.boxTouches90 +
          '/90, בעיטות למסגרת ' + raw.shotsOnTarget90 + '/90.'
      },
      {
        title: '3. תרגום לשלושה רכיבים',
        body: 'Grit נבנה מלחיצות/תיקולים/הגנה → ' + showComp(row.components.grit) +
          '. Involvement מפעולות התקדמות ומסירות מפתח → ' + showComp(row.components.involvement) +
          '. Clutch מ-xG, נגיעות ברחבה ובעיטות למסגרת → ' + showComp(row.components.clutch) +
          '. ' + scaleNote
      },
      {
        title: '4. כפל במשקלות שבחרתם',
        body: formatFormula(metric) + '. תרומות: Grit ' + gritPart +
          ' + Involvement ' + invPart + ' + Clutch ' + clutchPart +
          ' = ' + row.score + '. המשקלות ידניות ושרירותיות — זה בדיוק מה שהשיעור מדגים.'
      },
      {
        title: '5. דירוג אחרי סף דקות',
        body: 'רק שחקנים עם לפחות ' + metric.minMinutes +
          ' דקות נשארים. הדירוג הנוכחי: #' + row.rank +
          (row.deltaRank == null ? '.' : ' (Δדירוג ' + (row.deltaRank > 0 ? '+' : '') + row.deltaRank + ' מול בסיס 40/30/30).')
      }
    ];
  }

  // Static column dictionary; cap field mirrors WC2018_CAPS. Explorer rows
  // override with store.caps when the active layer is file-derived.
  const EVENT_COLUMNS = Object.freeze([
    { key: 'pressures', label: 'לחיצות', type: 'Pressure', feeds: 'Grit', usedInScore: true, recipeKey: 'pressures90', cap: WC2018_CAPS.pressures90, weight: 0.45, per90Field: 'pressuresPer90' },
    { key: 'tackles', label: 'תיקולים', type: 'Duel / Tackle', feeds: 'Grit', usedInScore: true, recipeKey: 'tacklesInt90', cap: WC2018_CAPS.tacklesInt90, weight: 0.3, per90Field: 'tacklesPer90', pairWith: 'interceptions' },
    { key: 'interceptions', label: 'חטיפות', type: 'Interception', feeds: 'Grit', usedInScore: true, recipeKey: 'tacklesInt90', cap: WC2018_CAPS.tacklesInt90, weight: 0.3, per90Field: 'interceptionsPer90', pairWith: 'tackles' },
    { key: 'defensiveActions', label: 'פעולות הגנה', type: 'Ball Recovery + Block', feeds: 'Grit', usedInScore: true, recipeKey: 'defensive90', cap: WC2018_CAPS.defensive90, weight: 0.25, per90Field: 'defensiveActionsPer90' },
    { key: 'progressiveActions', label: 'התקדמות', type: 'Pass / Carry', feeds: 'Involvement', usedInScore: true, recipeKey: 'progressive90', cap: WC2018_CAPS.progressive90, weight: 0.5, per90Field: 'progressiveActionsPer90' },
    { key: 'keyPasses', label: 'מסירות מפתח', type: 'Pass (shot/goal assist)', feeds: 'Involvement', usedInScore: true, recipeKey: 'keyPasses90', cap: WC2018_CAPS.keyPasses90, weight: 0.3, per90Field: 'keyPassesPer90' },
    { key: 'passesCompleted', label: 'מסירות שהושלמו', type: 'Pass', feeds: 'Involvement', usedInScore: true, recipeKey: 'passes90', cap: WC2018_CAPS.passes90, weight: 0.2, per90Field: 'passesCompletedPer90' },
    { key: 'shotXgSum', label: 'סכום xG', type: 'Shot + statsbomb_xg', feeds: 'Clutch', usedInScore: true, recipeKey: 'xg90', cap: WC2018_CAPS.xg90, weight: 0.4, per90Field: 'shotXgSumPer90' },
    { key: 'boxTouches', label: 'נגיעות ברחבה', type: 'location (penalty box)', feeds: 'Clutch', usedInScore: true, recipeKey: 'boxTouches90', cap: WC2018_CAPS.boxTouches90, weight: 0.35, per90Field: 'boxTouchesPer90' },
    { key: 'shotsOnTarget', label: 'בעיטות למסגרת', type: 'Shot (Saved/Goal)', feeds: 'Clutch', usedInScore: true, recipeKey: 'shotsOnTarget90', cap: WC2018_CAPS.shotsOnTarget90, weight: 0.25, per90Field: 'shotsOnTargetPer90' },
    { key: 'shots', label: 'בעיטות', type: 'Shot', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'shotsPer90' },
    { key: 'goals', label: 'שערים', type: 'Goal', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'goalsPer90' },
    { key: 'assists', label: 'בישולים', type: 'Assist', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'assistsPer90' },
    { key: 'dribbles', label: 'כדרורים', type: 'Dribble', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'dribblesPer90' },
    { key: 'duelsWon', label: 'דו-קרבות שנרכשו', type: 'Duel', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'duelsWonPer90' },
    { key: 'bigChanceProxy', label: 'מצבים גדולים (קירוב)', type: 'Shot (big chance proxy)', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'bigChanceProxyPer90' }
  ]);

  // leaky on each row is a declared hint only. validateMetric overwrites it from
  // auditOutcome (Spearman vs scoring-input counts; |ρ|≥LEAKY_RHO ⇒ copy).
  const LEAKY_RHO = 0.95;
  const OUTCOMES = Object.freeze([
    { id: 'assists', label: 'בישולים', field: 'assists', leaky: false, leakNote: 'בישול לא נכנס לנוסחה. מסירת מפתח כן — זה לא אותו שדה.' },
    { id: 'dribbles', label: 'כדרורים', field: 'dribbles', leaky: false, leakNote: 'כדרור נאסף בקובץ ולא נכנס לציון.' },
    { id: 'duelsWon', label: 'דו-קרבות שנרכשו', field: 'duelsWon', leaky: true, leakNote: 'ב־Open Data העמודה חופפת ל-tackles (קלט Grit); בשכבת BYOD/סינתטי הדליפה נמדדת מחדש על הקובץ הפעיל.' },
    { id: 'goals', label: 'שערים', field: 'goals', leaky: false, leakNote: 'תלות רעיונית ב-Clutch/xG אינה סף העתקה (≥0.95 מול קלט יחיד).' },
    { id: 'box', label: 'שערים+בישולים', field: 'box', leaky: false, leakNote: 'תלות רעיונית ב-Clutch אינה סף העתקה (≥0.95 מול קלט יחיד).' }
  ]);

  // Count fields that feed the nine RADAR_AXES recipe keys. tackles and
  // interceptions both feed tacklesInt90, so the list has ten keys.
  function scoringInputFields() {
    return EVENT_COLUMNS.filter(function (col) { return col.usedInScore; })
      .map(function (col) { return col.key; });
  }

  function auditOutcome(prepared, outcomeId) {
    const players = asPrepared(prepared);
    const n = players.length;
    const ys = players.map(function (row) { return outcomeValue(row, outcomeId); });
    const fields = scoringInputFields();
    let maxRho = null;
    let maxField = null;
    let identicalRows = 0;
    const overlaps = [];
    fields.forEach(function (field) {
      const xs = players.map(function (row) {
        const v = row && row.counts ? row.counts[field] : 0;
        return Number(v) || 0;
      });
      const rho = n >= 2 ? spearman(xs, ys) : null;
      let same = 0;
      for (let i = 0; i < n; i += 1) {
        if (xs[i] === ys[i]) same += 1;
      }
      overlaps.push({ field: field, rho: rho, identicalRows: same });
      if (rho == null) return;
      const better = maxRho == null
        || Math.abs(rho) > Math.abs(maxRho)
        || (Math.abs(rho) === Math.abs(maxRho) && same > identicalRows);
      if (better) {
        maxRho = rho;
        maxField = field;
        identicalRows = same;
      }
    });
    const leaky = maxRho != null && Math.abs(maxRho) >= LEAKY_RHO;
    const meta = outcomeMeta(outcomeId);
    let leakNote;
    if (leaky) {
      leakNote = 'דליפה נמדדת: היעד חופף לקלט ציון «' + maxField +
        '» (Spearman ρ=' + maxRho +
        (n > 0 && identicalRows === n ? ', זהה ב-' + identicalRows + '/' + n + ' שורות' : '') +
        '). סף העתקה ≥' + LEAKY_RHO + '.';
    } else {
      leakNote = (meta && meta.leakNote)
        ? meta.leakNote
        : ('אין חפיפה ≥' + LEAKY_RHO + ' מול קלטי הציון.');
    }
    return {
      outcomeId: outcomeId,
      n: n,
      maxRho: maxRho,
      maxField: maxField,
      identicalRows: identicalRows,
      leaky: leaky,
      threshold: LEAKY_RHO,
      leakNote: leakNote,
      overlaps: overlaps
    };
  }

  function redactFoldIfLeaky(stats, leaky) {
    if (!leaky || !stats) return stats;
    return {
      n: stats.n,
      rho: null,
      minutesRho: null,
      outcomeMissing: stats.outcomeMissing,
      topMetric: stats.topMetric,
      topOutcome: stats.topOutcome,
      componentRho: { grit: null, involvement: null, clutch: null },
      bestComponent: null,
      redacted: true,
      reason: 'leaky-outcome'
    };
  }

  function outcomeMeta(outcomeId) {
    return OUTCOMES.find(function (item) { return item.id === outcomeId; }) || OUTCOMES[0];
  }

  function outcomeValue(player, outcomeId) {
    const counts = player && player.counts || {};
    function read(field) {
      if (counts[field] == null) return null;
      return counts[field];
    }
    if (outcomeId === 'box') {
      const g = read('goals');
      const a = read('assists');
      if (g == null && a == null) return null;
      return (g || 0) + (a || 0);
    }
    if (outcomeId === 'goals') return read('goals');
    if (outcomeId === 'assists') return read('assists');
    if (outcomeId === 'dribbles') return read('dribbles');
    if (outcomeId === 'duelsWon') return read('duelsWon');
    return null;
  }

  function filePer90(player, field) {
    const src = player && player.per90File;
    if (!src || field == null) return null;
    const n = Number(src[field]);
    return Number.isFinite(n) ? n : null;
  }

  function buildEventExplorer(player, meta) {
    const layer = sourceLayer(meta, player);
    const dataset = (layer.source && layer.source.dataset) || 'user-upload';
    const activeCaps = (meta && meta.caps) || (layer && layer.caps) || WC2018_CAPS;
    const capsSource = (meta && meta.capsSource) || (layer && layer.capsSource) || 'wc2018';
    const capSaturation = (meta && meta.capSaturation) || (layer && layer.capSaturation) || null;
    if (!player) {
      return {
        player: null,
        dataset: dataset,
        provenance: layer.provenance,
        caps: activeCaps,
        capsSource: capsSource,
        capSaturation: capSaturation,
        honesty: layer.provenance === OPEN_DATA_PROVENANCE
          ? 'הקובץ המקומי הוא ספירות מצטברות מ-64 משחקים, לא יומן אירוע-אחר-אירוע. אין כאן דקה, משחק או שידור.'
          : 'אין שחקן נבחר. הספירות יגיעו מהשכבה הפעילה (' + layer.provenance + '), לא מיומן אירוע.',
        rows: [],
        unused: [],
        capped: [],
        receipt: []
      };
    }
    const minutes = Number(player.minutes) || 0;
    const counts = player.counts || {};
    const raw = player.components && player.components.raw || {};
    const rows = EVENT_COLUMNS.map(function (col) {
      const total = col.key === 'totalMinutesProxy' ? minutes : (counts[col.key] == null ? 0 : counts[col.key]);
      const computed90 = minutes > 0 ? round2(total * 90 / minutes) : 0;
      const fromFile = filePer90(player, col.per90Field);
      const cap = col.recipeKey && activeCaps[col.recipeKey] != null ? activeCaps[col.recipeKey] : col.cap;
      const scaled = cap ? round1(scaleCap(raw[col.recipeKey] != null ? raw[col.recipeKey] : computed90, cap)) : null;
      // Active-layer bind: WC teaching caps use strict >; file-derived caps treat
      // the ceiling touch (v >= cap, scaled 100) as «נחתך» so the quiz works on BYOD.
      const capped = cap != null && (capsSource === 'file'
        ? computed90 >= cap
        : computed90 > cap);
      return {
        key: col.key,
        label: col.label,
        type: col.type,
        feeds: col.feeds,
        usedInScore: col.usedInScore,
        filePath: 'players[].' + col.key,
        total: col.key === 'shotXgSum' ? round2(total) : total,
        minutes: minutes,
        per90: computed90,
        per90File: fromFile,
        cap: cap,
        weight: col.weight,
        scaled: scaled,
        capped: capped,
        recipeKey: col.recipeKey
      };
    });
    const pressCap = activeCaps.pressures90;
    const receipt = [
      { step: 'ספירה בקובץ', detail: player.name + ' · ' + (player.team || '') + ' · ' + minutes + ' דקות פרוקסי · ' + layer.provenance + ' · ' + dataset },
      { step: 'לחיצות ל-90', detail: (counts.pressures == null ? 'לא זמין' : counts.pressures) + ' × 90 / ' + minutes + ' = ' + (rows[0] ? rows[0].per90 : 0) + (rows[0] && rows[0].capped ? (' — מעל תקרת ' + pressCap + ', לכן הסקייל 100') : '') },
      { step: 'Grit', detail: '0.45×לחיצות + 0.30×(תיקולים+חטיפות) + 0.25×הגנה → ' + (player.components.grit == null ? 'לא זמין' : player.components.grit) },
      { step: 'Involvement', detail: '0.50×התקדמות + 0.30×מסירות מפתח + 0.20×מסירות → ' + (player.components.involvement == null ? 'לא זמין' : player.components.involvement) },
      { step: 'Clutch', detail: '0.40×xG + 0.35×רחבה + 0.25×מסגרת → ' + (player.components.clutch == null ? 'לא זמין' : player.components.clutch) + ' (תווית לימודית, לא רגע הכרעה)' }
    ];
    const honesty = layer.provenance === OPEN_DATA_PROVENANCE
      ? 'אלה הספירות האמיתיות מ-' + dataset + '. אין בריפו יומן אירועים גולמי — רק המצטבר שנבנה ממנו.'
      : 'אלה הספירות מהשכבה הפעילה ' + layer.provenance + ' (' + dataset + '). לא Open Data אלא אם התווית אומרת זאת.';
    return {
      player: { id: player.id, name: player.name, team: player.team, minutes: minutes, group: player.group },
      dataset: dataset,
      provenance: layer.provenance,
      caps: activeCaps,
      capsSource: capsSource,
      capSaturation: capSaturation,
      honesty: honesty,
      rows: rows,
      unused: rows.filter(function (row) { return !row.usedInScore; }),
      capped: rows.filter(function (row) { return row.capped; }),
      receipt: receipt
    };
  }

  function glossaryForPlayer(player) {
    const counts = player && player.counts || {};
    const raw = player && player.components && player.components.raw || {};
    return EVENT_GLOSSARY.map(function (item) {
      let selectedTotal = null;
      if (item.field === 'totalMinutesProxy') selectedTotal = player ? player.minutes : null;
      else if (item.field && counts) selectedTotal = counts[item.field];
      return Object.assign({}, item, {
        selectedName: player ? player.name : null,
        selectedTotal: selectedTotal,
        selectedPer90: item.recipeKey && raw[item.recipeKey] != null ? raw[item.recipeKey] : null
      });
    });
  }

  function rankValues(values) {
    const indexed = values.map(function (value, i) { return { value: Number(value) || 0, i: i }; });
    indexed.sort(function (a, b) {
      if (a.value !== b.value) return a.value - b.value;
      return a.i - b.i;
    });
    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j < indexed.length && indexed[j].value === indexed[i].value) j += 1;
      const avg = (i + 1 + j) / 2;
      for (let k = i; k < j; k += 1) ranks[indexed[k].i] = avg;
      i = j;
    }
    return ranks;
  }

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      const x = Number(xs[i]) || 0;
      const y = Number(ys[i]) || 0;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
    const num = n * sxy - sx * sy;
    const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (!den) return null;
    return round2(num / den);
  }

  function spearman(xs, ys) {
    if (!xs || !ys || xs.length !== ys.length || xs.length < 2) return null;
    return pearson(rankValues(xs), rankValues(ys));
  }

  function worldCupGroup(team) {
    return WC2018_TEAM_GROUP[team] || null;
  }

  // groups: WC houses A–D/E–H when the team is known; otherwise an arbitrary
  // deterministic team-hash split (teammates stay together). Explicitly not a
  // held-out season — see validateMetric.splitLabel / heldOutSeason:false.
  function assignFold(player, splitId) {
    if (splitId === 'hash') {
      return (hashSeed(playerKey(player)) % 2 === 0) ? 'train' : 'test';
    }
    const group = worldCupGroup(player.team);
    if (group) {
      return 'ABCD'.indexOf(group) >= 0 ? 'train' : 'test';
    }
    // Non-WC / BYOD / synthetic: arbitrary split by team name hash.
    const team = String(player && player.team || '');
    return (hashSeed('fold-team|' + team) % 2 === 0) ? 'train' : 'test';
  }

  function splitIsWorldCupGroups(players) {
    return (players || []).some(function (row) { return !!worldCupGroup(row.team); });
  }

  function describeSplitLabel(splitId, players) {
    if (splitId === 'hash') {
      return 'פיצול דטרמיניסטי לפי שם (לא לפי קבוצה) — שרירותי, לא עונה מוחזקת';
    }
    if (splitIsWorldCupGroups(players)) {
      return 'בתים A–D אימון, E–H מבחן — אותו מונדיאל 2018 (לא עונה חדשה)';
    }
    return 'פיצול שרירותי לפי קבוצה (hash) — לא בתים של מונדיאל; אין עונה מוחזקת';
  }


  function createRng(seed) {
    let state = hashSeed(seed);
    return function next() {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Poisson draw for count uncertainty. Knuth for small λ; Normal≈ for large
  // λ so passesCompleted (~hundreds) cannot spin on exp(-λ)≈0.
  function samplePoisson(lambda, rng) {
    const lam = Number(lambda);
    if (!Number.isFinite(lam) || lam <= 0) return 0;
    if (lam < 30) {
      const L = Math.exp(-lam);
      let k = 0;
      let p = 1;
      do {
        k += 1;
        p *= rng();
      } while (p > L);
      return k - 1;
    }
    let u;
    let v;
    let s;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const z = u * Math.sqrt(-2 * Math.log(s) / s);
    const drawn = Math.round(lam + Math.sqrt(lam) * z);
    return drawn < 0 ? 0 : drawn;
  }

  // Resample event totals ~ Poisson(observed) at the same minutes, then rebuild
  // components from the new counts (ignore per90File so totals drive /90).
  function resamplePlayerCounts(player, rng, caps) {
    const counts = player && player.counts ? player.counts : {};
    const nextCounts = {};
    const row = {
      name: player.name,
      team: player.team,
      position: player.position,
      totalMinutesProxy: player.minutes,
      minutes: player.minutes
    };
    COUNT_FIELDS.forEach(function (key) {
      const v = counts[key];
      if (v == null || !Number.isFinite(Number(v))) {
        nextCounts[key] = null;
        return;
      }
      const drawn = samplePoisson(Number(v), rng);
      nextCounts[key] = drawn;
      row[key] = drawn;
    });
    return Object.assign({}, player, {
      counts: nextCounts,
      per90File: null,
      components: componentsFromEvents(row, caps || WC2018_CAPS)
    });
  }

  // 90% rank interval via repeated Poisson resampling of the same counts over
  // the same minutes. Seed goes through hashSeed (via createRng) for
  // byte-stable repeats. Low-minute players get wider intervals at similar
  // per90 rates because Poisson noise on smaller totals swings /90 harder.
  function rankInterval(prepared, spec, options) {
    const opts = options || {};
    const samples = opts.samples == null ? 100 : Math.max(0, Number(opts.samples) || 0);
    const seed = opts.seed == null ? 'scoutai-rank-interval' : String(opts.seed);
    const metric = normalizeMetricSpec(spec);
    const scoreOpts = { minPeers: opts.minPeers };
    const base = scorePrepared(prepared, metric, scoreOpts);
    if (!base.length || samples <= 0) {
      return base.map(function (row) {
        return {
          id: row.id,
          name: row.name,
          rank: row.rank,
          lo: row.rank,
          hi: row.rank,
          top10Share: row.rank <= 10 ? 1 : 0,
          samples: samples,
          seed: seed
        };
      });
    }
    const rng = createRng(seed);
    const lists = Object.create(null);
    base.forEach(function (row) { lists[row.id] = []; });
    for (let s = 0; s < samples; s += 1) {
      const resampled = prepared.map(function (player) {
        return resamplePlayerCounts(player, rng, opts.caps || WC2018_CAPS);
      });
      const ranked = scorePrepared(resampled, metric, scoreOpts);
      ranked.forEach(function (row) {
        if (lists[row.id]) lists[row.id].push(row.rank);
      });
    }
    return base.map(function (row) {
      const raw = lists[row.id] || [];
      const sorted = raw.slice().sort(function (a, b) { return a - b; });
      const lo = sorted.length ? percentileSorted(sorted, 0.05) : row.rank;
      const hi = sorted.length ? percentileSorted(sorted, 0.95) : row.rank;
      let top10 = 0;
      for (let i = 0; i < sorted.length; i += 1) {
        if (sorted[i] <= 10) top10 += 1;
      }
      return {
        id: row.id,
        name: row.name,
        rank: row.rank,
        lo: lo == null ? row.rank : lo,
        hi: hi == null ? row.rank : hi,
        top10Share: sorted.length ? round2(top10 / samples) : 0,
        samples: samples,
        seed: seed
      };
    });
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function percentileSorted(sorted, q) {
    if (!sorted.length) return null;
    const idx = Math.floor((sorted.length - 1) * q);
    return round2(sorted[idx]);
  }

  function bestComponentEntry(componentRho) {
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    let best = null;
    Object.keys(labels).forEach(function (id) {
      const rho = componentRho ? componentRho[id] : null;
      if (rho == null || !Number.isFinite(rho)) return;
      if (!best || Math.abs(rho) > Math.abs(best.rho) ||
          (Math.abs(rho) === Math.abs(best.rho) && rho > best.rho)) {
        best = { id: id, label: labels[id], rho: rho };
      }
    });
    return best;
  }

  function bootstrapSpearmanCi(scores, outcomes, seed, bootstraps) {
    const nBoot = bootstraps || 200;
    const rng = createRng(String(seed) + '|boot');
    const n = scores.length;
    const rhos = [];
    for (let b = 0; b < nBoot; b += 1) {
      const xs = [];
      const ys = [];
      for (let i = 0; i < n; i += 1) {
        const j = Math.floor(rng() * n);
        xs.push(scores[j]);
        ys.push(outcomes[j]);
      }
      const rho = spearman(xs, ys);
      if (rho != null) rhos.push(rho);
    }
    rhos.sort(function (a, b) { return a - b; });
    return {
      lo: percentileSorted(rhos, 0.025),
      hi: percentileSorted(rhos, 0.975),
      point: spearman(scores, outcomes),
      bootstraps: nBoot,
      seed: String(seed)
    };
  }

  function permutationPValue(scores, outcomes, seed, permutations) {
    const nPerm = permutations || 200;
    const observed = spearman(scores, outcomes);
    if (observed == null) {
      return { p: null, observed: null, permutations: nPerm, seed: String(seed) };
    }
    const absObs = Math.abs(observed);
    const rng = createRng(String(seed) + '|perm-p');
    let ge = 0;
    for (let p = 0; p < nPerm; p += 1) {
      const shuffled = outcomes.slice();
      shuffleInPlace(shuffled, rng);
      const rho = spearman(scores, shuffled);
      if (Math.abs(rho == null ? 0 : rho) >= absObs) ge += 1;
    }
    return {
      p: Math.round(((ge + 1) / (nPerm + 1)) * 10000) / 10000,
      observed: observed,
      permutations: nPerm,
      seed: String(seed)
    };
  }

  function signedNullBandFromPermutation(scores, outcomes, seed, permutations) {
    const nPerm = permutations || 200;
    const rng = createRng(seed);
    const rhos = [];
    for (let p = 0; p < nPerm; p += 1) {
      const shuffled = outcomes.slice();
      shuffleInPlace(shuffled, rng);
      const rho = spearman(scores, shuffled);
      rhos.push(rho == null ? 0 : rho);
    }
    rhos.sort(function (a, b) { return a - b; });
    return {
      lo: percentileSorted(rhos, 0.025),
      hi: percentileSorted(rhos, 0.975),
      p50: percentileSorted(rhos, 0.5),
      permutations: nPerm,
      seed: String(seed)
    };
  }

  function overfitBandFromRandomSplits(ranked, outcomeId, seed, splits) {
    const nSplits = splits || 200;
    const rng = createRng(String(seed) + '|overfit');
    const drops = [];
    for (let s = 0; s < nSplits; s += 1) {
      const train = [];
      const test = [];
      ranked.forEach(function (row) {
        if (rng() < 0.5) train.push(row);
        else test.push(row);
      });
      const trainRho = spearman(
        train.map(function (row) { return row.score; }),
        train.map(function (row) { return outcomeValue(row, outcomeId); })
      );
      const testRho = spearman(
        test.map(function (row) { return row.score; }),
        test.map(function (row) { return outcomeValue(row, outcomeId); })
      );
      if (trainRho != null && testRho != null) drops.push(round2(trainRho - testRho));
    }
    drops.sort(function (a, b) { return a - b; });
    return {
      lo: percentileSorted(drops, 0.025),
      hi: percentileSorted(drops, 0.975),
      p50: percentileSorted(drops, 0.5),
      splits: nSplits,
      seed: String(seed)
    };
  }

  function redactTestUntilLock(stats, revealed) {
    if (revealed) {
      return Object.assign({}, stats, { revealed: true });
    }
    return {
      n: stats ? stats.n : 0,
      rho: null,
      minutesRho: null,
      outcomeMissing: !!(stats && stats.outcomeMissing),
      topMetric: [],
      topOutcome: [],
      componentRho: { grit: null, involvement: null, clutch: null },
      bestComponent: null,
      revealed: false,
      redacted: true,
      redactedReason: 'weights-unlocked'
    };
  }

  function nullBandFromPermutation(scores, outcomes, seed, permutations) {
    const nPerm = permutations || 200;
    const rng = createRng(seed);
    const absRhos = [];
    for (let p = 0; p < nPerm; p += 1) {
      const shuffled = outcomes.slice();
      shuffleInPlace(shuffled, rng);
      const rho = spearman(scores, shuffled);
      absRhos.push(Math.abs(rho == null ? 0 : rho));
    }
    absRhos.sort(function (a, b) { return a - b; });
    return {
      p50: percentileSorted(absRhos, 0.5),
      p95: percentileSorted(absRhos, 0.95),
      permutations: nPerm,
      seed: String(seed)
    };
  }

  function defenderHintBaseline(players, testRows, outcomeId, splitId) {
    const hintMetric = normalizeMetricSpec(DEFENDER_EXERCISE.hint);
    const hintRanked = scorePrepared(players, hintMetric);
    const wanted = {};
    testRows.forEach(function (row) { wanted[row.id] = true; });
    const hintTest = hintRanked.filter(function (row) { return wanted[row.id]; });
    const outcomes = hintTest.map(function (row) { return outcomeValue(row, outcomeId); });
    return {
      rho: spearman(hintTest.map(function (row) { return row.score; }), outcomes),
      n: hintTest.length,
      splitId: splitId,
      outcomeId: outcomeId,
      metric: {
        grit: hintMetric.grit,
        involvement: hintMetric.involvement,
        clutch: hintMetric.clutch,
        minMinutes: hintMetric.minMinutes,
        normalizePosition: hintMetric.normalizePosition
      },
      label: 'תרגיל הבלמים (רמז) על אותו מדגם מבחן'
    };
  }

  function foldStats(rows, outcomeId) {
    const scores = rows.map(function (row) { return row.score; });
    const outcomes = rows.map(function (row) { return outcomeValue(row, outcomeId); });
    const minutes = rows.map(function (row) { return row.minutes; });
    const outcomeMissing = rows.length > 0 && outcomes.every(function (v) { return v == null; });
    if (outcomeMissing) {
      return {
        n: rows.length,
        rho: null,
        minutesRho: null,
        outcomeMissing: true,
        topMetric: rows.slice(0, 5).map(function (row) {
          return { id: row.id, name: row.name, team: row.team, score: row.score, outcome: null };
        }),
        topOutcome: [],
        componentRho: { grit: null, involvement: null, clutch: null },
        bestComponent: null
      };
    }
    const rho = spearman(scores, outcomes);
    const byOutcome = rows.slice().sort(function (a, b) {
      return (outcomeValue(b, outcomeId) || 0) - (outcomeValue(a, outcomeId) || 0);
    });
    function componentRhoFor(key) {
      const xs = rows.map(function (row) { return row.components[key]; });
      if (xs.every(function (v) { return v == null; })) return null;
      return spearman(xs.map(function (v) { return v == null ? 0 : v; }), outcomes);
    }
    const componentRho = {
      grit: componentRhoFor('grit'),
      involvement: componentRhoFor('involvement'),
      clutch: componentRhoFor('clutch')
    };
    return {
      n: rows.length,
      rho: rho,
      minutesRho: spearman(minutes, outcomes),
      outcomeMissing: false,
      topMetric: rows.slice(0, 5).map(function (row) {
        return { id: row.id, name: row.name, team: row.team, score: row.score, outcome: outcomeValue(row, outcomeId) };
      }),
      topOutcome: byOutcome.slice(0, 5).map(function (row) {
        return { id: row.id, name: row.name, team: row.team, score: row.score, outcome: outcomeValue(row, outcomeId) };
      }),
      componentRho: componentRho,
      bestComponent: bestComponentEntry(componentRho)
    };
  }

  function validateMetric(prepared, spec, options) {
    const metric = normalizeMetricSpec(spec);
    const opts = options || {};
    const outcomeId = opts.outcomeId || metric.outcomeId;
    const splitId = opts.splitId || metric.splitId;
    const seed = opts.seed || 'scoutai-demo-001';
    const permutations = opts.permutations || 200;
    const bootstraps = opts.bootstraps || 200;
    const splitResamples = opts.splitResamples || 200;
    // Direct API default: revealed. UI/store.derive passes revealed:!!weightsLocked.
    const revealed = opts.revealed == null ? true : !!opts.revealed;
    const attempts = opts.attempts != null ? opts.attempts : metric.weightAttempts;
    const meta = outcomeMeta(outcomeId);
    const players = asPrepared(prepared);
    const audit = auditOutcome(players, outcomeId);
    const ranked = rankOnce(players, metric, opts.scoreOpts, opts.rankCache);
    const train = [];
    const test = [];
    const unassigned = [];
    ranked.forEach(function (row) {
      const fold = assignFold(row, splitId);
      if (fold === 'train') train.push(row);
      else if (fold === 'test') test.push(row);
      else unassigned.push(row);
    });
    // Always compute folds; redact ρ when leaky so UI/BYOD never show
    // holdout Spearman before the copy flag. Separately redact test until lock.
    const trainRaw = foldStats(train, outcomeId);
    const testRaw = foldStats(test, outcomeId);
    const trainStats = redactFoldIfLeaky(trainRaw, audit.leaky);
    let testStats = redactFoldIfLeaky(testRaw, audit.leaky);
    const drop = (!audit.leaky && trainRaw.rho != null && testRaw.rho != null)
      ? round2(trainRaw.rho - testRaw.rho)
      : null;
    const testOutcomes = test.map(function (row) { return outcomeValue(row, outcomeId); });
    const testScores = test.map(function (row) { return row.score; });
    const canBand = !(testRaw.outcomeMissing || audit.leaky);
    const rhoCi = canBand
      ? bootstrapSpearmanCi(testScores, testOutcomes, seed, bootstraps)
      : null;
    const permP = canBand
      ? permutationPValue(testScores, testOutcomes, seed, permutations)
      : null;
    const signedNull = canBand
      ? signedNullBandFromPermutation(testScores, testOutcomes, seed, permutations)
      : null;
    const overfitBand = canBand
      ? overfitBandFromRandomSplits(ranked, outcomeId, seed, splitResamples)
      : null;
    const baselines = {
      minutes: {
        rho: revealed ? testRaw.minutesRho : null,
        label: 'דירוג לפי דקות בלבד מול אותו יעד'
      },
      bestComponent: revealed ? testRaw.bestComponent : null,
      nullBand: (canBand && revealed)
        ? nullBandFromPermutation(testScores, testOutcomes, seed, permutations)
        : null,
      signedNullBand: (canBand && revealed) ? signedNull : null,
      rhoCi: (canBand && revealed) ? rhoCi : null,
      permutationP: (canBand && revealed && permP) ? permP.p : null,
      permutation: (canBand && revealed) ? permP : null,
      overfitBand: (canBand && revealed) ? overfitBand : null,
      defenderHint: (canBand && revealed)
        ? defenderHintBaseline(players, test, outcomeId, splitId)
        : null
    };
    const beatsMinutes = !!(testRaw.rho != null && testRaw.minutesRho != null &&
      testRaw.rho > testRaw.minutesRho);
    testStats = redactTestUntilLock(testStats, revealed && !audit.leaky);
    if (audit.leaky) {
      testStats = Object.assign({}, testStats, { revealed: revealed });
    }
    const lock = {
      locked: !!metric.weightsLocked,
      revealed: revealed,
      attempts: attempts || 0
    };
    return {
      outcomeId: outcomeId,
      outcomeLabel: meta.label,
      leaky: audit.leaky,
      leakNote: audit.leakNote,
      audit: audit,
      splitId: splitId,
      splitLabel: describeSplitLabel(splitId, players),
      heldOutSeason: false,
      honesty: splitIsWorldCupGroups(players)
        ? 'אין בריפו עונה שנייה של אותן ספירות אירועים. זה פיצול מדגם בתוך מונדיאל 2018, לא חיזוי עונה מוחזקת.'
        : 'אין עונה מוחזקת. הפיצול בשכבה הפעילה הוא שרירותי (קבוצה/שם) בתוך אותו קובץ — לא חיזוי עונה חדשה.',
      unassigned: unassigned.length,
      train: trainStats,
      test: testStats,
      rhoDrop: revealed ? drop : null,
      baselines: baselines,
      beatsMinutes: revealed ? beatsMinutes : false,
      seed: String(seed),
      revealed: revealed,
      lock: lock,
      verdict: validationVerdict(trainStats, testStats, meta, audit, baselines, {
        revealed: revealed,
        rhoDrop: drop,
        overfitBand: overfitBand,
        rhoCi: rhoCi,
        permutationP: permP,
        locked: !!metric.weightsLocked,
        attempts: attempts || 0
      })
    };
  }

  function validationVerdict(trainStats, testStats, meta, audit, baselines, extras) {
    const notes = [];
    const info = extras || {};
    if ((trainStats && trainStats.outcomeMissing) || (testStats && testStats.outcomeMissing)) {
      const field = meta && meta.field ? meta.field : (meta && meta.id) || 'assists';
      const label = meta && meta.label ? meta.label : field;
      notes.push('עמודת היעד «' + label + '» (' + field + ') חסרה בקובץ — לא מחושב Spearman. זה לא אומר שהמדד אינו חוזה.');
      return notes.join(' ');
    }
    notes.push('זו אינה עונה חדשה.');
    if (audit && audit.leaky) {
      notes.push(audit.leakNote);
      notes.push('ρ מול היעד מוסתר עד לתיקון הדליפה.');
      return notes.join(' ');
    }
    if (!info.revealed) {
      notes.push('מדגם המבחן מוסתר עד לנעילת המשקלים («נעל את המשקלים האלה»).');
      notes.push('נוסו עד כה ' + (info.attempts || 0) + ' תצורות משקל ייחודיות.');
      notes.push('ρ באימון זמין לכיול; ρ במבחן נחשף רק אחרי הנעילה — גם בשכבת Open Data החופשית.');
      return notes.join(' ');
    }
    if (audit && audit.maxRho != null) {
      notes.push('ביקורת חפיפה: מקסימום ρ=' + audit.maxRho +
        (audit.maxField ? (' מול «' + audit.maxField + '»') : '') +
        ' (מתחת לסף ' + (audit.threshold != null ? audit.threshold : LEAKY_RHO) + ').');
    }
    if (meta && meta.leakNote && !(audit && audit.leaky)) notes.push(meta.leakNote);
    if (testStats.n < 20) notes.push('מדגם המבחן קטן — אסור להכריז על תוקף.');
    if (info.locked) {
      notes.push('משקלים נעולים אחרי ' + (info.attempts || 0) + ' תצורות ייחודיות.');
    }
    const ci = info.rhoCi || (baselines && baselines.rhoCi);
    const perm = info.permutationP || (baselines && baselines.permutation);
    if (testStats.rho == null) {
      notes.push('אין מספיק שחקנים לחישוב Spearman במבחן.');
    } else if (ci && ci.lo != null && ci.hi != null) {
      notes.push('ρ במבחן ' + testStats.rho +
        ' [' + ci.lo + ', ' + ci.hi + '] (CI בוטסטרפ)' +
        (perm && perm.p != null ? ('; · p פרמוטציה=' + perm.p) : '') +
        ' — קשר סטטיסטי בתוך אותו טורניר, לא הוכחת סקאוטינג.');
    } else {
      notes.push('ρ במבחן ' + testStats.rho + ' הוא קשר סטטיסטי בתוך אותו טורניר, לא הוכחת סקאוטינג.');
    }
    const drop = info.rhoDrop;
    const ob = info.overfitBand || (baselines && baselines.overfitBand);
    if (drop != null && ob && ob.lo != null && ob.hi != null) {
      if (drop >= ob.lo && drop <= ob.hi) {
        notes.push('Δρ=' + drop + ' בתוך רצועת פיצולים אקראיים [' +
          ob.lo + ', ' + ob.hi + '] — אין ראיה חזקה להתאמת-יתר מעבר לרעש הפיצול.');
      } else {
        notes.push('Δρ=' + drop + ' מחוץ לרצועת פיצולים אקראיים [' +
          ob.lo + ', ' + ob.hi + '] — חשד להתאמת-יתר למדגם האימון.');
      }
    }
    if (baselines && baselines.minutes && baselines.minutes.rho != null && testStats.rho != null) {
      if (testStats.rho > baselines.minutes.rho) {
        notes.push('המדד עוקף את קו־הבסיס של דקות בלבד (ρ=' + baselines.minutes.rho + ').');
      } else {
        notes.push('המדד לא עוקף את קו־הבסיס של דקות בלבד (ρ=' + baselines.minutes.rho + ').');
      }
    }
    if (baselines && baselines.nullBand && baselines.nullBand.p95 != null && testStats.rho != null) {
      notes.push('רצועת האפס (פרמוטציה, p95 של |ρ|) ≈ ' + baselines.nullBand.p95 +
        '; המדד יושב רק מעט מעליה אם בכלל.');
    }
    if (baselines && baselines.signedNullBand && baselines.signedNullBand.lo != null) {
      notes.push('רצועת אפס חתומה (פרמוטציה) [' + baselines.signedNullBand.lo +
        ', ' + baselines.signedNullBand.hi + '] מקיפה את 0.');
    }
    if (baselines && baselines.bestComponent && baselines.bestComponent.rho != null) {
      notes.push('רכיב בודד חזק ביותר במבחן: ' + baselines.bestComponent.label +
        ' ρ=' + baselines.bestComponent.rho + '.');
    }
    if (baselines && baselines.defenderHint && baselines.defenderHint.rho != null) {
      notes.push('רמז תרגיל הבלמים על אותו מדגם מבחן: ρ=' + baselines.defenderHint.rho +
        ' (אי־התאמה ליעד התקפי אינה כישלון — זה שיעור).');
    }
    return notes.join(' ');
  }


  // Single source of truth for course <option value> contracts (ב9).
  // quizMarkup(ui.js) renders these; evaluateCurriculum grades static correct:true
  // options from the same table. Contextual fields (caps/fragility/beatsMinutes/per90)
  // keep live grading but still list their option catalogs here.
  const COURSE_QUIZ = Object.freeze({
    events: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'unusedField',
          controlId: 'ansUnusedField',
          kind: 'select',
          label: 'איזה שדה נאסף ולא נכנס לנוסחה?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'pressures', label: 'pressures (לחיצות)', correct: false }),
            Object.freeze({ value: 'dribbles', label: 'dribbles (כדרורים)', correct: true }),
            Object.freeze({ value: 'shotXgSum', label: 'shotXgSum (xG)', correct: false }),
            Object.freeze({ value: 'keyPasses', label: 'keyPasses (מסירות מפתח)', correct: false })
          ])
        })
      ])
    }),
    per90: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'per90',
          controlId: 'ansPer90',
          kind: 'number',
          label: '{who} רשם {press} לחיצות ב-{mins} דקות — כמה לחיצות ל-90?',
          placeholder: 'לדוגמה 26.52'
        })
      ])
    }),
    caps: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'cappedField',
          controlId: 'ansCap',
          kind: 'select',
          dynamicCaps: true,
          label: 'איזה רכיב אצל השחקן הנבחר נחתך בתקרה?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'none', label: 'שום דבר לא נחתך', correct: false })
          ])
        })
      ])
    }),
    weights: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'weightsManual',
          controlId: 'ansWeights',
          kind: 'select',
          label: 'המשקלות במעבדה הן',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'yes', label: 'ידניות ושרירותיות, לא מודל מכויל', correct: true }),
            Object.freeze({ value: 'no', label: 'כיול מדעי מעונת 2018', correct: false })
          ])
        })
      ])
    }),
    defenders: Object.freeze({
      fields: Object.freeze([]),
      emptyMessage: 'התרגיל חי במעבדת הבלמים למעלה — הזיזו משקלות עד שהבדיקה ירוקה.'
    }),
    fragility: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'fragilityPredict',
          controlId: 'ansBump',
          kind: 'select',
          label: 'לפני הגילוי: איזו דחיפת +10 תשפר הכי את דירוג {who}?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'grit', label: 'Grit +10', correct: false }),
            Object.freeze({ value: 'involvement', label: 'Involvement +10', correct: false }),
            Object.freeze({ value: 'clutch', label: 'Clutch +10', correct: false }),
            Object.freeze({ value: 'none', label: 'שום דחיפה לא משפרת', correct: false })
          ])
        })
      ])
    }),
    holdout: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'splitIsSeason',
          controlId: 'ansSeason',
          kind: 'select',
          label: 'האם הפיצול (בתים או שרירותי) הוא עונה חדשה?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'no', label: 'לא — אותו מונדיאל, שני מדגמי קבוצות', correct: true }),
            Object.freeze({ value: 'yes', label: 'כן — זו העונה המוחזקת', correct: false })
          ])
        }),
        Object.freeze({
          key: 'whatMatters',
          controlId: 'ansRho',
          kind: 'select',
          label: 'איזה Spearman קובע אם המדד מכליל?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'test', label: 'ρ במבחן', correct: true }),
            Object.freeze({ value: 'train', label: 'ρ באימון', correct: false })
          ])
        }),
        Object.freeze({
          key: 'beatsMinutes',
          controlId: 'ansBeats',
          kind: 'select',
          label: 'האם המדד שלכם עוקף את קו־הבסיס של דקות בלבד?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'no', label: 'לא עוקף — ρ המדד ≤ ρ דקות', correct: false }),
            Object.freeze({ value: 'yes', label: 'עוקף — ρ המדד גבוה מ-ρ דקות', correct: false })
          ])
        })
      ])
    }),
    honesty: Object.freeze({
      fields: Object.freeze([
        Object.freeze({
          key: 'unusedTerm',
          controlId: 'ansTerm',
          kind: 'select',
          label: 'מונח שנאסף ולא נכנס לציון',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'Pressure', label: 'Pressure', correct: false }),
            Object.freeze({ value: 'dribble', label: 'Dribble / Goal / Assist', correct: true }),
            Object.freeze({ value: 'Pass', label: 'Pass', correct: false })
          ])
        }),
        Object.freeze({
          key: 'commercial',
          controlId: 'ansCommercial',
          kind: 'select',
          label: 'האם מותר למכור ניתוח על הנתונים האלה?',
          options: Object.freeze([
            Object.freeze({ value: '', label: '— בחרו —' }),
            Object.freeze({ value: 'no', label: 'לא — Open Data אסור למסחר', correct: true }),
            Object.freeze({ value: 'yes', label: 'כן, אם נותנים קרדיט', correct: false })
          ])
        })
      ])
    })
  });

  function quizField(lessonId, fieldKey) {
    const entry = COURSE_QUIZ[lessonId];
    if (!entry || !entry.fields) return null;
    for (let i = 0; i < entry.fields.length; i += 1) {
      if (entry.fields[i].key === fieldKey) return entry.fields[i];
    }
    return null;
  }

  function quizMarkedCorrect(lessonId, fieldKey) {
    const field = quizField(lessonId, fieldKey);
    if (!field || !field.options) return [];
    return field.options.filter(function (opt) { return opt.correct === true; }).map(function (opt) { return opt.value; });
  }

  function matchesMarkedQuiz(lessonId, fieldKey, value) {
    const marked = quizMarkedCorrect(lessonId, fieldKey);
    if (!marked.length) return false;
    if (marked.indexOf(value) >= 0) return true;
    // Accept the option label for unusedTerm historical alias.
    const field = quizField(lessonId, fieldKey);
    if (!field || !field.options) return false;
    return field.options.some(function (opt) {
      return opt.correct === true && (opt.value === value || opt.label === value);
    });
  }


  const CURRICULUM_LESSONS = Object.freeze([
    {
      id: 'events',
      title: '1. ספירת אירועים',
      section: 'explorer',
      body: 'הקובץ המקומי סופר אירועי StatsBomb לשחקן בטורניר, לא שומר יומן משחק. לחצו על שחקן וקראו את הקבלה: כמה Pressure, כמה Pass, ומה לא נכנס לציון.',
      exercise: 'מצאו אצל השחקן הנבחר שדה שנאסף בקובץ ואינו נכנס לנוסחה.',
      hint: null
    },
    {
      id: 'per90',
      title: '2. ל-90 דקות',
      section: 'explorer',
      body: 'ספירה גולמית מעדיפה מי ששיחק יותר. לכן מחלקים בדקות ומכפילים ב-90. השאלה קשורה לשחקן הנבחר בטבלה — לא לתרגיל קבוע.',
      exercise: 'השחקן הנבחר רשם לחיצות בדקות שלו — חשבו לחיצות ל-90 לפי הקבלה בחוקר.',
      hint: null
    },
    {
      id: 'caps',
      title: '3. תקרות שרירותיות',
      section: 'explorer',
      body: 'כל רכיב נחתך בתקרה (ב־Open Data: לחיצות 18/90, xG 0.6/90…; ב־BYOD: תקרות מהתפלגות הקובץ). מי שמעל התקרה מקבל 100. התקרה אינה כיול מדעי. בדקו מה נחתך אצל השחקן הנבחר.',
      exercise: 'איזה רכיב אצל השחקן הנבחר נחתך בתקרה? אם כלום — סמנו «שום דבר לא נחתך».',
      hint: null
    },
    {
      id: 'weights',
      title: '4. משקלות ידניות',
      section: 'lab',
      body: 'Grit / Involvement / Clutch הם תוויות לימודיות. המשקלות זזות ביד. הנוסחה גלויה כדי שאפשר להתווכח עליה.',
      exercise: 'אשרו שהמשקלות ידניות, לא מכוילות, וששינוי שלהן משנה דירוג.',
      hint: null
    },
    {
      id: 'defenders',
      title: '5. הטיית עמדה',
      section: 'exercise',
      body: 'מדד 40/30/30 מעדיף חלוצים כי Clutch בנוי מ-xG. בלם נמדד אחרת רק אם משנים משקלות או מנרמלים עמדה.',
      exercise: 'עברו את תרגיל הבלמים החי — אותה בדיקה עצמית כמו במעבדה.',
      hint: { grit: 70, involvement: 20, clutch: 10, minMinutes: 270, normalizePosition: true }
    },
    {
      id: 'fragility',
      title: '6. שבריריות',
      section: 'fragility',
      body: 'תוספת 10 נקודות למשקל אחד מזיזה דירוגים. נבאו לפני הגילוי איזו דחיפה משפרת את השחקן הנבחר — ואז בדקו במעבדת השבריריות.',
      exercise: 'לפני הגילוי: איזו דחיפת +10 תשפר הכי הרבה את דירוג השחקן הנבחר?',
      hint: null
    },
    {
      id: 'holdout',
      title: '7. מדגם מוחזק',
      section: 'validate',
      body: 'אין עונה שנייה בריפו. ב־Open Data הפיצול הכנה הוא בתים A–D מול E–H באותו מונדיאל; ב־BYOD/סינתטי — פיצול שרירותי לפי קבוצה (hash) או לפי שם. ρ במבחן מוסתר עד שלוחצים «נעל את המשקלים האלה» — גם בשכבת Open Data החופשית — כדי שלא לכוון משקלות לפי המספר המוחזק. אחרי הנעילה מדווחים כמה תצורות משקל נוסו, ו־ρ מוצג עם CI בוטסטרפ ו־p פרמוטציה מול רצועת אפס ונקודות ייחוס (דקות בלבד, רכיב בודד).',
      exercise: 'נעלו משקלים, ואז ענו: האם הפיצול (בתים או שרירותי) הוא עונה חדשה, מה המספר שקובע (ρ מבחן), והאם המדד שלכם עוקף את קו־הבסיס של דקות בלבד?',
      hint: null
    },
    {
      id: 'honesty',
      title: '8. יושרה',
      section: 'glossary',
      body: 'מה שנאסף לא בהכרח מה שמחושב. Open Data אסור למסחר. פיצ\'ר משכנע אחרי המסקנה הוא מלכודת — ראו את שיעור הפיצ\'רים.',
      exercise: 'סמנו מונח שנאסף ולא נכנס לציון, ואשרו שהנתונים אינם למסחר.',
      hint: null
    }
  ]);

  function answered(value) {
    return value != null && String(value) !== '';
  }

  function evaluateCurriculum(context) {
    const ctx = context || {};
    const answers = ctx.answers || {};
    const selected = ctx.selected;
    const explorer = ctx.explorer || buildEventExplorer(selected);
    const validation = ctx.validation;
    const exercise = ctx.exercise;
    const unusedKeys = (explorer.unused || []).map(function (row) { return row.key; });
    return CURRICULUM_LESSONS.map(function (lesson) {
      let checks = [];
      if (lesson.id === 'events') {
        checks = [
          {
            id: 'has-player',
            label: 'נבחר שחקן עם ספירות מהקובץ',
            pass: !!(selected && selected.counts),
            detail: selected ? selected.name + ' — ' + (explorer.rows || []).length + ' שדות.' : 'בחרו שורה בטבלה.'
          },
          {
            id: 'unused-field',
            label: 'זיהיתם שדה שנאסף ולא נכנס לנוסחה',
            pass: unusedKeys.indexOf(answers.unusedField) >= 0,
            detail: answered(answers.unusedField)
              ? (unusedKeys.indexOf(answers.unusedField) >= 0 ? answers.unusedField + ' באמת לא בנוסחה.' : answers.unusedField + ' כן נכנס, או אינו שדה במצטבר.')
              : 'בחרו שדה מהרשימה ליד החוקר.'
          }
        ];
      } else if (lesson.id === 'per90') {
        const pressRow = (explorer.rows || []).find(function (row) { return row.key === 'pressures'; });
        const expected90 = pressRow ? pressRow.per90 : null;
        const pressTotal = selected && selected.counts ? (selected.counts.pressures || 0) : 0;
        const mins = selected ? (selected.minutes || 0) : 0;
        checks = [
          {
            id: 'per90-math',
            label: selected
              ? (selected.name + ' רשם ' + pressTotal + ' לחיצות ב-' + mins + ' דקות — הזינו ל-90')
              : 'בחרו שחקן וחשבו לחיצות ל-90 לפי הקבלה',
            pass: expected90 != null && nearNumber(answers.per90, expected90, 0.05),
            detail: answered(answers.per90)
              ? (expected90 != null && nearNumber(answers.per90, expected90, 0.05)
                ? 'נכון — ' + pressTotal + ' × 90 / ' + mins + ' ≈ ' + expected90 + '.'
                : 'עניתם ' + answers.per90 + '; הקבלה אצל השחקן הנבחר נותנת ' + expected90 + '.')
              : 'חשבו: ספירה × 90 / דקות לפי השחקן הנבחר (לא תרגיל קבוע).'
          },
          {
            id: 'minutes-floor',
            label: 'סף דקות לפחות 270 — מדגם קטן משקר',
            pass: !!(ctx.spec && ctx.spec.minMinutes >= 270),
            detail: ctx.spec ? 'סף נוכחי: ' + ctx.spec.minMinutes + '.' : ''
          }
        ];
      } else if (lesson.id === 'caps') {
        const cappedRows = explorer.capped || [];
        const cappedKeys = cappedRows.map(function (row) { return row.key; });
        const capAnswer = answers.cappedField;
        const capPass = cappedKeys.length === 0
          ? capAnswer === 'none'
          : cappedKeys.indexOf(capAnswer) >= 0;
        checks = [
          {
            id: 'cap-quiz',
            label: selected
              ? ('איזה רכיב אצל ' + selected.name + ' נחתך בתקרה?')
              : 'איזה רכיב אצל השחקן הנבחר נחתך בתקרה?',
            pass: answered(capAnswer) && capPass,
            detail: answered(capAnswer)
              ? (capPass
                ? (cappedKeys.length
                  ? 'נכון — נחתך: ' + cappedRows.map(function (row) { return row.label; }).join(', ') + '.'
                  : 'נכון — אצל השחקן הנבחר שום דבר לא נחתך.')
                : (cappedKeys.length
                  ? 'לא. אצל השחקן הנבחר נחתכו: ' + cappedRows.map(function (row) { return row.label; }).join(', ') + '.'
                  : 'לא. אצל השחקן הנבחר שום דבר לא נחתך.'))
              : 'בחרו רכיב מהקבלה, או «שום דבר לא נחתך».'
          },
          {
            id: 'cap-seen',
            label: 'הקבלה בחוקר שייכת לשחקן הנבחר',
            pass: !!(selected && explorer && explorer.player && explorer.player.id === selected.id),
            detail: selected ? selected.name + ' · ' + cappedKeys.length + ' רכיבים מעל תקרה.' : 'בחרו שחקן בטבלה.'
          }
        ];
      } else if (lesson.id === 'weights') {
        checks = [
          {
            id: 'manual-weights',
            label: 'המשקלות ידניות ושרירותיות — לא מודל מכויל',
            pass: matchesMarkedQuiz('weights', 'weightsManual', answers.weightsManual),
            detail: answered(answers.weightsManual) ? '' : 'אשרו שקראתם את נוסחת המשקלות.'
          },
          {
            id: 'formula-live',
            label: 'הנוסחה החיה מוצגת במעבדה',
            pass: !!(ctx.spec),
            detail: ctx.spec ? formatFormula(ctx.spec) : ''
          }
        ];
      } else if (lesson.id === 'defenders') {
        const claim = {
          roseComponent: answers.roseComponent || '',
          costGroup: answers.costGroup || ''
        };
        const ex = (ctx.players && ctx.spec)
          ? evaluateExercise(ctx.players, ctx.spec, claim)
          : (exercise || { passed: false, checks: [], smallSample: false });
        if (ex.smallSample) {
          checks = [
            {
              id: 'defender-sample',
              label: 'תרגיל הבלמים — מדגם מספיק להערכה',
              pass: false,
              evaluable: false,
              detail: ex.summary || ('אי אפשר להעריך את הבדיקה הזאת ב-n=' + (ex.rosterN || 0))
            }
          ];
        } else {
          checks = [
            {
              id: 'defender-pass',
              label: 'תרגיל הבלמים החי עבר (כולל הצהרת פשרה)',
              pass: !!ex.passed,
              evaluable: true,
              detail: ex.summary || 'הזיזו משקלות והצהירו מי עלה ומי שילם — עד שהבדיקה העצמית ירוקה.'
            }
          ];
        }
      } else if (lesson.id === 'fragility') {
        const swings = (ctx.players && selected && ctx.spec)
          ? selectedWeightSwing(ctx.players, ctx.spec, selected.id, 10)
          : (ctx.selectedFragility || []);
        const expectedBump = bestHelpfulBump(swings);
        // Also keep a global honesty note from fragilityFromPrepared when available.
        const topMoves = ctx.fragility || (ctx.players && ctx.spec
          ? fragilityFromPrepared(ctx.players, ctx.spec, 10)
          : []);
        const anyTopSwing = topMoves.some(function (variant) {
          return variant.swings && variant.swings.length > 0;
        });
        checks = [
          {
            id: 'predict-selected',
            label: selected
              ? ('ניבאתם איזו דחיפת +10 משפרת הכי את דירוג ' + selected.name)
              : 'ניבאתם איזו דחיפת +10 משפרת את דירוג השחקן הנבחר',
            pass: answered(answers.fragilityPredict) && answers.fragilityPredict === expectedBump,
            detail: answered(answers.fragilityPredict)
              ? (answers.fragilityPredict === expectedBump
                ? 'נכון — לפני הגילוי: ' + (expectedBump === 'none' ? 'שום דחיפה לא משפרת' : expectedBump) + '.'
                : 'לא. אצל השחקן הנבחר התשובה היא ' + (expectedBump === 'none' ? 'שום דחיפה לא משפרת' : expectedBump) + '.')
              : 'נבאו לפני הגילוי במעבדת השבריריות.'
          },
          {
            id: 'bump-moves',
            label: 'דחיפת +10 באמת מזיזה דירוגים בטבלה',
            pass: anyTopSwing,
            detail: anyTopSwing ? 'יש תזוזות בטופ אחרי +10 — המדד שברירי.' : 'חשבו שבריריות עם השחקנים והמדד הנוכחיים.'
          }
        ];
      } else if (lesson.id === 'holdout') {
        const testN = validation && validation.test ? validation.test.n : 0;
        const minutesRho = validation && validation.baselines && validation.baselines.minutes
          ? validation.baselines.minutes.rho
          : null;
        const locked = !!(validation && (validation.revealed || (validation.lock && validation.lock.locked)));
        const liveBeats = !!(validation && validation.beatsMinutes);
        const expectedBeat = liveBeats ? 'yes' : 'no';
        checks = [
          {
            id: 'weights-locked',
            label: 'נעלתם משקלים לפני קריאת ρ מבחן',
            pass: locked,
            detail: locked
              ? ('נעול · נוסו ' + ((validation.lock && validation.lock.attempts) || 0) + ' תצורות.')
              : 'לחצו «נעל את המשקלים האלה» במעבדת האימות.'
          },
          {
            id: 'not-season',
            label: 'פיצול הבתים אינו עונה חדשה',
            pass: matchesMarkedQuiz('holdout', 'splitIsSeason', answers.splitIsSeason),
            detail: answered(answers.splitIsSeason)
              ? (matchesMarkedQuiz('holdout', 'splitIsSeason', answers.splitIsSeason)
                ? ('נכון. ' + ((validation && validation.splitLabel) || 'פיצול בתוך אותו קובץ') + ' — לא עונה חדשה.')
                : 'לא. אין בריפו עונה מוחזקת.')
              : 'ענו במעבדת האימות.'
          },
          {
            id: 'test-rho',
            label: 'המספר שקובע הוא ρ במבחן, לא באימון',
            pass: matchesMarkedQuiz('holdout', 'whatMatters', answers.whatMatters),
            detail: answered(answers.whatMatters) ? '' : 'בחרו מה חשוב יותר אחרי הפיצול.'
          },
          {
            id: 'beats-minutes',
            label: !locked
              ? 'אחרי נעילה: האם המדד עוקף דקות בלבד?'
              : (liveBeats
                ? 'המדד עוקף את קו־הבסיס של דקות (לפי המעבדה החיה)'
                : 'המדד לא עוקף את קו־הבסיס של דקות (לפי המעבדה החיה)'),
            pass: locked && answers.beatsMinutes === expectedBeat,
            detail: !locked
              ? 'נעלו משקלים כדי לחשוף את קו־הבסיס.'
              : (answered(answers.beatsMinutes)
                ? (answers.beatsMinutes === expectedBeat
                  ? ('נכון. ρ מבחן=' + (validation && validation.test ? validation.test.rho : '?') +
                    ' מול דקות ρ=' + minutesRho + '.')
                  : ('לא תואם את המעבדה החיה — המדד ' + (liveBeats ? 'עוקף' : 'לא עוקף') +
                    ' דקות בלבד (ρ=' + minutesRho + ').'))
                : 'ענו האם המדד עוקף את קו־הבסיס של דקות בלבד.')
          },
          {
            id: 'report-honest',
            label: 'דוח האימות מצהיר שאין עונה מוחזקת',
            pass: !!(validation && validation.heldOutSeason === false),
            detail: validation ? validation.honesty : 'המעבדה עדיין לא חושבה.'
          },
          {
            id: 'test-n',
            label: 'יש שחקנים במדגם המבחן אחרי סף הדקות',
            pass: testN > 0,
            detail: 'n מבחן = ' + testN + '.'
          }
        ];
      } else if (lesson.id === 'honesty') {
        checks = [
          {
            id: 'unused-term',
            label: 'מונח שנאסף ולא נכנס לציון',
            pass: matchesMarkedQuiz('honesty', 'unusedTerm', answers.unusedTerm),
            detail: answered(answers.unusedTerm) ? '' : 'בחרו מהמילון מונח עם התווית «לא בנוסחה».'
          },
          {
            id: 'non-commercial',
            label: 'Open Data אסור למסחר',
            pass: matchesMarkedQuiz('honesty', 'commercial', answers.commercial),
            detail: answered(answers.commercial) ? '' : 'אשרו את מגבלת הרישיון.'
          }
        ];
      }
      const passed = checks.length > 0 && checks.every(function (item) { return item.pass; });
      let exerciseText = lesson.exercise;
      if (lesson.id === 'per90' && selected) {
        const pt = selected.counts ? (selected.counts.pressures || 0) : 0;
        exerciseText = selected.name + ' רשם ' + pt + ' לחיצות ב-' + (selected.minutes || 0) +
          ' דקות — הזינו כמה זה ל-90 דקות לפי הקבלה.';
      } else if (lesson.id === 'caps' && selected) {
        exerciseText = 'איזה רכיב אצל ' + selected.name + ' נחתך בתקרה? אם כלום — «שום דבר לא נחתך».';
      } else if (lesson.id === 'fragility' && selected) {
        exerciseText = 'לפני הגילוי: איזו דחיפת +10 תשפר הכי הרבה את דירוג ' + selected.name + '?';
      }
      return {
        id: lesson.id,
        title: lesson.title,
        section: lesson.section,
        body: lesson.body,
        exercise: exerciseText,
        hint: lesson.hint,
        checks: checks,
        passed: passed
      };
    });
  }

  function bumpSpec(spec, key, delta) {
    const next = normalizeMetricSpec(spec);
    next[key] = clamp(next[key] + delta, 0, 100);
    return next;
  }

  function fragilityReport(dataset, spec, delta) {
    return fragilityFromPrepared(createStore(dataset).players, spec, delta);
  }

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    const text = String(line || '');
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        quoted = !quoted;
      } else if ((ch === ',' || ch === '\t') && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  // Friendly CSV headers → internal USER_DATASET_COLUMNS keys.
  // Exact (case-insensitive) vocab wins; then alias table; first match owns the field.
  const HEADER_ALIASES = Object.freeze({
    name: Object.freeze(['player', 'player name', 'player_name', 'שם', 'שחקן']),
    team: Object.freeze(['club', 'squad', 'side', 'קבוצה']),
    position: Object.freeze(['pos', 'עמדה']),
    minutes: Object.freeze([
      'minutes played', 'mins', 'min', 'total minutes', 'totalminutesproxy',
      'playing time', 'דקות', 'דק\'ות'
    ]),
    pressures: Object.freeze(['pressure']),
    tackles: Object.freeze(['tackle']),
    interceptions: Object.freeze(['intercept', 'ints']),
    defensiveActions: Object.freeze(['defensive actions', 'def actions']),
    progressiveActions: Object.freeze(['progressive actions', 'progressions']),
    keyPasses: Object.freeze(['key passes', 'kp']),
    passesCompleted: Object.freeze(['passes completed', 'completed passes', 'passes']),
    shotXgSum: Object.freeze(['xg', 'xG', 'npxg', 'shot xg', 'expected goals', 'xg sum']),
    boxTouches: Object.freeze(['box touches', 'touches in box']),
    shotsOnTarget: Object.freeze(['shots on target', 'sot', 'on target']),
    shots: Object.freeze(['shot']),
    goals: Object.freeze(['goal', 'g']),
    assists: Object.freeze(['assist', 'a']),
    dribbles: Object.freeze(['dribble', 'take-ons', 'take ons']),
    duelsWon: Object.freeze(['duels won', 'duels']),
    bigChanceProxy: Object.freeze(['big chances', 'big chance'])
  });

  function normalizeHeaderLabel(header) {
    return String(header || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[_\/]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function aliasLookup() {
    const table = Object.create(null);
    USER_DATASET_COLUMNS.forEach(function (key) {
      table[normalizeHeaderLabel(key)] = key;
      const aliases = HEADER_ALIASES[key] || [];
      aliases.forEach(function (alias) {
        const norm = normalizeHeaderLabel(alias);
        if (!table[norm]) table[norm] = key;
      });
    });
    return table;
  }

  const HEADER_ALIAS_LOOKUP = aliasLookup();

  function mapUserColumns(headers) {
    const list = Array.isArray(headers) ? headers : [];
    const mapping = {};
    const claimed = Object.create(null);
    const unmatched = [];
    list.forEach(function (header) {
      const label = String(header == null ? '' : header).replace(/^\uFEFF/, '').trim();
      if (!label) return;
      const key = HEADER_ALIAS_LOOKUP[normalizeHeaderLabel(label)];
      if (!key || claimed[key]) {
        unmatched.push(label);
        return;
      }
      claimed[key] = true;
      mapping[label] = key;
    });
    return {
      mapping: mapping,
      unmatched: unmatched,
      unmatchedCount: unmatched.length
    };
  }

  function parseTypedNumber(raw, rowNum, column) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: true, value: null };
    // mm:ss or h:mm:ss → total minutes (90:00 → 90, 1:30:00 → 90)
    if (/^\d+:\d{2}(:\d{2})?$/.test(text)) {
      const parts = text.split(':').map(function (p) { return Number(p); });
      let minutes = 0;
      if (parts.length === 2) {
        minutes = parts[0] + parts[1] / 60;
      } else {
        minutes = parts[0] * 60 + parts[1] + parts[2] / 60;
      }
      if (!Number.isFinite(minutes)) {
        return {
          ok: false,
          error: 'שורה ' + rowNum + ', עמודה ' + column + ': ערך זמן לא תקין «' + text + '»'
        };
      }
      return { ok: true, value: minutes };
    }
    // Thousands separators: "2,340" → 2340; keep a single decimal point/comma
    let normalized = text.replace(/\s/g, '');
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else if (/^-?\d+,\d+$/.test(normalized) && !normalized.includes('.')) {
      // European decimal comma without thousands: "1,5" → 1.5
      normalized = normalized.replace(/,/g, '.');
    }
    const n = Number(normalized);
    if (!Number.isFinite(n)) {
      return {
        ok: false,
        error: 'שורה ' + rowNum + ', עמודה ' + column + ': ערך לא מספרי «' + text + '»'
      };
    }
    return { ok: true, value: n };
  }

  function isTextField(key) {
    return key === 'name' || key === 'team' || key === 'position';
  }

  function parseUserCsv(text, options) {
    const opts = options || {};
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (line) {
      return line.trim();
    });
    if (lines.length < 2) {
      return { ok: false, errors: ['CSV צריך שורת כותרת ולפחות שחקן אחד'], players: [], columnMapping: null };
    }
    const headerCells = splitCsvLine(lines[0]);
    const suggested = mapUserColumns(headerCells);
    const mapping = (opts.mapping && typeof opts.mapping === 'object')
      ? opts.mapping
      : suggested.mapping;
    const col = {};
    Object.keys(mapping).forEach(function (header) {
      const key = mapping[header];
      if (!key || USER_DATASET_COLUMNS.indexOf(key) < 0) return;
      const idx = headerCells.indexOf(header);
      if (idx < 0) return;
      if (col[key] == null) col[key] = idx;
    });
    // Also accept exact lowercased headers that the caller mapped under a different label
    headerCells.forEach(function (header, idx) {
      const key = mapping[header] || HEADER_ALIAS_LOOKUP[normalizeHeaderLabel(header)];
      if (key && col[key] == null && USER_DATASET_COLUMNS.indexOf(key) >= 0) col[key] = idx;
    });
    if (col.name == null) {
      return {
        ok: false,
        errors: ['חסרה עמודת name (או כינוי כמו Player / שם)'],
        players: [],
        columnMapping: suggested
      };
    }
    const players = [];
    const errors = [];
    lines.slice(1).forEach(function (line, i) {
      const rowNum = i + 2;
      const cells = splitCsvLine(line);
      const nameRaw = cells[col.name];
      if (!nameRaw) {
        errors.push('שורה ' + rowNum + ': חסר שם');
        return;
      }
      const row = { name: String(nameRaw).trim() };
      let failed = false;
      USER_DATASET_COLUMNS.forEach(function (key) {
        if (key === 'name') return;
        const idx = col[key];
        if (idx == null || idx < 0) return;
        const raw = cells[idx];
        if (raw === '' || raw == null) return;
        if (isTextField(key)) {
          row[key] = String(raw).trim();
          return;
        }
        const typed = parseTypedNumber(raw, rowNum, key);
        if (!typed.ok) {
          errors.push(typed.error);
          failed = true;
          return;
        }
        if (typed.value == null) return;
        row[key] = typed.value;
        if (key === 'minutes') row.totalMinutesProxy = typed.value;
      });
      if (failed) return;
      if (row.minutes != null && row.totalMinutesProxy == null) row.totalMinutesProxy = row.minutes;
      players.push(row);
    });
    if (!players.length) {
      return {
        ok: false,
        errors: errors.length ? errors : ['לא נמצאו שחקנים'],
        players: [],
        columnMapping: suggested
      };
    }
    return {
      ok: true,
      errors: errors,
      players: players,
      columnMapping: suggested
    };
  }

  function coercePlayerTypes(players, errors) {
    const out = [];
    (players || []).forEach(function (row, i) {
      if (!row || typeof row !== 'object') return;
      const next = Object.assign({}, row);
      const rowNum = i + 1;
      let failed = false;
      USER_DATASET_COLUMNS.forEach(function (key) {
        if (isTextField(key)) return;
        if (next[key] === undefined || next[key] === null || next[key] === '') return;
        if (typeof next[key] === 'number' && Number.isFinite(next[key])) return;
        const typed = parseTypedNumber(next[key], rowNum, key);
        if (!typed.ok) {
          errors.push(typed.error);
          failed = true;
          return;
        }
        if (typed.value == null) {
          delete next[key];
          return;
        }
        next[key] = typed.value;
        if (key === 'minutes') next.totalMinutesProxy = typed.value;
      });
      if (!failed) out.push(next);
    });
    return out;
  }

  function parseUserDataset(text, options) {
    const opts = options || {};
    const raw = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
    if (!raw) {
      return { ok: false, errors: ['הקובץ ריק'], players: [], provenance: null, columnMapping: null };
    }
    let dataset = null;
    let parseErrors = [];
    let columnMapping = null;
    if (raw.charAt(0) === '{' || raw.charAt(0) === '[') {
      try {
        dataset = JSON.parse(raw);
      } catch (err) {
        return { ok: false, errors: ['JSON לא תקין'], players: [], provenance: null };
      }
    } else {
      const csv = parseUserCsv(raw, { mapping: opts.mapping });
      if (!csv.ok) {
        return {
          ok: false,
          errors: csv.errors,
          players: [],
          provenance: null,
          columnMapping: csv.columnMapping || null
        };
      }
      dataset = { players: csv.players };
      parseErrors = csv.errors || [];
      columnMapping = csv.columnMapping || null;
    }
    // Unification point: both JSON and CSV branches have produced dataset.
    // Metadata keys OR content overlap fingerprint ⇒ reject; never USER_LICENSED_DATA.
    if (looksLikeOpenDataPayload(dataset)) {
      const overlap = openDataPairOverlap(eventPlayers(dataset));
      const detail = overlap > 0
        ? (' חפיפת תוכן: ' + overlap + ' זוגות name|team מול הקובץ שסופק בריפו (סף ' +
          openDataRejectThreshold(eventPlayers(dataset).length) + ').')
        : '';
      return {
        ok: false,
        errors: [
          'הקובץ מזוהה כ-StatsBomb Open Data' + detail +
          ' הרישיון אוסר ניצול מסחרי. חזרו למצב הדמו החינמי. ' +
          'שימו לב: שמות ששונו במכוון אינם נתפסים — זו אינה אחריות מוחלטת.'
        ],
        players: [],
        provenance: OPEN_DATA_PROVENANCE,
        detected: OPEN_DATA_PROVENANCE,
        openDataOverlap: overlap
      };
    }
    const synthetic = opts.synthetic === true ||
      (dataset && typeof dataset === 'object' && !Array.isArray(dataset) &&
        (dataset.provenance === SYNTHETIC_PROVENANCE ||
          String(dataset.licenceNote || dataset.license || '').indexOf('סינתט') >= 0));
    if (!synthetic && !opts.attested) {
      return {
        ok: false,
        errors: ['סמנו שאישרתם שיש לכם רישיון להריץ את הקובץ מקומית.'],
        players: [],
        provenance: null
      };
    }
    const typeErrors = [];
    const typedPlayers = coercePlayerTypes(
      eventPlayers(dataset).filter(function (row) { return row && row.name; }),
      typeErrors
    );
    parseErrors = parseErrors.concat(typeErrors);
    const players = ensureDistinctPlayerIds(typedPlayers);
    if (!players.length) {
      return {
        ok: false,
        errors: parseErrors.length ? parseErrors : ['אין שחקנים עם שדה name'],
        players: [],
        provenance: null,
        columnMapping: columnMapping
      };
    }
    const provenance = synthetic ? SYNTHETIC_PROVENANCE : USER_DATA_PROVENANCE;
    const coverage = buildCoverage(players);
    const warnings = [];
    if (players.length < 2) warnings.push('שחקן אחד — הדירוג יהיה טריוויאלי');
    if (coverage.banner) warnings.push(coverage.banner);
    if (columnMapping && columnMapping.unmatchedCount > 0) {
      warnings.push('עמודות לא ממופות: ' + columnMapping.unmatched.join(', '));
    }
    return {
      ok: true,
      errors: parseErrors,
      warnings: warnings,
      players: players,
      provenance: provenance,
      coverage: coverage,
      columnMapping: columnMapping,
      source: {
        dataset: opts.fileName || (synthetic ? 'data/user-dataset.example.json' : 'user-upload'),
        competition: (dataset && !Array.isArray(dataset) && (dataset.competition || dataset.comp)) ||
          (synthetic ? 'דוגמה סינתטית' : 'USER_DATASET'),
        license: synthetic
          ? 'Synthetic teaching file shipped with ScoutAI — not match data'
          : 'User attested they licensed this file for local processing; ScoutAI does not grant that licence'
      }
    };
  }

  return {
    flagImpossibleMinutes: flagImpossibleMinutes,
    minutesImpossibleForCompetition: minutesImpossibleForCompetition,
    WORLD_CUP_MAX_MINUTES: WORLD_CUP_MAX_MINUTES,
    SEASON_MISLABELED: SEASON_MISLABELED,
    DEFAULT_METRIC: DEFAULT_METRIC,
    positionGroup: positionGroup,
    DEFAULT_POSITION_ALIASES: DEFAULT_POSITION_ALIASES,
    MIN_POSITION_PEERS: MIN_POSITION_PEERS,
    mergePositionAliases: mergePositionAliases,
    countOtRows: countOtRows,
    buildNormalizationNote: buildNormalizationNote,
    normalizeByPosition: normalizeByPosition,
    componentsFromEvents: componentsFromEvents,
    compositeScore: compositeScore,
    applyMetric: applyMetric,
    createStore: createStore,
    loadLabSources: loadLabSources,
    lessonContributions: lessonContributions,
    LAB_PATHS: LAB_PATHS,
    serializeMetricHash: serializeMetricHash,
    parseMetricHash: parseMetricHash,
    formatFormula: formatFormula,
    buildLesson: buildLesson,
    fragilityReport: fragilityReport,
    rankInterval: rankInterval,
    samplePoisson: samplePoisson,
    bootstrapSpearmanCi: bootstrapSpearmanCi,
    permutationPValue: permutationPValue,
    weightTripleKey: weightTripleKey,
    normalizeMetricSpec: normalizeMetricSpec,
    playerKey: playerKey,
    EVENT_GLOSSARY: EVENT_GLOSSARY,
    RADAR_AXES: RADAR_AXES,
    COMPONENT_RECIPE: COMPONENT_RECIPE,
    DEFENDER_EXERCISE: DEFENDER_EXERCISE,
    LEARNING_STORAGE_KEY: LEARNING_STORAGE_KEY,
    emptyLearningState: emptyLearningState,
    serializeLearningState: serializeLearningState,
    parseLearningState: parseLearningState,
    loadLearningState: loadLearningState,
    saveLearningState: saveLearningState,
    normalizeLearningClaim: normalizeLearningClaim,
    expectedTradeoff: expectedTradeoff,
    evaluateExercise: evaluateExercise,
    createRankCache: createRankCache,
    metricRankKey: metricRankKey,
    rankOnce: rankOnce,
    resetRankCalls: resetRankCalls,
    getRankCalls: getRankCalls,
    get RANK_CALLS() { return getRankCalls(); },
    buildCompareRadar: buildCompareRadar,
    radarValues: radarValues,
    methodologyParagraph: methodologyParagraph,
    exportMetricBundle: exportMetricBundle,
    buildCompletionRecord: buildCompletionRecord,
    EVENT_COLUMNS: EVENT_COLUMNS,
    OUTCOMES: OUTCOMES,
    LEAKY_RHO: LEAKY_RHO,
    WC2018_GROUPS: WC2018_GROUPS,
    worldCupGroup: worldCupGroup,
    assignFold: assignFold,
    describeSplitLabel: describeSplitLabel,
    splitIsWorldCupGroups: splitIsWorldCupGroups,
    EXERCISE_SMALL_SAMPLE_MAX: EXERCISE_SMALL_SAMPLE_MAX,
    spearman: spearman,
    pearson: pearson,
    outcomeValue: outcomeValue,
    scoringInputFields: scoringInputFields,
    auditOutcome: auditOutcome,
    buildEventExplorer: buildEventExplorer,
    glossaryForPlayer: glossaryForPlayer,
    validateMetric: validateMetric,
    evaluateCurriculum: evaluateCurriculum,
    selectedWeightSwing: selectedWeightSwing,
    bestHelpfulBump: bestHelpfulBump,
    nearNumber: nearNumber,
    CURRICULUM_LESSONS: CURRICULUM_LESSONS,
    COURSE_QUIZ: COURSE_QUIZ,
    quizField: quizField,
    quizMarkedCorrect: quizMarkedCorrect,
    matchesMarkedQuiz: matchesMarkedQuiz,
    parseUserDataset: parseUserDataset,
    mapUserColumns: mapUserColumns,
    parseTypedNumber: parseTypedNumber,
    ensureDistinctPlayerIds: ensureDistinctPlayerIds,
    HEADER_ALIASES: HEADER_ALIASES,
    buildCoverage: buildCoverage,
    takeCount: takeCount,
    COMPONENT_INPUT_FIELDS: COMPONENT_INPUT_FIELDS,
    looksLikeOpenDataPayload: looksLikeOpenDataPayload,
    openDataPairOverlap: openDataPairOverlap,
    openDataRejectThreshold: openDataRejectThreshold,
    openDataContentFingerprintMatch: openDataContentFingerprintMatch,
    USER_DATASET_COLUMNS: USER_DATASET_COLUMNS,
    OPEN_DATA_PROVENANCE: OPEN_DATA_PROVENANCE,
    USER_DATA_PROVENANCE: USER_DATA_PROVENANCE,
    SYNTHETIC_PROVENANCE: SYNTHETIC_PROVENANCE,
    OPEN_DATA_SOURCE: OPEN_DATA_SOURCE,
    WC2018_CAPS: WC2018_CAPS,
    deriveFileCaps: deriveFileCaps,
    measureCapSaturation: measureCapSaturation,
    resolveCapsSource: resolveCapsSource,
    CAP_RECIPE_KEYS: CAP_RECIPE_KEYS
  };
}));
