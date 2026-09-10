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
    curriculumIndex: 0
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

  function round3(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function playerKey(row) {
    if (row && row.id != null && String(row.id)) return String(row.id);
    return String(row && row.name || '') + '|' + String(row && row.team || '');
  }

  function positionGroup(position) {
    const text = String(position || '');
    if (/goalkeeper/i.test(text)) return 'GK';
    if (/midfield/i.test(text)) return 'MF';
    if (/back|defen/i.test(text)) return 'DF';
    if (/forward|wing|striker/i.test(text)) return 'FW';
    return 'OT';
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

  function rawPer90(player, totalKey, per90Key) {
    const minutes = player.totalMinutesProxy || player.minutes || 0;
    if (player.per90 && Number.isFinite(Number(player.per90[per90Key]))) {
      return Number(player.per90[per90Key]);
    }
    return per90(player[totalKey], minutes);
  }

  // The ten per-90 rates that reach the score, keyed by their count field.
  // This is the ONLY place the file is read for the score; every later stage
  // (shrinkage, caps, scaling, round1, percentile) works on these numbers.
  const RATE_FIELDS = Object.freeze([
    ['pressures', 'pressuresPer90'],
    ['tackles', 'tacklesPer90'],
    ['interceptions', 'interceptionsPer90'],
    ['defensiveActions', 'defensiveActionsPer90'],
    ['progressiveActions', 'progressiveActionsPer90'],
    ['keyPasses', 'keyPassesPer90'],
    ['passesCompleted', 'passesCompletedPer90'],
    ['shotXgSum', 'shotXgSumPer90'],
    ['boxTouches', 'boxTouchesPer90'],
    ['shotsOnTarget', 'shotsOnTargetPer90']
  ]);
  const RATE_KEYS = Object.freeze(RATE_FIELDS.map(function (pair) { return pair[0]; }));

  function ratesFromEvents(player) {
    const rates = {};
    RATE_FIELDS.forEach(function (pair) {
      rates[pair[0]] = rawPer90(player, pair[0], pair[1]);
    });
    return rates;
  }

  // caps -> 0-100 scale -> recipe weights -> round1, from per-90 rates.
  function componentsFromRates(rates) {
    const r = rates || {};
    const press = Number(r.pressures) || 0;
    const tackles = Number(r.tackles) || 0;
    const intercepts = Number(r.interceptions) || 0;
    const defense = Number(r.defensiveActions) || 0;
    const grit = round1(scaleCap(press, 18) * 0.45 + scaleCap(tackles + intercepts, 6) * 0.3 + scaleCap(defense, 14) * 0.25);

    const prog = Number(r.progressiveActions) || 0;
    const keyPasses = Number(r.keyPasses) || 0;
    const passes = Number(r.passesCompleted) || 0;
    const involvement = round1(scaleCap(prog, 22) * 0.5 + scaleCap(keyPasses, 4) * 0.3 + scaleCap(passes, 80) * 0.2);

    const xg = Number(r.shotXgSum) || 0;
    const box = Number(r.boxTouches) || 0;
    const onTarget = Number(r.shotsOnTarget) || 0;
    const clutch = round1(scaleCap(xg, 0.6) * 0.4 + scaleCap(box, 8) * 0.35 + scaleCap(onTarget, 2) * 0.25);

    return {
      grit: grit,
      involvement: involvement,
      clutch: clutch,
      raw: {
        pressures90: round2(press),
        tacklesInt90: round2(tackles + intercepts),
        defensive90: round2(defense),
        progressive90: round2(prog),
        keyPasses90: round2(keyPasses),
        passes90: round2(passes),
        xg90: round2(xg),
        boxTouches90: round2(box),
        shotsOnTarget90: round2(onTarget)
      }
    };
  }

  function componentsFromEvents(player) {
    return componentsFromRates(ratesFromEvents(player));
  }

  // Percentile inside a position group, average-rank convention for ties.
  //
  // A player's percentile is the mean ascending rank of his value among the
  // peers (himself included), divided by n. An untied value therefore sits
  // exactly where "count of peers <= value" put it before; a block of t tied
  // values shares the CENTRE of the block, (below + (t+1)/2) / n, instead of
  // its top. This is the same mid-rank convention rankValues() already uses
  // for Spearman. It matters because 25 of the 27 eligible keepers have
  // exactly 0 Clutch events: with the old rule the tie-block at the bottom of
  // the GK group was awarded 25/27 = 92.6 - for having nothing - and rode
  // that into the top of the table; with the average rank the same block
  // shares 13/27 = 48.1. Identical evidence inside a group gets one shared
  // value; minutes never separate two players with the same numbers.
  // percentileRaw is that number BEFORE round1. The ledger needs it: under
  // normalisation the pillar on screen is round1(percentileRaw(...)), so this
  // is the only way to keep the round1 residue (<= 0.05) separable from the
  // shrink + percentile transform, which is not a rounding at all.
  function percentileRaw(value, peers) {
    if (!peers.length) return 50;
    let below = 0;
    let tied = 0;
    for (let i = 0; i < peers.length; i += 1) {
      if (peers[i] < value) below += 1;
      else if (peers[i] === value) tied += 1;
    }
    return (below + (tied + 1) / 2) / peers.length * 100;
  }

  function percentile(value, peers) {
    return round1(percentileRaw(value, peers));
  }

  function readPath(row, path) {
    const parts = String(path).split('.');
    let cursor = row;
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  // Shallow-clones down the path so the caller's rows are never mutated.
  function writePath(row, path, value) {
    const parts = String(path).split('.');
    const head = parts[0];
    const copy = Object.assign({}, row);
    if (parts.length === 1) {
      copy[head] = value;
      return copy;
    }
    copy[head] = writePath(row && row[head] ? row[head] : {}, parts.slice(1).join('.'), value);
    return copy;
  }

  const SHRINK_DEFAULT_K = 450;
  const COMPONENT_KEYS = Object.freeze(['grit', 'involvement', 'clutch']);

  // Empirical-Bayes shrinkage toward the position mean.
  //
  //   adj = (m * v + k * mu_pos) / (m + k)
  //
  // m is the player's minutes, v his per-90 value, mu_pos the MINUTES-WEIGHTED
  // mean of his position group, and k a prior strength expressed in minutes:
  // at m = k a player is exactly half his own number and half his position's.
  // A 90-minute cameo therefore keeps 90/(90+450) = 1/6 of its own extreme
  // value and gives up 5/6 of the distance to the group; a 2700-minute regular
  // keeps 2700/3150 = 6/7 and gives up only 450/3150 = 1/7.
  //
  // key accepts a dotted path, so it shrinks a bare per-90 field
  // ("pressuresPer90") or a nested one ("components.grit") alike.
  function shrinkByPosition(rows, options) {
    const opts = options || {};
    const key = opts.key;
    if (!key) throw new TypeError('shrinkByPosition needs a key to shrink');
    const minutesKey = opts.minutesKey || 'minutes';
    const positionKey = opts.positionKey || 'positionGroup';
    const k = opts.k == null ? SHRINK_DEFAULT_K : Number(opts.k);
    if (!Number.isFinite(k) || k < 0) {
      throw new RangeError('shrinkByPosition needs a finite k >= 0, got ' + String(opts.k));
    }
    const list = rows || [];

    const buckets = {};
    list.forEach(function (row) {
      const group = String(readPath(row, positionKey) || 'OT');
      const minutes = Math.max(0, Number(readPath(row, minutesKey)) || 0);
      const value = Number(readPath(row, key)) || 0;
      if (!buckets[group]) buckets[group] = { weighted: 0, minutes: 0, plain: 0, n: 0 };
      buckets[group].weighted += minutes * value;
      buckets[group].minutes += minutes;
      buckets[group].plain += value;
      buckets[group].n += 1;
    });
    const means = {};
    Object.keys(buckets).forEach(function (group) {
      const bucket = buckets[group];
      // A group with no minutes at all has no minutes-weighted mean; fall back
      // to the plain mean instead of producing NaN.
      means[group] = bucket.minutes > 0
        ? bucket.weighted / bucket.minutes
        : (bucket.n ? bucket.plain / bucket.n : 0);
    });

    return list.map(function (row) {
      const group = String(readPath(row, positionKey) || 'OT');
      const minutes = Math.max(0, Number(readPath(row, minutesKey)) || 0);
      const value = Number(readPath(row, key)) || 0;
      const mu = means[group] == null ? value : means[group];
      const denom = minutes + k;
      const adjusted = denom > 0 ? (minutes * value + k * mu) / denom : mu;
      const next = writePath(row, key, adjusted);
      next.shrinkage = Object.assign({}, row.shrinkage);
      next.shrinkage[key] = {
        key: key,
        group: group,
        minutes: minutes,
        k: k,
        raw: value,
        positionMean: mu,
        adjusted: adjusted,
        ownWeight: denom > 0 ? minutes / denom : 0,
        priorWeight: denom > 0 ? k / denom : 1
      };
      return next;
    });
  }

  // Per-90 rates of a prepared player (per90File preferred, else count*90/min),
  // the same numbers componentsFromEvents read when the player was prepared.
  function preparedRates(row) {
    if (row && row.per90Rates) return row.per90Rates;
    return ratesFromEvents({
      per90: row && row.per90File,
      totalMinutesProxy: row && row.minutes,
      pressures: row && row.counts && row.counts.pressures,
      tackles: row && row.counts && row.counts.tackles,
      interceptions: row && row.counts && row.counts.interceptions,
      defensiveActions: row && row.counts && row.counts.defensiveActions,
      progressiveActions: row && row.counts && row.counts.progressiveActions,
      keyPasses: row && row.counts && row.counts.keyPasses,
      passesCompleted: row && row.counts && row.counts.passesCompleted,
      shotXgSum: row && row.counts && row.counts.shotXgSum,
      boxTouches: row && row.counts && row.counts.boxTouches,
      shotsOnTarget: row && row.counts && row.counts.shotsOnTarget
    });
  }

  // Position normalisation, in the order the backlog (S2) specifies:
  //
  //   per-90 rate  ->  shrinkByPosition (per rate, k minutes)
  //                ->  caps, 0-100 scale, recipe weights, round1
  //                ->  percentile inside the position group
  //
  // The shrinkage is applied to each of the ten PER-90 RATES, before any cap.
  // Applying it after the caps (as an earlier revision did) turned the
  // estimator into a minutes ranking: for a capped or zero-evidence value
  // adj = k*mu/(m+k) is strictly monotone in minutes, so 25 keepers with the
  // same 0 Clutch events came out in 21 distinct percentiles ordered by how
  // little they had played. Shrinking the rate first means two players who
  // both clear a cap after shrinkage are equal at 100, and players with
  // identical evidence stay identical through round1 - tiny k*mu/(m+k)
  // differences among zero-evidence players (of the order 0.0004 xG/90) are
  // absorbed by round1 on the 0-100 component and percentiled as one tie.
  function normalizeByPosition(rows, options) {
    const opts = options || {};
    const k = opts.k == null ? SHRINK_DEFAULT_K : opts.k;
    const withRates = (rows || []).map(function (row) {
      return Object.assign({}, row, { per90Rates: preparedRates(row) });
    });
    const shrunk = RATE_KEYS.reduce(function (acc, rateKey) {
      return shrinkByPosition(acc, {
        key: 'per90Rates.' + rateKey,
        minutesKey: 'minutes',
        k: k
      });
    }, withRates).map(function (row, i) {
      // shrinkByPosition maps the list in place, so index i is still the same
      // player. Joining on row.id instead would be O(n^2) and would pick the
      // wrong original whenever two rows share a name+team key.
      const original = withRates[i] || row;
      const components = componentsFromRates(row.per90Rates);
      return Object.assign({}, row, {
        shrunkRates: row.per90Rates,
        per90Rates: original.per90Rates,
        components: Object.assign(components, {
          raw: original.components ? original.components.raw : components.raw
        })
      });
    });
    const groups = {};
    shrunk.forEach(function (row) {
      const key = row.positionGroup || 'OT';
      if (!groups[key]) groups[key] = { grit: [], involvement: [], clutch: [] };
      groups[key].grit.push(row.components.grit);
      groups[key].involvement.push(row.components.involvement);
      groups[key].clutch.push(row.components.clutch);
    });
    return shrunk.map(function (row) {
      const peers = groups[row.positionGroup || 'OT'];
      return Object.assign({}, row, {
        components: {
          grit: percentile(row.components.grit, peers.grit),
          involvement: percentile(row.components.involvement, peers.involvement),
          clutch: percentile(row.components.clutch, peers.clutch),
          raw: row.components.raw,
          // the 0-100 components computed from the SHRUNK rates, i.e. the
          // values the percentile above ranked
          shrunk: {
            grit: row.components.grit,
            involvement: row.components.involvement,
            clutch: row.components.clutch
          },
          normalized: true,
          shrinkK: k
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
      curriculumIndex: clamp(src.curriculumIndex, 0, CURRICULUM_LENGTH - 1)
    };
  }

  function compositeScore(components, spec) {
    const weights = normalizeMetricSpec(spec);
    const total = weights.grit + weights.involvement + weights.clutch;
    if (!total) return 0;
    return round2(
      (components.grit * weights.grit +
        components.involvement * weights.involvement +
        components.clutch * weights.clutch) / total
    );
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
    const n = Number(row && row[key]);
    return Number.isFinite(n) ? n : 0;
  }

  function countsFromRow(row) {
    const counts = {};
    COUNT_FIELDS.forEach(function (key) { counts[key] = takeCount(row, key); });
    return counts;
  }

  // Which count fields the file row really carries (a finite number under
  // that key). countsFromRow turns a missing key into 0 so the score can run;
  // the ledger must not then claim the 0 was read from the file.
  function countsPresentInRow(row) {
    const present = {};
    COUNT_FIELDS.forEach(function (key) {
      present[key] = !!row && typeof row === 'object' &&
        Object.prototype.hasOwnProperty.call(row, key) &&
        Number.isFinite(Number(row[key]));
    });
    return present;
  }

  function preparePlayer(row, options) {
    const opts = options || {};
    const provenance = opts.provenance || row.provenance || OPEN_DATA_PROVENANCE;
    const minutes = row.totalMinutesProxy || row.minutes || 0;
    // the file is read for the score exactly once, here
    const rates = ratesFromEvents(row);
    const defaultComp = provenance === OPEN_DATA_PROVENANCE ? 'WorldCup2018' : 'USER_DATASET';
    return {
      id: playerKey(row),
      name: row.name,
      team: row.team,
      comp: row.comp || row.competition || defaultComp,
      category: row.category,
      position: row.position || '',
      positionGroup: positionGroup(row.position),
      minutes: minutes,
      matchesPlayed: row.matchesPlayed,
      group: WC2018_TEAM_GROUP[row.team] || null,
      counts: countsFromRow(row),
      countsInFile: countsPresentInRow(row),
      minutesField: row.totalMinutesProxy != null ? 'totalMinutesProxy' : (row.minutes != null ? 'minutes' : null),
      per90File: row.per90 || null,
      per90Rates: rates,
      components: componentsFromRates(rates),
      provenance: provenance
    };
  }

  function scorePrepared(prepared, spec) {
    const metric = normalizeMetricSpec(spec);
    const eligible = prepared.filter(function (row) {
      return row && row.name && row.minutes >= metric.minMinutes;
    });
    const adjusted = metric.normalizePosition ? normalizeByPosition(eligible) : eligible;
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
    const total = metric.grit + metric.involvement + metric.clutch || 1;
    return [
      { key: 'grit', label: 'Grit', value: row.components.grit, weight: metric.grit, share: round2(row.components.grit * metric.grit / total) },
      { key: 'involvement', label: 'Involvement', value: row.components.involvement, weight: metric.involvement, share: round2(row.components.involvement * metric.involvement / total) },
      { key: 'clutch', label: 'Clutch', value: row.components.clutch, weight: metric.clutch, share: round2(row.components.clutch * metric.clutch / total) }
    ];
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

  function fragilityFromPrepared(prepared, spec, delta, ranked) {
    const step = delta == null ? 10 : delta;
    const baseRows = ranked || scorePrepared(prepared, spec);
    const byId = {};
    baseRows.forEach(function (row) { byId[row.id] = row; });
    const labels = { grit: 'Grit', involvement: 'Involvement', clutch: 'Clutch' };
    return ['grit', 'involvement', 'clutch'].map(function (key) {
      const ranked = scorePrepared(prepared, bumpSpec(spec, key, step));
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
      return { key: key, label: labels[key] + ' +' + step, swings: swings };
    });
  }

  function looksLikeOpenDataPayload(dataset) {
    if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) return false;
    const source = String(dataset.source || dataset.license || '').toLowerCase();
    if (source.indexOf('statsbomb') >= 0) return true;
    if (Number(dataset.competitionId) === 43 && Number(dataset.seasonId) === 3) return true;
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
    const players = flagImpossibleMinutes(eventPlayers(rawPlayers).map(function (row) {
      return preparePlayer(row, { provenance: provenance });
    }));

    // --- bootstrap interval, kept OUT of derive() -------------------------
    //
    // derive() runs on every 'input' event of four sliders. A 1000-replicate
    // bootstrap on both folds costs ~85 ms per call on the shipped file (the
    // rest of derive is ~4 ms), so it must never sit on that path. The fold
    // pairs are a pure function of the ranking spec (weights, minMinutes,
    // normalisation) and of outcome/split - and they DO change whenever a
    // weight moves, because every score moves - so memoising cannot hide the
    // cost from a slider drag. Instead:
    //   * derive() only LOOKS UP an interval already computed for the exact
    //     same key; a miss leaves ci null and the label says "computing".
    //   * validationInterval(spec) computes (and memoises) it; index.html
    //     calls it debounced after the last input and on 'change'.
    // bootstrapRuns counts real bootstrap executions so a test can pin the
    // invariant "derive never runs the bootstrap".
    const intervalCache = {};
    const intervalOrder = [];
    const INTERVAL_CACHE_SIZE = 16;
    const bootstrapOptions = {
      iterations: opts.bootstrap && opts.bootstrap.iterations != null
        ? opts.bootstrap.iterations : BOOTSTRAP_DEFAULTS.iterations,
      seed: opts.bootstrap && opts.bootstrap.seed != null
        ? opts.bootstrap.seed : BOOTSTRAP_DEFAULTS.seed
    };
    function intervalKey(metric, outcomeId, splitId, fold) {
      return [
        metric.grit, metric.involvement, metric.clutch, metric.minMinutes,
        metric.normalizePosition ? 1 : 0, outcomeId, splitId, fold,
        bootstrapOptions.iterations, String(bootstrapOptions.seed)
      ].join('|');
    }
    function lookupInterval(pairs, options, context) {
      const key = intervalKey(context.metric, context.outcomeId, context.splitId, context.fold);
      return Object.prototype.hasOwnProperty.call(intervalCache, key) ? intervalCache[key] : null;
    }
    function computeInterval(pairs, options, context) {
      const key = intervalKey(context.metric, context.outcomeId, context.splitId, context.fold);
      if (Object.prototype.hasOwnProperty.call(intervalCache, key)) return intervalCache[key];
      const ci = bootstrapSpearman(pairs, options);
      api.bootstrapRuns += 1;
      intervalCache[key] = ci;
      intervalOrder.push(key);
      while (intervalOrder.length > INTERVAL_CACHE_SIZE) delete intervalCache[intervalOrder.shift()];
      return ci;
    }
    function validationInterval(spec) {
      const metric = normalizeMetricSpec(spec);
      return validateMetric(players, metric, {
        outcomeId: metric.outcomeId,
        splitId: metric.splitId,
        iterations: bootstrapOptions.iterations,
        seed: bootstrapOptions.seed,
        bootstrap: computeInterval
      });
    }

    function derive(spec, baselineSpec) {
      const metric = normalizeMetricSpec(spec);
      // one ranking of the file per derive(); fragility, validation and the
      // ledger all reuse it instead of ranking again
      const ranked = scorePrepared(players, metric);
      primeRankedRows(api, metric, ranked);
      let rows = ranked;
      if (baselineSpec) rows = attachDeltas(rows, scorePrepared(players, baselineSpec));
      const selected = rows.find(function (row) { return row.id === metric.selectedId; }) || rows[0] || null;
      if (selected && !metric.selectedId) metric.selectedId = selected.id;
      const compared = findPrepared(rows, players, metric.compareId);
      const fragility = fragilityFromPrepared(players, metric, 10, ranked);
      const layer = { provenance: provenance, source: source };
      const explorer = buildEventExplorer(selected, layer);
      const validation = validateMetric(players, metric, {
        outcomeId: metric.outcomeId,
        splitId: metric.splitId,
        iterations: bootstrapOptions.iterations,
        seed: bootstrapOptions.seed,
        bootstrap: lookupInterval,
        ranked: ranked
      });
      const exercise = evaluateExercise(players, metric);
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
        radar: buildCompareRadar(selected, compared),
        explorer: explorer,
        validation: validation,
        glossary: glossaryForPlayer(selected),
        curriculum: evaluateCurriculum({
          spec: metric,
          selected: selected,
          explorer: explorer,
          validation: validation,
          exercise: exercise,
          answers: {}
        }),
        exportBundle: exportMetricBundle(metric, selected, {
          compared: compared,
          provenance: provenance,
          source: source
        }),
        provenance: provenance,
        source: source,
        commercialAllowed: provenance === USER_DATA_PROVENANCE,
        ledger: selected ? explainScore(selected.id, metric, api) : null
      };
    }
    const api = {
      players: players,
      derive: derive,
      validationInterval: validationInterval,
      bootstrapRuns: 0,
      bootstrap: bootstrapOptions,
      provenance: provenance,
      source: source
    };
    return api;
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
      curriculumIndex: params.cur
    });
  }

  function formatFormula(spec) {
    const metric = normalizeMetricSpec(spec);
    const total = metric.grit + metric.involvement + metric.clutch;
    return 'ציון = (' + metric.grit + '×Grit + ' + metric.involvement + '×Involvement + ' +
      metric.clutch + '×Clutch) / ' + (total || 1);
  }

  const COMPONENT_RECIPE = Object.freeze({
    grit: Object.freeze([
      { key: 'pressures90', label: 'לחיצות /90', cap: 18, weight: 0.45 },
      { key: 'tacklesInt90', label: 'תיקולים+חטיפות /90', cap: 6, weight: 0.3 },
      { key: 'defensive90', label: 'פעולות הגנה /90', cap: 14, weight: 0.25 }
    ]),
    involvement: Object.freeze([
      { key: 'progressive90', label: 'התקדמות /90', cap: 22, weight: 0.5 },
      { key: 'keyPasses90', label: 'מסירות מפתח /90', cap: 4, weight: 0.3 },
      { key: 'passes90', label: 'מסירות /90', cap: 80, weight: 0.2 }
    ]),
    clutch: Object.freeze([
      { key: 'xg90', label: 'xG /90', cap: 0.6, weight: 0.4 },
      { key: 'boxTouches90', label: 'נגיעות ברחבה /90', cap: 8, weight: 0.35 },
      { key: 'shotsOnTarget90', label: 'בעיטות למסגרת /90', cap: 2, weight: 0.25 }
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

  function evaluateExercise(prepared, spec) {
    const players = asPrepared(prepared);
    const metric = normalizeMetricSpec(spec);
    const current = scorePrepared(players, metric);
    const baseline = scorePrepared(players, DEFAULT_METRIC);
    const windowSize = Math.min(12, current.length);
    const nowTop = current.slice(0, windowSize);
    const baseTop = baseline.slice(0, windowSize);
    const dfNow = countGroup(nowTop, 'DF');
    const dfBase = countGroup(baseTop, 'DF');
    const fwNow = countGroup(nowTop, 'FW');
    const medianDf = medianRank(current, 'DF');
    const medianFw = medianRank(current, 'FW');
    const checks = [
      {
        id: 'minutes',
        label: 'סף דקות לפחות 270 — כדי לא לדרג מחליף של משחק אחד',
        pass: metric.minMinutes >= 270,
        detail: 'סף נוכחי: ' + metric.minMinutes + ' דקות.'
      },
      {
        id: 'grit-over-clutch',
        label: 'Grit גבוה מ-Clutch — בלם לא נמדד בעיקר ב-xG',
        pass: metric.grit > metric.clutch,
        detail: 'Grit ' + metric.grit + ' מול Clutch ' + metric.clutch + '.'
      },
      {
        id: 'defenders-surface',
        label: 'יותר בלמים ב-12 הראשונים מאשר במדד הבסיס 40/30/30',
        pass: dfNow > dfBase,
        detail: 'עכשיו ' + dfNow + ' בלמים בחלון, בבסיס היו ' + dfBase + '.'
      },
      {
        id: 'fair-comparison',
        label: 'נרמול עמדה או משקל מאמץ דומיננטי (Grit ≥ 60)',
        pass: metric.normalizePosition || metric.grit >= 60,
        detail: metric.normalizePosition
          ? 'נרמול עמדה דולק: בלם מושווה לבלמים, לא לחלוץ.'
          : 'בלי נרמול צריך Grit גבוה, אחרת xG של חלוצים שולט.'
      },
      {
        id: 'not-just-attackers',
        label: 'בחלון העליון יש לפחות אותו מספר בלמים כמו חלוצים',
        pass: windowSize === 0 || dfNow >= fwNow,
        detail: 'בלמים ' + dfNow + ' · חלוצים ' + fwNow +
          (medianDf != null && medianFw != null ? ' · חציון דירוג DF #' + medianDf + ' / FW #' + medianFw : '') + '.'
      }
    ];
    const passed = checks.every(function (item) { return item.pass; });
    return {
      id: DEFENDER_EXERCISE.id,
      title: DEFENDER_EXERCISE.title,
      prompt: DEFENDER_EXERCISE.prompt,
      hint: DEFENDER_EXERCISE.hint,
      checks: checks,
      passed: passed,
      windowSize: windowSize,
      dfNow: dfNow,
      dfBase: dfBase,
      fwNow: fwNow,
      medianDf: medianDf,
      medianFw: medianFw,
      summary: passed
        ? 'עברתם את הבדיקה העצמית. זה עדיין מדד ידני — לא הוכחה שמצאתם בלם טוב.'
        : 'עוד לא. המדד עדיין מתנהג כמו מדד חלוצים, או שהמדגם קטן מדי.'
    };
  }

  function radarValues(row) {
    const raw = row && row.components && row.components.raw || {};
    return RADAR_AXES.map(function (axis) {
      const value = Number(raw[axis.key]);
      return {
        key: axis.key,
        label: axis.label,
        feeds: axis.feeds,
        cap: axis.cap,
        raw: Number.isFinite(value) ? value : 0,
        scaled: round1(scaleCap(Number.isFinite(value) ? value : 0, axis.cap))
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
    const aValues = radarValues(rowA);
    const bValues = rowB ? radarValues(rowB) : null;
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
      (metric.normalizePosition
        ? '; כל קצב ל-90 כווץ לפי דקות אל ממוצע העמדה (k=' + SHRINK_DEFAULT_K + ' דקות) לפני התקרות, והרכיבים הם אחוזון בתוך קבוצת עמדה (דירוג ממוצע לתיקו).'
        : '; בלי נרמול עמדה.') +
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
      citationEn: provenance === USER_DATA_PROVENANCE
        ? 'ScoutAI educational metric lab on USER_LICENSED_DATA processed locally. ScoutAI does not license the uploaded file. Weights are manual and uncalibrated; not a scouting recommendation.'
        : provenance === SYNTHETIC_PROVENANCE
          ? 'ScoutAI educational metric lab on a synthetic teaching file. Not match data and not StatsBomb Open Data. Weights are manual and uncalibrated.'
          : 'ScoutAI educational metric lab on StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). Non-commercial research/education only. Weights are manual and uncalibrated; not a scouting recommendation.',
      generatedLocally: true
    };
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
    const total = metric.grit + metric.involvement + metric.clutch || 1;
    const gritPart = round2(row.components.grit * metric.grit / total);
    const invPart = round2(row.components.involvement * metric.involvement / total);
    const clutchPart = round2(row.components.clutch * metric.clutch / total);
    const scaleNote = row.components.normalized
      ? 'אחרי נרמול עמדה כל רכיב הוא אחוזון 0–100 בתוך קבוצת העמדה ' + row.positionGroup + '.'
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
        body: 'Grit נבנה מלחיצות/תיקולים/הגנה → ' + row.components.grit +
          '. Involvement מפעולות התקדמות ומסירות מפתח → ' + row.components.involvement +
          '. Clutch מ-xG, נגיעות ברחבה ובעיטות למסגרת → ' + row.components.clutch +
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

  const EVENT_COLUMNS = Object.freeze([
    { key: 'pressures', label: 'לחיצות', type: 'Pressure', feeds: 'Grit', usedInScore: true, recipeKey: 'pressures90', cap: 18, weight: 0.45, per90Field: 'pressuresPer90' },
    { key: 'tackles', label: 'תיקולים', type: 'Duel / Tackle', feeds: 'Grit', usedInScore: true, recipeKey: 'tacklesInt90', cap: 6, weight: 0.3, per90Field: 'tacklesPer90', pairWith: 'interceptions' },
    { key: 'interceptions', label: 'חטיפות', type: 'Interception', feeds: 'Grit', usedInScore: true, recipeKey: 'tacklesInt90', cap: 6, weight: 0.3, per90Field: 'interceptionsPer90', pairWith: 'tackles' },
    { key: 'defensiveActions', label: 'פעולות הגנה', type: 'Ball Recovery + Block', feeds: 'Grit', usedInScore: true, recipeKey: 'defensive90', cap: 14, weight: 0.25, per90Field: 'defensiveActionsPer90' },
    { key: 'progressiveActions', label: 'התקדמות', type: 'Pass / Carry', feeds: 'Involvement', usedInScore: true, recipeKey: 'progressive90', cap: 22, weight: 0.5, per90Field: 'progressiveActionsPer90' },
    { key: 'keyPasses', label: 'מסירות מפתח', type: 'Pass (shot/goal assist)', feeds: 'Involvement', usedInScore: true, recipeKey: 'keyPasses90', cap: 4, weight: 0.3, per90Field: 'keyPassesPer90' },
    { key: 'passesCompleted', label: 'מסירות שהושלמו', type: 'Pass', feeds: 'Involvement', usedInScore: true, recipeKey: 'passes90', cap: 80, weight: 0.2, per90Field: 'passesCompletedPer90' },
    { key: 'shotXgSum', label: 'סכום xG', type: 'Shot + statsbomb_xg', feeds: 'Clutch', usedInScore: true, recipeKey: 'xg90', cap: 0.6, weight: 0.4, per90Field: 'shotXgSumPer90' },
    { key: 'boxTouches', label: 'נגיעות ברחבה', type: 'location (penalty box)', feeds: 'Clutch', usedInScore: true, recipeKey: 'boxTouches90', cap: 8, weight: 0.35, per90Field: 'boxTouchesPer90' },
    { key: 'shotsOnTarget', label: 'בעיטות למסגרת', type: 'Shot (Saved/Goal)', feeds: 'Clutch', usedInScore: true, recipeKey: 'shotsOnTarget90', cap: 2, weight: 0.25, per90Field: 'shotsOnTargetPer90' },
    { key: 'shots', label: 'בעיטות', type: 'Shot', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'shotsPer90' },
    { key: 'goals', label: 'שערים', type: 'Goal', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'goalsPer90' },
    { key: 'assists', label: 'בישולים', type: 'Assist', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'assistsPer90' },
    { key: 'dribbles', label: 'כדרורים', type: 'Dribble', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'dribblesPer90' },
    { key: 'duelsWon', label: 'דו-קרבות שנרכשו', type: 'Duel', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'duelsWonPer90' },
    { key: 'bigChanceProxy', label: 'מצבים גדולים (קירוב)', type: 'Shot (big chance proxy)', feeds: 'לא בנוסחה', usedInScore: false, recipeKey: null, cap: null, weight: null, per90Field: 'bigChanceProxyPer90' }
  ]);

  const OUTCOMES = Object.freeze([
    { id: 'assists', label: 'בישולים', field: 'assists', leaky: false, leakNote: 'בישול לא נכנס לנוסחה. מסירת מפתח כן — זה לא אותו שדה.' },
    { id: 'dribbles', label: 'כדרורים', field: 'dribbles', leaky: false, leakNote: 'כדרור נאסף בקובץ ולא נכנס לציון.' },
    { id: 'duelsWon', label: 'דו-קרבות שנרכשו', field: 'duelsWon', leaky: false, leakNote: 'דו-קרב שנרכש לא זהה לתיקול שנכנס ל-Grit.' },
    { id: 'goals', label: 'שערים', field: 'goals', leaky: true, leakNote: 'דליפה: Clutch בנוי מ-xG ומבעיטות למסגרת, שמתואמים עם שערים.' },
    { id: 'box', label: 'שערים+בישולים', field: 'box', leaky: true, leakNote: 'דליפה: תיבת הניקוד מתואמת עם Clutch.' }
  ]);

  function outcomeMeta(outcomeId) {
    return OUTCOMES.find(function (item) { return item.id === outcomeId; }) || OUTCOMES[0];
  }

  function outcomeValue(player, outcomeId) {
    const counts = player && player.counts || {};
    if (outcomeId === 'box') return (counts.goals || 0) + (counts.assists || 0);
    if (outcomeId === 'goals') return counts.goals || 0;
    if (outcomeId === 'assists') return counts.assists || 0;
    if (outcomeId === 'dribbles') return counts.dribbles || 0;
    if (outcomeId === 'duelsWon') return counts.duelsWon || 0;
    return 0;
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
    if (!player) {
      return {
        player: null,
        dataset: dataset,
        provenance: layer.provenance,
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
      const total = col.key === 'totalMinutesProxy' ? minutes : (counts[col.key] || 0);
      const computed90 = minutes > 0 ? round2(total * 90 / minutes) : 0;
      const fromFile = filePer90(player, col.per90Field);
      const scaled = col.cap ? round1(scaleCap(raw[col.recipeKey] != null ? raw[col.recipeKey] : computed90, col.cap)) : null;
      const capped = col.cap != null && computed90 > col.cap;
      return {
        key: col.key,
        label: col.label,
        type: col.type,
        feeds: col.feeds,
        usedInScore: col.usedInScore,
        filePath: 'players[].' + col.key,
        sourceField: ledgerSourceField(player, col.key, col.per90Field),
        inFile: col.key === 'totalMinutesProxy' ? true : countInFile(player, col.key),
        total: col.key === 'shotXgSum' ? round2(total) : total,
        minutes: minutes,
        per90: computed90,
        per90File: fromFile,
        cap: col.cap,
        weight: col.weight,
        scaled: scaled,
        capped: capped,
        recipeKey: col.recipeKey
      };
    });
    const receipt = [
      { step: 'ספירה בקובץ', detail: player.name + ' · ' + (player.team || '') + ' · ' + minutes + ' דקות פרוקסי · ' + layer.provenance + ' · ' + dataset },
      { step: 'לחיצות ל-90', detail: (counts.pressures || 0) + ' × 90 / ' + minutes + ' = ' + (rows[0] ? rows[0].per90 : 0) + (rows[0] && rows[0].capped ? ' — מעל תקרת 18, לכן הסקייל 100' : '') },
      { step: 'Grit', detail: '0.45×לחיצות + 0.30×(תיקולים+חטיפות) + 0.25×הגנה → ' + player.components.grit },
      { step: 'Involvement', detail: '0.50×התקדמות + 0.30×מסירות מפתח + 0.20×מסירות → ' + player.components.involvement },
      { step: 'Clutch', detail: '0.40×xG + 0.35×רחבה + 0.25×מסגרת → ' + player.components.clutch + ' (תווית לימודית, לא רגע הכרעה)' }
    ];
    const honesty = layer.provenance === OPEN_DATA_PROVENANCE
      ? 'אלה הספירות האמיתיות מ-' + dataset + '. אין בריפו יומן אירועים גולמי — רק המצטבר שנבנה ממנו.'
      : 'אלה הספירות מהשכבה הפעילה ' + layer.provenance + ' (' + dataset + '). לא Open Data אלא אם התווית אומרת זאת.';
    return {
      player: { id: player.id, name: player.name, team: player.team, minutes: minutes, group: player.group },
      dataset: dataset,
      provenance: layer.provenance,
      honesty: honesty,
      rows: rows,
      unused: rows.filter(function (row) { return !row.usedInScore; }),
      capped: rows.filter(function (row) { return row.capped; }),
      receipt: receipt
    };
  }

  // --- S3: provenance ledger ------------------------------------------------
  //
  // Every number the lab puts on screen has to be traceable to a key that
  // really exists in the shipped JSON. LEDGER_FIELDS is not a second copy of
  // the recipe - it is the same EVENT_COLUMNS table the Counts explorer draws,
  // filtered to the ten fields that actually reach the score.
  const LEDGER_FIELDS = Object.freeze(EVENT_COLUMNS.filter(function (col) {
    return col.usedInScore;
  }));

  const LEDGER_PILLAR_BY_FEEDS = Object.freeze({
    Grit: 'grit', Involvement: 'involvement', Clutch: 'clutch'
  });

  function finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  // rawPer90 reads the file's own per90 block when it has a finite number for
  // the field and only then falls back to count*90/minutes. The ledger reports
  // whichever path was actually taken, never a plausible-looking guess - and
  // when NEITHER key exists in the file (a BYOD upload with a subset of the
  // columns) it reports null: the pipeline used 0 for that field, but it did
  // not read that 0 from anywhere.
  function countInFile(player, countKey) {
    const present = player && player.countsInFile;
    if (present && Object.prototype.hasOwnProperty.call(present, countKey)) return !!present[countKey];
    // rows prepared elsewhere (no countsInFile receipt): trust the counts map
    return !!(player && player.counts && Object.prototype.hasOwnProperty.call(player.counts, countKey));
  }

  function ledgerSourceField(player, countKey, per90Key) {
    const fromFile = player && player.per90File;
    if (per90Key && fromFile && Number.isFinite(Number(fromFile[per90Key]))) {
      return 'players[].per90.' + per90Key;
    }
    if (countInFile(player, countKey)) return 'players[].' + countKey;
    return null;
  }

  function ledgerPer90(player, countKey, per90Key) {
    const fromFile = player && player.per90File;
    if (per90Key && fromFile && Number.isFinite(Number(fromFile[per90Key]))) {
      return Number(fromFile[per90Key]);
    }
    const counts = (player && player.counts) || {};
    return per90(counts[countKey], Number(player && player.minutes) || 0);
  }

  // scorePrepared over 605 players is cheap but not free, and the ledger is
  // asked for one player at a time. Memoise the ranking per (store, spec).
  const LEDGER_ROW_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;

  function rankedRowsKey(metric) {
    return [
      metric.grit, metric.involvement, metric.clutch,
      metric.minMinutes, metric.normalizePosition ? 1 : 0
    ].join('|');
  }

  // derive() already holds the ranking for its spec; it hands it over so the
  // ledger does not rank the file a second time on the slider path.
  function primeRankedRows(store, metric, rows) {
    if (!LEDGER_ROW_CACHE || !store || !rows) return;
    LEDGER_ROW_CACHE.set(store, { key: rankedRowsKey(metric), rows: rows });
  }

  function rankedRowsFor(store, metric) {
    const players = (store && store.players) || [];
    const key = rankedRowsKey(metric);
    if (!LEDGER_ROW_CACHE || !store) return scorePrepared(players, metric);
    const hit = LEDGER_ROW_CACHE.get(store);
    if (hit && hit.key === key) return hit.rows;
    const rows = scorePrepared(players, metric);
    LEDGER_ROW_CACHE.set(store, { key: key, rows: rows });
    return rows;
  }

  // The un-rounded within-position percentile of one row, recomputed from the
  // very peer values normalizeByPosition ranked: components.shrunk of every
  // ranked row in the same position group. Returns null (and the ledger then
  // reports no rounding residue rather than a made-up one) if any ranked row
  // is missing its shrunk components.
  function percentileBaseFor(ranked, row, parts) {
    const shrunk = parts && parts.shrunk;
    if (!shrunk) return null;
    const group = String((row && row.positionGroup) || 'OT');
    const peers = { grit: [], involvement: [], clutch: [] };
    for (let i = 0; i < ranked.length; i += 1) {
      const peer = ranked[i];
      if (String(peer.positionGroup || 'OT') !== group) continue;
      const peerShrunk = peer.components && peer.components.shrunk;
      if (!peerShrunk) return null;
      COMPONENT_KEYS.forEach(function (key) {
        peers[key].push(finiteOr(peerShrunk[key], 0));
      });
    }
    const base = {};
    COMPONENT_KEYS.forEach(function (key) {
      base[key] = percentileRaw(finiteOr(shrunk[key], 0), peers[key]);
    });
    return base;
  }

  // explainScore(playerId, weights, store) -> the full derivation tree behind
  // one displayed impact. Pure: same arguments, same JSON, every time.
  //
  // What the pipeline really does to the contributions is reported, not hidden,
  // and each step is named for what it IS:
  //   normalisationShift - shrinkByPosition(k) on every per-90 rate plus the
  //                        within-position percentile. Zero when the
  //                        normalisation checkbox is off; up to 59.72 points on
  //                        the shipped file when it is on. NOT a rounding.
  //   pillarRounding     - round1 on each pillar before it is weighted. At most
  //                        0.05, in BOTH modes.
  //   displayRounding    - round2 on the composite. At most 0.005.
  // sum(contributions) is the EXACT pre-transform, pre-rounding arithmetic and
  // reconciliation.total is what the three together added to it. impact is
  // always the number on screen.
  function explainScore(playerId, weights, store) {
    const metric = normalizeMetricSpec(weights);
    const players = (store && store.players) || [];
    const id = String(playerId == null ? '' : playerId);
    let prepared = null;
    for (let i = 0; i < players.length; i += 1) {
      if (players[i].id === id) { prepared = players[i]; break; }
    }
    if (!prepared) return null;

    const ranked = rankedRowsFor(store, metric);
    let displayed = null;
    for (let i = 0; i < ranked.length; i += 1) {
      if (ranked[i].id === prepared.id) { displayed = ranked[i]; break; }
    }
    // Below the minutes threshold a player is not in the table at all; the
    // ledger still explains the score he would carry, from his own counts.
    const shown = displayed || prepared;
    const parts = shown.components || {};
    const totalWeight = metric.grit + metric.involvement + metric.clutch;
    const denom = totalWeight || 1;

    const per90ByKey = {};
    LEDGER_FIELDS.forEach(function (col) {
      per90ByKey[col.key] = ledgerPer90(prepared, col.key, col.per90Field);
    });

    const counts = prepared.counts || {};
    const shrunkRates = (displayed && displayed.shrunkRates) || null;
    const components = LEDGER_FIELDS.map(function (col) {
      const value = per90ByKey[col.key];
      const sourceField = ledgerSourceField(prepared, col.key, col.per90Field);
      const inFile = countInFile(prepared, col.key);
      const cap = Number(col.cap) || 0;
      let capped;
      let pairedPer90 = null;
      if (col.pairWith) {
        // tackles and interceptions share one cap of 6/90. The pair is capped
        // together, exactly as componentsFromEvents does it, and the capped
        // total is then split between the two fields in proportion to their
        // own per-90 - so the two contributions still add up to the pair's.
        const mate = finiteOr(per90ByKey[col.pairWith], 0);
        pairedPer90 = value + mate;
        const cappedPair = clamp(pairedPer90, 0, cap);
        capped = pairedPer90 > 0 ? cappedPair * (value / pairedPer90) : 0;
      } else {
        capped = clamp(value, 0, cap);
      }
      const scaled = cap ? capped / cap * 100 : 0;
      const pillar = LEDGER_PILLAR_BY_FEEDS[col.feeds] || 'grit';
      const weight = Number(col.weight) * metric[pillar] / denom;
      return {
        name: col.key,
        label: col.label,
        feeds: pillar,
        eventType: col.type,
        // raw is the count READ FROM THE FILE; null when the file has no such
        // key (the pipeline then used 0, and per90 says so)
        raw: inFile ? finiteOr(counts[col.key], 0) : null,
        inFile: inFile,
        per90: finiteOr(value, 0),
        // under position normalisation the rate the caps really saw is the
        // shrunk one; null whenever no shrinkage ran
        shrunkPer90: shrunkRates ? finiteOr(shrunkRates[col.key], 0) : null,
        cap: cap,
        capped: finiteOr(capped, 0),
        scaled: finiteOr(scaled, 0),
        recipeWeight: Number(col.weight),
        weight: finiteOr(weight, 0),
        contribution: finiteOr(scaled * weight, 0),
        sourceField: sourceField,
        countField: inFile ? 'players[].' + col.key : null,
        sharesCapWith: col.pairWith ? 'players[].' + col.pairWith : null,
        pairedPer90: pairedPer90 == null ? null : finiteOr(pairedPer90, 0)
      };
    });

    const normalized = !!parts.normalized;
    const percentileBase = normalized ? percentileBaseFor(ranked, shown, parts) : null;
    const pillars = COMPONENT_KEYS.map(function (key) {
      let fromComponents = 0;
      components.forEach(function (item) {
        if (item.feeds === key) fromComponents += item.scaled * item.recipeWeight;
      });
      const value = finiteOr(parts[key], 0);
      const share = metric[key] / denom;
      // the number round1 turned into `value`: the un-weighted contributions
      // without normalisation, the un-rounded within-position percentile with
      // it. Everything between fromComponents and beforeRound1 is transform,
      // everything between beforeRound1 and value is rounding.
      const beforeRound1 = normalized
        ? (percentileBase ? percentileBase[key] : value)
        : fromComponents;
      return {
        name: key,
        fromComponents: fromComponents,
        beforeRound1: beforeRound1,
        value: value,
        weight: metric[key],
        share: share,
        contribution: value * share,
        transform: normalized
          ? 'shrinkByPosition(k=' + finiteOr(parts.shrinkK, SHRINK_DEFAULT_K) +
            ') on each per-90 rate, then caps, scale, round1, then within-position percentile (average rank for ties)'
          : 'round1'
      };
    });

    let componentsSum = 0;
    components.forEach(function (item) { componentsSum += item.contribution; });
    let pillarSum = 0;
    pillars.forEach(function (item) { pillarSum += item.contribution; });
    let pillarPreRoundingSum = 0;
    pillars.forEach(function (item) { pillarPreRoundingSum += item.beforeRound1 * item.share; });
    const impact = displayed ? displayed.score : compositeScore(parts, metric);

    return {
      playerId: prepared.id,
      name: prepared.name,
      team: prepared.team || null,
      position: prepared.position || '',
      positionGroup: prepared.positionGroup || 'OT',
      minutes: finiteOr(prepared.minutes, 0),
      dataset: (store && store.source && store.source.dataset) || null,
      provenance: (store && store.provenance) || prepared.provenance || null,
      minutesField: prepared.minutesField ? 'players[].' + prepared.minutesField : null,
      weights: {
        grit: metric.grit,
        involvement: metric.involvement,
        clutch: metric.clutch,
        total: totalWeight
      },
      normalized: normalized,
      displayed: !!displayed,
      rank: displayed ? displayed.rank : null,
      impact: impact,
      components: components,
      pillars: pillars,
      reconciliation: {
        componentsSum: componentsSum,
        pillarSum: pillarSum,
        // the weighted pillars as they were BEFORE round1 touched them
        pillarPreRoundingSum: pillarPreRoundingSum,
        // what POSITION NORMALISATION moved the score by: shrinkByPosition on
        // every per-90 rate, then the within-position percentile. This is a
        // transform, not a rounding - on the shipped file it reaches 59.72
        // points - and it is 0 whenever the normalisation checkbox is off.
        normalisationShift: pillarPreRoundingSum - componentsSum,
        // what round1 on each pillar added: <= 0.05 in BOTH modes
        pillarRounding: pillarSum - pillarPreRoundingSum,
        // what round2 on the composite added: <= 0.005
        displayRounding: impact - pillarSum,
        // the three of them together
        total: impact - componentsSum
      }
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

  // pearsonRaw keeps full double precision. pearson() stays the rounded
  // display value the lab has always shown, so nothing on screen moves.
  function pearsonRaw(xs, ys) {
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
    if (!den) return 0;
    return num / den;
  }

  function pearson(xs, ys) {
    const raw = pearsonRaw(xs, ys);
    return raw == null ? null : round2(raw);
  }

  function spearmanRaw(xs, ys) {
    if (!xs || !ys || xs.length !== ys.length || xs.length < 2) return null;
    return pearsonRaw(rankValues(xs), rankValues(ys));
  }

  function spearman(xs, ys) {
    const raw = spearmanRaw(xs, ys);
    return raw == null ? null : round2(raw);
  }

  // Inline mulberry32. No ambient randomness, no clock, no dependency: the
  // whole bootstrap is a pure function of (pairs, iterations, seed), so two
  // runs on two machines return bit-identical doubles.
  function mulberry32(seed) {
    let a = Number(seed) >>> 0;
    return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toScoreTargetPair(entry) {
    if (Array.isArray(entry)) return [Number(entry[0]) || 0, Number(entry[1]) || 0];
    if (entry && typeof entry === 'object') {
      const x = entry.score != null ? entry.score : entry.x;
      const y = entry.target != null
        ? entry.target
        : (entry.outcome != null ? entry.outcome : entry.y);
      return [Number(x) || 0, Number(y) || 0];
    }
    return [0, 0];
  }

  // Linear-interpolation percentile on an ascending array (R type 7 / the
  // numpy default). This is the textbook percentile bootstrap interval.
  function percentileOfSorted(sorted, p) {
    const n = sorted.length;
    if (!n) return null;
    if (n === 1) return sorted[0];
    const pos = (n - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // iterations: an INTEGER in [50, 20000]. 50 is the backlog's floor; 20000
  // is a ceiling so a caller cannot block the page for seconds (1000
  // replicates on n=120 cost ~40 ms per fold; 20000 ~0.8 s). 50.9 is not an
  // iteration count and is refused, not truncated.
  const BOOTSTRAP_MIN_ITERATIONS = 50;
  const BOOTSTRAP_MAX_ITERATIONS = 20000;
  // n: below 10 pairs the percentile bootstrap of a rank correlation is not
  // an interval. With n=5 on the shipped file 87 of 1000 resamples have zero
  // variance on one side (no rho at all) and the 2.5/97.5 percentiles are the
  // hard bounds -1/1 or 0/1, which read like certainty. Under the floor the
  // point estimate is still returned; lo/hi are null and reason says why.
  const BOOTSTRAP_MIN_N = 10;
  const BOOTSTRAP_DEFAULTS = Object.freeze({ iterations: 1000, seed: 42 });

  // seed rule: null, undefined, false and '' all mean "the default seed 42".
  // Any other number or string is hashed as its String() form (so 42 and
  // '42' are the same stream). Other types are refused.
  function resolveSeed(seed) {
    if (seed == null || seed === false || seed === '') return BOOTSTRAP_DEFAULTS.seed;
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed;
    if (typeof seed === 'string') return seed;
    throw new TypeError('bootstrapSpearman seed must be a finite number or a string, got ' + typeof seed);
  }

  function resolveIterations(iterations) {
    if (iterations == null) return BOOTSTRAP_DEFAULTS.iterations;
    const n = typeof iterations === 'number' ? iterations : Number(iterations);
    if (!Number.isInteger(n) || n < BOOTSTRAP_MIN_ITERATIONS || n > BOOTSTRAP_MAX_ITERATIONS) {
      throw new RangeError(
        'bootstrapSpearman needs an integer iterations in [' + BOOTSTRAP_MIN_ITERATIONS +
        ', ' + BOOTSTRAP_MAX_ITERATIONS + '], got ' + String(iterations)
      );
    }
    return n;
  }

  function allEqual(values) {
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] !== values[0]) return false;
    }
    return true;
  }

  // Percentile bootstrap for Spearman rho: resample the (score, target) pairs
  // with replacement, recompute rho on every resample, then read the 2.5 and
  // 97.5 percentiles off the sorted replicate distribution. rho itself stays
  // the point estimate on the real sample - the interval never moves it.
  //
  // A resample whose scores or targets are all one value has no rho. Such
  // degenerate replicates are COUNTED (degenerateCount) and left out of the
  // percentile distribution - they are not mapped to 0, which would pull the
  // interval toward 0 silently. effectiveIterations is what the percentiles
  // were read from.
  function bootstrapSpearman(pairs, options) {
    const opts = options || {};
    const iterations = resolveIterations(opts.iterations);
    const seed = resolveSeed(opts.seed);
    const rows = (pairs || []).map(toScoreTargetPair);
    const n = rows.length;
    const base = {
      rho: null, lo: null, hi: null,
      iterations: iterations, effectiveIterations: 0, degenerateCount: 0,
      seed: seed, n: n, minN: BOOTSTRAP_MIN_N, reason: null
    };
    if (n < 2) return Object.assign(base, { reason: 'n<2' });
    const xs = new Array(n);
    const ys = new Array(n);
    for (let i = 0; i < n; i += 1) {
      xs[i] = rows[i][0];
      ys[i] = rows[i][1];
    }
    const point = spearmanRaw(xs, ys);
    if (n < BOOTSTRAP_MIN_N) return Object.assign(base, { rho: round3(point), reason: 'n<' + BOOTSTRAP_MIN_N });
    const random = mulberry32(hashSeed(String(seed)));
    const replicates = [];
    let degenerate = 0;
    const rx = new Array(n);
    const ry = new Array(n);
    for (let b = 0; b < iterations; b += 1) {
      for (let i = 0; i < n; i += 1) {
        const pick = Math.min(n - 1, Math.floor(random() * n));
        rx[i] = xs[pick];
        ry[i] = ys[pick];
      }
      if (allEqual(rx) || allEqual(ry)) {
        degenerate += 1;
        continue;
      }
      replicates.push(spearmanRaw(rx, ry));
    }
    replicates.sort(function (a, b) { return a - b; });
    if (!replicates.length) {
      return Object.assign(base, {
        rho: round3(point), degenerateCount: degenerate, reason: 'all replicates degenerate'
      });
    }
    return Object.assign(base, {
      rho: round3(point),
      lo: round3(percentileOfSorted(replicates, 0.025)),
      hi: round3(percentileOfSorted(replicates, 0.975)),
      effectiveIterations: replicates.length,
      degenerateCount: degenerate
    });
  }

  function formatRhoValue(value) {
    const num = Number(value);
    if (value == null || !Number.isFinite(num)) return '\u2014';
    const fixed = Math.abs(num).toFixed(2);
    return (num < 0 && Number(fixed) !== 0) ? '\u2212' + fixed : fixed;
  }

  // "rho = 0.30 [-0.05, 0.58]" - the lab never shows a bare rho again. When
  // there is no interval the brackets say why instead of showing a number:
  //   pending      -> "rho = 0.30 [\u05e8\u05d5\u05d5\u05d7 \u05d1\u05d8\u05d7\u05d5\u05df \u05d1\u05d7\u05d9\u05e9\u05d5\u05d1\u2026]"  (derive() before the
  //                   debounced validationInterval() has run)
  //   n too small  -> "rho = 0.87 [n=5 \u05e7\u05d8\u05df \u05de\u05d3\u05d9 \u05dc\u05e8\u05d5\u05d5\u05d7]"
  function formatRhoWithCi(ci) {
    if (!ci || ci.rho == null) return '\u03c1 = \u2014';
    if (ci.lo == null || ci.hi == null) {
      const why = ci.reason === 'pending'
        ? '\u05e8\u05d5\u05d5\u05d7 \u05d1\u05d8\u05d7\u05d5\u05df \u05d1\u05d7\u05d9\u05e9\u05d5\u05d1\u2026'
        : ci.reason && ci.reason.indexOf('n<') === 0
          ? 'n=' + ci.n + ' \u05e7\u05d8\u05df \u05de\u05d3\u05d9 \u05dc\u05e8\u05d5\u05d5\u05d7'
          : (ci.reason || '\u05d0\u05d9\u05df \u05e8\u05d5\u05d5\u05d7');
      return '\u03c1 = ' + formatRhoValue(ci.rho) + ' [' + why + ']';
    }
    return '\u03c1 = ' + formatRhoValue(ci.rho) +
      ' [' + formatRhoValue(ci.lo) + ', ' + formatRhoValue(ci.hi) + ']';
  }

  function worldCupGroup(team) {
    return WC2018_TEAM_GROUP[team] || null;
  }

  function assignFold(player, splitId) {
    if (splitId === 'hash') {
      return (hashSeed(playerKey(player)) % 2 === 0) ? 'train' : 'test';
    }
    const group = worldCupGroup(player.team);
    if (!group) return 'unassigned';
    return 'ABCD'.indexOf(group) >= 0 ? 'train' : 'test';
  }

  // bootstrap.run is the function that produces the interval for one fold:
  // bootstrapSpearman itself by default, a store's memoised/lookup variant
  // from derive(), or false to skip. A null result means "no interval yet",
  // and the label says so rather than showing a bare rho.
  function foldStats(rows, outcomeId, bootstrap, context) {
    const scores = rows.map(function (row) { return row.score; });
    const outcomes = rows.map(function (row) { return outcomeValue(row, outcomeId); });
    const rho = spearman(scores, outcomes);
    const rhoRaw = spearmanRaw(scores, outcomes);
    const boot = bootstrap || BOOTSTRAP_DEFAULTS;
    const run = boot.run === false ? null : (typeof boot.run === 'function' ? boot.run : bootstrapSpearman);
    const pairs = scores.map(function (score, i) { return [score, outcomes[i]]; });
    let ci = run ? run(pairs, { iterations: boot.iterations, seed: boot.seed }, Object.assign({}, context, { pairs: pairs })) : null;
    if (!ci) {
      ci = {
        rho: rhoRaw == null ? null : round3(rhoRaw), lo: null, hi: null,
        iterations: boot.iterations, effectiveIterations: 0, degenerateCount: 0,
        seed: boot.seed, n: rows.length, minN: BOOTSTRAP_MIN_N, reason: 'pending'
      };
    }
    const byOutcome = rows.slice().sort(function (a, b) {
      return outcomeValue(b, outcomeId) - outcomeValue(a, outcomeId);
    });
    return {
      n: rows.length,
      rho: rho,
      ci: ci,
      rhoLabel: formatRhoWithCi(ci),
      topMetric: rows.slice(0, 5).map(function (row) {
        return { id: row.id, name: row.name, team: row.team, score: row.score, outcome: outcomeValue(row, outcomeId) };
      }),
      topOutcome: byOutcome.slice(0, 5).map(function (row) {
        return { id: row.id, name: row.name, team: row.team, score: row.score, outcome: outcomeValue(row, outcomeId) };
      }),
      componentRho: {
        grit: spearman(rows.map(function (row) { return row.components.grit; }), outcomes),
        involvement: spearman(rows.map(function (row) { return row.components.involvement; }), outcomes),
        clutch: spearman(rows.map(function (row) { return row.components.clutch; }), outcomes)
      }
    };
  }

  function validateMetric(prepared, spec, options) {
    const metric = normalizeMetricSpec(spec);
    const opts = options || {};
    const outcomeId = opts.outcomeId || metric.outcomeId;
    const splitId = opts.splitId || metric.splitId;
    const meta = outcomeMeta(outcomeId);
    const players = asPrepared(prepared);
    // opts.ranked: the caller's own scorePrepared(players, metric) - derive()
    // passes it so the slider path ranks the file once, not twice
    const ranked = opts.ranked || scorePrepared(players, metric);
    const train = [];
    const test = [];
    const unassigned = [];
    ranked.forEach(function (row) {
      const fold = assignFold(row, splitId);
      if (fold === 'train') train.push(row);
      else if (fold === 'test') test.push(row);
      else unassigned.push(row);
    });
    // Options are validated HERE, at the edge, and a bad value falls back to
    // the default with a note - validateMetric is called from derive() on
    // every slider input and must never throw for an option.
    const notes = [];
    let iterations = BOOTSTRAP_DEFAULTS.iterations;
    try {
      iterations = resolveIterations(opts.iterations);
    } catch (err) {
      notes.push('iterations ' + String(opts.iterations) + ' נדחה (' + err.message + '); נעשה שימוש בברירת המחדל ' + BOOTSTRAP_DEFAULTS.iterations + '.');
    }
    let seed = BOOTSTRAP_DEFAULTS.seed;
    try {
      seed = resolveSeed(opts.seed);
    } catch (err) {
      notes.push('seed נדחה (' + err.message + '); נעשה שימוש ב-seed ' + BOOTSTRAP_DEFAULTS.seed + '.');
    }
    const bootstrap = {
      iterations: iterations,
      seed: seed,
      run: opts.bootstrap === false ? false : (typeof opts.bootstrap === 'function' ? opts.bootstrap : undefined),
      notes: notes
    };
    const context = { metric: metric, outcomeId: outcomeId, splitId: splitId };
    const trainStats = foldStats(train, outcomeId, bootstrap, Object.assign({ fold: 'train' }, context));
    const testStats = foldStats(test, outcomeId, bootstrap, Object.assign({ fold: 'test' }, context));
    const drop = (trainStats.rho != null && testStats.rho != null)
      ? round2(trainStats.rho - testStats.rho)
      : null;
    return {
      outcomeId: outcomeId,
      outcomeLabel: meta.label,
      leaky: meta.leaky,
      leakNote: meta.leakNote,
      splitId: splitId,
      splitLabel: splitId === 'hash'
        ? 'פיצול דטרמיניסטי לפי שם (לא לפי קבוצה)'
        : 'בתים A–D אימון, E–H מבחן — אותו מונדיאל 2018',
      heldOutSeason: false,
      honesty: 'אין בריפו עונה שנייה של אותן ספירות אירועים. זה פיצול מדגם בתוך מונדיאל 2018, לא חיזוי עונה מוחזקת.',
      unassigned: unassigned.length,
      train: trainStats,
      test: testStats,
      rhoDrop: drop,
      bootstrap: { iterations: iterations, seed: seed, notes: notes },
      intervalReady: testStats.ci.reason !== 'pending' && trainStats.ci.reason !== 'pending',
      heldOutRhoLabel: testStats.rhoLabel,
      verdict: validationVerdict(trainStats, testStats, meta)
    };
  }

  function validationVerdict(trainStats, testStats, meta) {
    const notes = [];
    notes.push('זו אינה עונה חדשה.');
    if (meta.leaky) notes.push(meta.leakNote);
    if (testStats.n < 20) notes.push('מדגם המבחן קטן — אסור להכריז על תוקף.');
    if (trainStats.rho != null && testStats.rho != null && trainStats.rho - testStats.rho >= 0.2) {
      notes.push('ρ באימון גבוה בהרבה מבמבחן — חשד להתאמת-יתר למדגם.');
    }
    if (testStats.rho == null) notes.push('אין מספיק שחקנים לחישוב Spearman במבחן.');
    else if (testStats.rho < 0.2) notes.push('ρ במבחן חלש. המדד לא חוזה את היעד הזה במדגם המוחזק.');
    else if (testStats.ci && testStats.ci.lo == null && testStats.ci.reason !== 'pending') {
      notes.push(testStats.rhoLabel + ' במבחן: n=' + testStats.n + ' קטן מ-' + BOOTSTRAP_MIN_N + ', אין רווח בטחון — המספר הזה לבדו אינו ראיה.');
    } else notes.push(testStats.rhoLabel + ' במבחן הוא קשר סטטיסטי בתוך אותו טורניר, לא הוכחת סקאוטינג. הסוגריים הם רווח בטחון 95% מ-bootstrap עם seed קבוע.');
    return notes.join(' ');
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
      body: 'ספירה גולמית מעדיפה מי ששיחק יותר. לכן מחלקים בדקות ומכפילים ב-90. שחקן עם מדגם קטן יכול להיראות קיצוני.',
      exercise: 'אם לשחקן יש 90 לחיצות ב-180 דקות, כמה לחיצות ל-90 דקות?',
      hint: null
    },
    {
      id: 'caps',
      title: '3. תקרות שרירותיות',
      section: 'explorer',
      body: 'כל רכיב נחתך בתקרה קבועה (לחיצות 18/90, xG 0.6/90…). מי שמעל התקרה מקבל 100. התקרה אינה כיול מדעי.',
      exercise: 'האם שחקן עם 26.5 לחיצות ל-90 דקות (מעל תקרה 18) מקבל סקייל 100 ברכיב הלחיצות?',
      hint: { selectedId: "N'Golo Kanté|France" }
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
      body: 'תוספת 10 נקודות למשקל אחד מזיזה את הטופ. מדד מרוכב בלי כיול הוא שברירי בכוונה.',
      exercise: 'האם דחיפת +10 למשקל יכולה לשנות מי נמצא בחמישייה?',
      hint: null
    },
    {
      id: 'holdout',
      title: '7. מדגם מוחזק',
      section: 'validate',
      body: 'אין עונה שנייה בריפו. הפיצול הכנה הוא בתים A–D מול E–H באותו מונדיאל. ρ במבחן הוא המספר שחשוב — והוא עדיין לא «העונה הבאה».',
      exercise: 'ענו: האם פיצול הבתים הוא עונה חדשה, ומה המספר שקובע — ρ אימון או ρ מבחן?',
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
        checks = [
          {
            id: 'per90-math',
            label: '90 לחיצות ב-180 דקות = 45 ל-90 דקות',
            pass: String(answers.per90) === '45',
            detail: answered(answers.per90) ? 'עניתם ' + answers.per90 + '.' : 'חשבו: ספירה × 90 / דקות.'
          },
          {
            id: 'minutes-floor',
            label: 'סף דקות לפחות 270 — מדגם קטן משקר',
            pass: !!(ctx.spec && ctx.spec.minMinutes >= 270),
            detail: ctx.spec ? 'סף נוכחי: ' + ctx.spec.minMinutes + '.' : ''
          }
        ];
      } else if (lesson.id === 'caps') {
        const hit = (explorer.capped || []).length > 0;
        checks = [
          {
            id: 'cap-quiz',
            label: 'מעל התקרה הסקייל הוא 100, לא «עוד יותר»',
            pass: answers.kanteCapped === 'yes',
            detail: answered(answers.kanteCapped) ? (answers.kanteCapped === 'yes' ? 'נכון — התקרה חותכת.' : 'לא. 26.5/18 נחתך ל-100.') : 'ענו על שאלת התקרה.'
          },
          {
            id: 'cap-seen',
            label: 'אצל השחקן הנבחר יש רכיב שנתקל בתקרה, או שבחרתם את קאנטה',
            pass: hit || (selected && /Kant/i.test(selected.name || '')),
            detail: hit ? 'שדות מעל התקרה: ' + explorer.capped.map(function (row) { return row.label; }).join(', ') + '.' : 'בחרו שחקן עם לחיצות גבוהות, למשל קאנטה.'
          }
        ];
      } else if (lesson.id === 'weights') {
        checks = [
          {
            id: 'manual-weights',
            label: 'המשקלות ידניות ושרירותיות — לא מודל מכויל',
            pass: answers.weightsManual === 'yes',
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
        const ex = exercise || { passed: false, checks: [] };
        checks = [
          {
            id: 'defender-pass',
            label: 'תרגיל הבלמים החי עבר',
            pass: !!ex.passed,
            detail: ex.summary || 'הזיזו משקלות במעבדה עד שהבדיקה העצמית ירוקה.'
          }
        ];
      } else if (lesson.id === 'fragility') {
        checks = [
          {
            id: 'bump-moves',
            label: 'דחיפת +10 יכולה להזיז את החמישייה',
            pass: answers.bumpCanMove === 'yes',
            detail: answered(answers.bumpCanMove) ? '' : 'פתחו את מעבדת השבריריות וענו.'
          }
        ];
      } else if (lesson.id === 'holdout') {
        const testN = validation && validation.test ? validation.test.n : 0;
        checks = [
          {
            id: 'not-season',
            label: 'פיצול הבתים אינו עונה חדשה',
            pass: answers.splitIsSeason === 'no',
            detail: answered(answers.splitIsSeason)
              ? (answers.splitIsSeason === 'no' ? 'נכון. אותו מונדיאל, שני מדגמי קבוצות.' : 'לא. אין בריפו עונה מוחזקת.')
              : 'ענו במעבדת האימות.'
          },
          {
            id: 'test-rho',
            label: 'המספר שקובע הוא ρ במבחן, לא באימון',
            pass: answers.whatMatters === 'test',
            detail: answered(answers.whatMatters) ? '' : 'בחרו מה חשוב יותר אחרי הפיצול.'
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
            pass: answers.unusedTerm === 'dribble' || answers.unusedTerm === 'Dribble / Goal / Assist',
            detail: answered(answers.unusedTerm) ? '' : 'בחרו מהמילון מונח עם התווית «לא בנוסחה».'
          },
          {
            id: 'non-commercial',
            label: 'Open Data אסור למסחר',
            pass: answers.commercial === 'no',
            detail: answered(answers.commercial) ? '' : 'אשרו את מגבלת הרישיון.'
          }
        ];
      }
      const passed = checks.length > 0 && checks.every(function (item) { return item.pass; });
      return {
        id: lesson.id,
        title: lesson.title,
        section: lesson.section,
        body: lesson.body,
        exercise: lesson.exercise,
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

  function parseUserCsv(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (line) {
      return line.trim();
    });
    if (lines.length < 2) return { ok: false, errors: ['CSV צריך שורת כותרת ולפחות שחקן אחד'], players: [] };
    const headers = splitCsvLine(lines[0]).map(function (h) { return h.toLowerCase(); });
    const nameIdx = headers.indexOf('name');
    if (nameIdx < 0) return { ok: false, errors: ['חסרה עמודת name'], players: [] };
    const minIdx = headers.indexOf('minutes') >= 0 ? headers.indexOf('minutes') : headers.indexOf('totalminutesproxy');
    const col = {};
    USER_DATASET_COLUMNS.forEach(function (key) {
      col[key] = headers.indexOf(key.toLowerCase());
    });
    const players = [];
    const errors = [];
    lines.slice(1).forEach(function (line, i) {
      const cells = splitCsvLine(line);
      const name = cells[nameIdx];
      if (!name) {
        errors.push('שורה ' + (i + 2) + ': חסר שם');
        return;
      }
      const row = { name: name };
      USER_DATASET_COLUMNS.forEach(function (key) {
        if (key === 'name') return;
        const idx = col[key];
        if (idx < 0) return;
        const raw = cells[idx];
        if (raw === '' || raw == null) return;
        row[key] = key === 'team' || key === 'position' ? raw : raw;
      });
      if (minIdx >= 0 && cells[minIdx] !== '') row.totalMinutesProxy = Number(cells[minIdx]);
      players.push(row);
    });
    if (!players.length) return { ok: false, errors: errors.length ? errors : ['לא נמצאו שחקנים'], players: [] };
    return { ok: true, errors: errors, players: players };
  }

  function parseUserDataset(text, options) {
    const opts = options || {};
    const raw = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
    if (!raw) {
      return { ok: false, errors: ['הקובץ ריק'], players: [], provenance: null };
    }
    let dataset = null;
    let parseErrors = [];
    if (raw.charAt(0) === '{' || raw.charAt(0) === '[') {
      try {
        dataset = JSON.parse(raw);
      } catch (err) {
        return { ok: false, errors: ['JSON לא תקין'], players: [], provenance: null };
      }
    } else {
      const csv = parseUserCsv(raw);
      if (!csv.ok) return { ok: false, errors: csv.errors, players: [], provenance: null };
      dataset = { players: csv.players };
      parseErrors = csv.errors || [];
    }
    if (looksLikeOpenDataPayload(dataset)) {
      return {
        ok: false,
        errors: ['הקובץ מזוהה כ-StatsBomb Open Data. הרישיון אוסר ניצול מסחרי. חזרו למצב הדמו החינמי.'],
        players: [],
        provenance: OPEN_DATA_PROVENANCE,
        detected: OPEN_DATA_PROVENANCE
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
    const players = eventPlayers(dataset).filter(function (row) { return row && row.name; });
    if (!players.length) {
      return { ok: false, errors: ['אין שחקנים עם שדה name'], players: [], provenance: null };
    }
    const provenance = synthetic ? SYNTHETIC_PROVENANCE : USER_DATA_PROVENANCE;
    return {
      ok: true,
      errors: parseErrors,
      warnings: players.length < 2 ? ['שחקן אחד — הדירוג יהיה טריוויאלי'] : [],
      players: players,
      provenance: provenance,
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
    componentsFromEvents: componentsFromEvents,
    shrinkByPosition: shrinkByPosition,
    SHRINK_DEFAULT_K: SHRINK_DEFAULT_K,
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
    normalizeMetricSpec: normalizeMetricSpec,
    playerKey: playerKey,
    EVENT_GLOSSARY: EVENT_GLOSSARY,
    RADAR_AXES: RADAR_AXES,
    COMPONENT_RECIPE: COMPONENT_RECIPE,
    DEFENDER_EXERCISE: DEFENDER_EXERCISE,
    evaluateExercise: evaluateExercise,
    buildCompareRadar: buildCompareRadar,
    radarValues: radarValues,
    methodologyParagraph: methodologyParagraph,
    exportMetricBundle: exportMetricBundle,
    EVENT_COLUMNS: EVENT_COLUMNS,
    OUTCOMES: OUTCOMES,
    WC2018_GROUPS: WC2018_GROUPS,
    worldCupGroup: worldCupGroup,
    assignFold: assignFold,
    spearman: spearman,
    spearmanRaw: spearmanRaw,
    pearson: pearson,
    bootstrapSpearman: bootstrapSpearman,
    formatRhoWithCi: formatRhoWithCi,
    BOOTSTRAP_MIN_ITERATIONS: BOOTSTRAP_MIN_ITERATIONS,
    BOOTSTRAP_MAX_ITERATIONS: BOOTSTRAP_MAX_ITERATIONS,
    BOOTSTRAP_MIN_N: BOOTSTRAP_MIN_N,
    BOOTSTRAP_DEFAULTS: BOOTSTRAP_DEFAULTS,
    percentile: percentile,
    componentsFromRates: componentsFromRates,
    RATE_KEYS: RATE_KEYS,
    outcomeValue: outcomeValue,
    buildEventExplorer: buildEventExplorer,
    explainScore: explainScore,
    LEDGER_FIELDS: LEDGER_FIELDS,
    glossaryForPlayer: glossaryForPlayer,
    validateMetric: validateMetric,
    evaluateCurriculum: evaluateCurriculum,
    CURRICULUM_LESSONS: CURRICULUM_LESSONS,
    parseUserDataset: parseUserDataset,
    looksLikeOpenDataPayload: looksLikeOpenDataPayload,
    USER_DATASET_COLUMNS: USER_DATASET_COLUMNS,
    OPEN_DATA_PROVENANCE: OPEN_DATA_PROVENANCE,
    USER_DATA_PROVENANCE: USER_DATA_PROVENANCE,
    SYNTHETIC_PROVENANCE: SYNTHETIC_PROVENANCE,
    OPEN_DATA_SOURCE: OPEN_DATA_SOURCE
  };
}));
