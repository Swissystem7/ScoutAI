'use strict';

const DEFAULT_MINUTES = 450;
const FIELDS = Object.freeze({
  name: 'player', league: 'league', age: 'age', position: 'pos', minutes: 'Playing Time_Min',
  goals: 'Performance_Gls', assists: 'Performance_Ast', goalsPer90: 'Per 90 Minutes_Gls',
  assistsPer90: 'Per 90 Minutes_Ast', goalAssistsPer90: 'Per 90 Minutes_G+A',
  xG: 'Expected_xG', xAG: 'Expected_xAG', progressivePasses: 'Progression_PrgP', progressiveCarries: 'Progression_PrgC'
});

function loadFbrefDataset(json) {
  const value = typeof json === 'string' ? parseJson(json) : json;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('FBref dataset must be an object');
  if (!Array.isArray(value.players) || !Array.isArray(value.columns)) throw new TypeError('FBref dataset requires players and columns arrays');
  if (value.players.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new TypeError('every FBref player must be an object');
  for (const key of [FIELDS.name, FIELDS.league, FIELDS.minutes]) if (!value.columns.includes(key)) throw new TypeError('missing required FBref column: ' + key);
  if (Number.isFinite(value.playerCount) && value.playerCount !== value.players.length) throw new TypeError('playerCount does not match players length');
  return value;
}

function fbrefToSignals(json, opts = {}) {
  const dataset = loadFbrefDataset(json);
  const minimumMinutes = opts.minimumMinutes === undefined ? DEFAULT_MINUTES : finiteNonNegative(opts.minimumMinutes, 'minimumMinutes');
  const available = new Set(dataset.columns);
  const teamLeague = buildTeamLeagueLookup(dataset);
  const kept = dataset.players.filter((row) => number(row[FIELDS.minutes]) >= minimumMinutes && String(row[FIELDS.name] || '').trim());
  const scores = percentileScores(kept.map(performanceRate));
  const signals = kept.map((row, index) => {
    const minutes = number(row[FIELDS.minutes]);
    const metrics = {
      goals: optional(row, available, FIELDS.goals), assists: optional(row, available, FIELDS.assists),
      goalsPer90: optional(row, available, FIELDS.goalsPer90), assistsPer90: optional(row, available, FIELDS.assistsPer90),
      goalAssistsPer90: optional(row, available, FIELDS.goalAssistsPer90), xG: optional(row, available, FIELDS.xG),
      xAG: optional(row, available, FIELDS.xAG), progressivePasses: optional(row, available, FIELDS.progressivePasses),
      progressiveCarries: optional(row, available, FIELDS.progressiveCarries),
      actionValueScore: scores[index], actionValueProvenance: { measured: true, source: 'FBref via soccerdata', method: 'percentile of 0.6 goals/90 + 0.4 assists/90' }
    };
    return {
      id: slug(row[FIELDS.name]) + '-' + slug(row.team || '') + '-' + index, name: String(row[FIELDS.name]).trim(), source: 'stats',
      league: resolveLeague(row, teamLeague), age: nullableNumber(row[FIELDS.age]), position: String(row[FIELDS.position] || ''), minutes,
      statMetrics: metrics, provenance: { measured: true, provider: 'FBref', transport: 'soccerdata', columns: usedColumns(available) }
    };
  });
  return { signals, report: { input: dataset.players.length, kept: signals.length, skipped: dataset.players.length - signals.length, minimumMinutes, usedColumns: usedColumns(available), unavailableColumns: unavailableColumns(available) } };
}

// Prefer a populated league/competition field (case-insensitive). For missing rows,
// use a team lookup learned from populated rows. The harvested Big-5 snapshot has
// one entire null league cohort: its four populated league labels leave exactly
// GER-Bundesliga missing, so that label is assigned to the null-only team cohort.
// This inference is gated to the combined Big-5 dataset; otherwise it stays unknown.
function buildTeamLeagueLookup(dataset) {
  const lookup = new Map();
  const nullOnlyTeams = new Set();
  const observed = new Set();
  for (const row of dataset.players) {
    const team = normalizedText(row.team);
    const league = directLeague(row);
    if (!team) continue;
    if (league) { lookup.set(team, league); observed.add(league); }
    else nullOnlyTeams.add(team);
  }
  const canonical = ['ENG-Premier League', 'ESP-La Liga', 'FRA-Ligue 1', 'GER-Bundesliga', 'ITA-Serie A'];
  const missing = canonical.filter((league) => !observed.has(league));
  if (normalizedText(dataset.league) === 'big 5 european leagues combined' && missing.length === 1) {
    for (const team of nullOnlyTeams) if (!lookup.has(team)) lookup.set(team, missing[0]);
  }
  return lookup;
}
function resolveLeague(row, teamLeague) {
  return directLeague(row) || teamLeague.get(normalizedText(row.team)) || 'unknown';
}
function directLeague(row) {
  for (const [key, value] of Object.entries(row)) {
    if (!/^(league|competition|comp)$/i.test(key)) continue;
    const text = String(value == null ? '' : value).trim();
    if (text) return text;
  }
  return '';
}
function normalizedText(value) { return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' '); }

function performanceRate(row) { return number(row[FIELDS.goalsPer90]) * .6 + number(row[FIELDS.assistsPer90]) * .4; }
function percentileScores(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return values.map((value) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
    let end = lo; while (end < sorted.length && sorted[end] === value) end++;
    return sorted.length <= 1 ? 100 : round((((lo + end - 1) / 2) / (sorted.length - 1)) * 100);
  });
}
function usedColumns(available) { return Object.values(FIELDS).filter((v, i, a) => available.has(v) && a.indexOf(v) === i); }
function unavailableColumns(available) { return [FIELDS.xG, FIELDS.xAG, FIELDS.progressivePasses, FIELDS.progressiveCarries].filter(x => !available.has(x)); }
function optional(row, available, key) { return available.has(key) ? nullableNumber(row[key]) : null; }
function parseJson(text) { try { return JSON.parse(text); } catch (_) { throw new TypeError('invalid FBref JSON'); } }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function nullableNumber(value) { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function finiteNonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new TypeError(label + ' must be a non-negative finite number'); return value; }
function round(n) { return Math.round(n * 100) / 100; }
function slug(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'; }

module.exports = { loadFbrefDataset, fbrefToSignals, buildTeamLeagueLookup, FIELDS };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('node:assert');
  const columns = ['player','team','league','age','pos','Playing Time_Min','Performance_Gls','Performance_Ast','Per 90 Minutes_Gls','Per 90 Minutes_Ast','Per 90 Minutes_G+A'];
  const data = { league:'Big 5 European Leagues Combined', columns, playerCount: 5, players: [
    { player:'A',team:'T',league:'L',age:20,pos:'FW','Playing Time_Min':900,'Performance_Gls':9,'Performance_Ast':0,'Per 90 Minutes_Gls':.9,'Per 90 Minutes_Ast':0,'Per 90 Minutes_G+A':.9 },
    { player:'B',team:'T',league:'L',age:21,pos:'MF','Playing Time_Min':800,'Performance_Gls':0,'Performance_Ast':8,'Per 90 Minutes_Gls':0,'Per 90 Minutes_Ast':.9,'Per 90 Minutes_G+A':.9 },
    { player:'Failing shape',team:'Known Team',league:null,age:22,pos:'FW','Playing Time_Min':700,'Performance_Gls':2,'Performance_Ast':0,'Per 90 Minutes_Gls':.25,'Per 90 Minutes_Ast':0,'Per 90 Minutes_G+A':.25 },
    { player:'Lookup source',team:'Known Team',league:'FRA-Ligue 1',age:24,pos:'DF','Playing Time_Min':40,'Performance_Gls':0,'Performance_Ast':0,'Per 90 Minutes_Gls':0,'Per 90 Minutes_Ast':0,'Per 90 Minutes_G+A':0 },
    { player:'Unresolvable',team:'Nowhere',league:null,age:19,pos:'FW','Playing Time_Min':800,'Performance_Gls':2,'Performance_Ast':0,'Per 90 Minutes_Gls':.2,'Per 90 Minutes_Ast':0,'Per 90 Minutes_G+A':.2 }
  ] };
  const out = fbrefToSignals(data);
  assert.deepStrictEqual(out.report.input, 5); assert.strictEqual(out.report.kept, 4); assert.strictEqual(out.report.skipped, 1);
  assert.strictEqual(out.signals.find(x => x.name === 'Failing shape').league, 'FRA-Ligue 1');
  assert.strictEqual(out.signals.find(x => x.name === 'Unresolvable').league, 'unknown');
  assert(out.signals.every(x => x.provenance.measured && x.statMetrics.xG === null));
  assert.deepStrictEqual(fbrefToSignals(data), out); assert.throws(() => loadFbrefDataset([]), TypeError);
  console.log('OK fbrefAdapter; direct/case-insensitive/team-derived league resolution; unresolvable stays unknown; deterministic');
}
