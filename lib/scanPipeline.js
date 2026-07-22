'use strict';

const { scientificUpsideIndex, _fuse } = require('./scientificUpsideIndex.js');
const { scoutUpsideIndex } = require('./scoutUpsideIndex.js');
const { statSignatureScore } = require('./statSignatureScore.js');
const { impactScore } = require('./impactScore.js');
const { scanningScore } = require('./scanningScore.js');
const { faceEnergyProfile } = require('./faceEnergyProfile.js');
const { geneticPropensityScore } = require('./geneticPropensityScore.js');
const { detectMomentumShifts } = require('./detectMomentumShifts.js');
const { leagueStrength } = require('./leagueStrength.js');
const { rankProspects } = require('./rankProspects.js');
const { computePlayerValueIndex } = require('./computePlayerValueIndex.js');
const { rankByUndervaluedUpside } = require('./rankByUndervaluedUpside.js');
const { findTopProspects } = require('./findTopProspects.js');

/**
 * @typedef {Object} PlayerSignal
 * @property {string} name
 * @property {string} [league]
 * @property {'stats'|'video'|'story'} source
 * @property {number} [statScore] 0..100
 * @property {Object} [statMetrics]
 * @property {number} [momentum] 0..100
 * @property {Object} [scanning]
 * @property {Object} [energyFeatures]
 * @property {Object} [videoSignals]
 */

const MODES = new Set(['prove', 'rank', 'scout', 'check']);
const DEFAULT_BENCHMARKS = Object.freeze({ goalsAvg: 4, assistsAvg: 4, passesCompletedAvg: 500, keyPassesAvg: 25, dribblesAvg: 35, speed90thPercentileAvg: 30, defensiveActionsAvg: 80 });

function runScan(players, config) {
  if (!Array.isArray(players)) throw new TypeError('players must be an array');
  if (!config || !MODES.has(config.mode)) throw new TypeError('mode must be prove|rank|scout|check');
  const opts = config.opts || {};
  const prepared = players.map((player, index) => prepare(player, index, opts));
  const board = rankBoard(prepared, opts);
  if (config.mode === 'rank') return { mode: 'rank', board, total: board.length, primary: 'measured statistics' };
  if (config.mode === 'prove') return prove(board, opts);
  if (config.mode === 'scout') return scout(board, opts);
  return check(board, players, opts);
}

function prepare(input, index, opts) {
  if (!input || typeof input !== 'object') throw new TypeError('player at index ' + index + ' must be an object');
  if (typeof input.name !== 'string' || !input.name.trim()) throw new TypeError('player at index ' + index + ' requires name');
  if (!['stats', 'video', 'story'].includes(input.source)) throw new TypeError(input.name + ': invalid source');
  const statScore = bounded(input.statScore, input.name + '.statScore', true);
  const momentum = bounded(input.momentum, input.name + '.momentum', true);
  const strength = Number.isFinite(input.leagueStrength) ? clamp(input.leagueStrength, 0.3, 1) : leagueStrength(input.league || '').strength;
  const player = toScientificPlayer(input, index);

  let statResult = null, scientific = null, impact = null, scan = null, face = null, genetic = null, shifts = null;
  if (input.statMetrics) {
    statResult = statSignatureScore(player, { leagueStrength: strength });
    scientific = scientificUpsideIndex(player, { leagueStrength: strength, includeNarrative: !!input.energyFeatures });
    impact = impactScore(player);
  }
  if (input.scanning && Array.isArray(input.scanning.receptions)) scan = scanningScore(input.scanning.receptions);
  if (input.energyFeatures) face = faceEnergyProfile(input.energyFeatures);
  genetic = geneticPropensityScore(player.subject || {});
  if (Array.isArray(input.events)) shifts = detectMomentumShifts(input.events);

  const measuredValue = statResult ? statResult.score : (statScore === null ? 0 : statScore);
  const energy = face ? face.energy : videoEnergy(input.videoSignals);
  const inferredMomentum = momentum === null ? videoMomentum(input.videoSignals) : momentum;
  const heuristic = scoutUpsideIndex({ name: input.name, statScore: measuredValue, energy, momentum: inferredMomentum, context: { leagueTier: strengthToTier(strength) } });
  // Reuse scientificUpsideIndex's load-bearing honesty fusion: measured stats retain >=72%.
  const fused = scientific || _fuse({
    stat: { value: measuredValue, confidence: statScore === null ? 0 : 1 },
    genetic: { value: heuristic.index, confidence: hasInferred(input) ? 0.65 : 0 },
    narrative: null,
  }, false);
  const indexScore = round2(scientific ? scientific.index : clamp(fused.index, 0, 100));
  const conventional = conventionalValue(input, opts);
  return {
    id: input.id || slug(input.name) + '-' + index, name: input.name, source: input.source,
    league: input.league || 'unknown', leagueStrength: strength, lowVisibility: strength <= (opts.maxLeagueStrength || 0.65) || measuredValue <= (opts.maxStatScore || 45),
    index: indexScore, measuredValue, conventional, heuristicUpside: heuristic.index,
    contributions: {
      stat: { value: measuredValue, contribution: round2(indexScore * statWeight(fused)), tag: 'measured' },
      impact: { value: impact ? impact.score : null, tag: 'measured' },
      scanning: { value: scan ? scan.score : null, tag: input.scanning && input.scanning.measured ? 'measured' : 'inferred' },
      intangible: { value: heuristic.index, contribution: round2(indexScore * (1 - statWeight(fused))), tag: 'inferred', label: 'AI-inferred; secondary' },
    },
    diagnostics: { statSignature: statResult, scientific, impact, scanning: scan, faceEnergy: face, geneticPropensity: genetic, momentumShifts: shifts },
    _scientificInput: input.statMetrics ? player : null,
  };
}

function rankBoard(rows) {
  // Compose the canonical batch ranker where its rich-stat contract applies.
  const rich = rows.filter(r => r.diagnostics.scientific).map(r => r._scientificInput).filter(Boolean);
  if (rich.length) rankProspects(rich); // regression/integration call; normalized board below includes sparse records too.
  const undervalued = rankByUndervaluedUpside(rows.map(r => ({ id: r.id, potentialScore: r.index, currentStatScore: r.conventional })));
  const gaps = new Map(undervalued.map(r => [r.id, r.upsideScore]));
  return rows.slice().sort((a, b) => b.index - a.index || b.heuristicUpside - a.heuristicUpside || a.id.localeCompare(b.id)).map((r, i) => ({ ...withoutPrivate(r), rank: i + 1, valueGap: round2(gaps.get(r.id)) }));
}

function prove(board, opts) {
  const controlPattern = opts.controlPattern || /control|flashy/i;
  const control = board.find(p => controlPattern.test(p.name));
  const grinders = board.filter(p => p !== control && p.measuredValue < (control ? control.measuredValue : Infinity));
  const holds = !!control && grinders.length > 0 && grinders.every(p => p.heuristicUpside > control.heuristicUpside);
  return { mode: 'prove', board, assertion: { falsifiable: 'Every lower-stat grinder has a higher hidden-upside index than the flashy high-stat control.', holds, control: control && control.name, grinders: grinders.map(p => p.name) } };
}

function scout(board, opts) {
  const candidates = board.filter(p => p.lowVisibility);
  const ranked = rankByUndervaluedUpside(candidates.map(p => ({ id: p.id, potentialScore: p.heuristicUpside, currentStatScore: p.measuredValue })));
  const byId = new Map(board.map(p => [p.id, p]));
  const outliers = ranked.map((r, i) => ({ ...byId.get(r.id), scoutRank: i + 1, hiddenUpsideGap: r.upsideScore }));
  return { mode: 'scout', board, lowVisibilityCount: candidates.length, outliers, hiddenGem: outliers[0] || null, filter: { maxLeagueStrength: opts.maxLeagueStrength || 0.65, maxStatScore: opts.maxStatScore || 45 } };
}

function check(board, original) {
  const expected = original.filter(p => Number.isInteger(p.expectedRank)).slice().sort((a, b) => a.expectedRank - b.expectedRank);
  const actual = new Map(board.map(p => [p.name, p.rank]));
  const mismatches = expected.filter(p => actual.get(p.name) !== p.expectedRank).map(p => ({ name: p.name, expectedRank: p.expectedRank, actualRank: actual.get(p.name) }));
  return { mode: 'check', board, passed: expected.length > 0 && mismatches.length === 0, labeledPlayers: expected.length, mismatches, summary: expected.length ? `${expected.length - mismatches.length}/${expected.length} labeled ranks match; ${mismatches.length} regression(s).` : 'No expectedRank labels supplied.' };
}

function toScientificPlayer(input, index) {
  const p = { id: input.id || slug(input.name) + '-' + index, sport: input.sport || 'football', position: input.position || 'MF', age: input.age, minutes: input.minutes || 900, stats: input.statMetrics || {}, subject: input.subject || {} };
  return p;
}
function conventionalValue(input, opts) {
  if (!input.statMetrics) return input.statScore || 0;
  try { return computePlayerValueIndex(input.statMetrics, opts.benchmarks || DEFAULT_BENCHMARKS, opts.ageGroup || 'U20'); }
  catch (_) { return input.statScore || 0; }
}
function videoEnergy(v) { const x = v && Number(v.energy); return neutralEnergy(Number.isFinite(x) ? x * 100 : 50); }
function videoMomentum(v) { const x = v && Number(v.momentumInvolvement); return Number.isFinite(x) ? clamp(x * 100, 0, 100) : 50; }
function neutralEnergy(value) { return { drive: value, resilience: value, leadership: value, intensity: value, discipline: value, composure: value }; }
function hasInferred(p) { return !!(p.energyFeatures || p.videoSignals || p.source !== 'stats' || Number.isFinite(p.momentum)); }
function strengthToTier(s) { return clamp(Math.round(1 + (1 - s) * 10), 1, 8); }
function statWeight(fused) { return fused.breakdown ? fused.breakdown.stat.weight : (fused.weights && fused.weights.stat) || 1; }
function bounded(v, label, optional) { if (v === undefined && optional) return null; if (!Number.isFinite(v)) throw new TypeError(label + ' must be finite'); if (v < 0 || v > 100) throw new RangeError(label + ' out of [0,100]'); return v; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function round2(x) { return Math.round(x * 100) / 100; }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'; }
function withoutPrivate(r) { const out = { ...r }; delete out._scientificInput; return out; }

module.exports = { runScan };

if (require.main === module && process.argv.includes('--selftest')) selftest();
function selftest() {
  const assert = require('node:assert');
  const proof = require('../proof-demo.js').PLAYERS.map((p, i) => ({ id: 'proof-' + i, name: p.name, source: 'story', statScore: p.statScore, momentum: p.momentumRaw, energyFeatures: p.features, leagueStrength: i === 1 ? 0.3 : 0.6 }));
  assert.strictEqual(runScan(proof, { mode: 'prove' }).assertion.holds, true, 'proof assertion');
  const batch = syntheticBatch(50);
  const ranked = runScan(batch, { mode: 'rank' });
  assert.strictEqual(ranked.board.length, 50);
  assert(ranked.board.every((p, i, a) => i === 0 || a[i - 1].index >= p.index), 'sorted descending');
  const scouted = runScan(batch, { mode: 'scout' });
  assert.strictEqual(scouted.hiddenGem.name, 'Planted Hidden Gem');
  const checked = runScan(batch, { mode: 'check' });
  assert.strictEqual(checked.passed, false);
  assert(checked.mismatches.some(x => x.name === 'Mis-ranked Control'));
  assert.deepStrictEqual(runScan(batch, { mode: 'rank' }), ranked, 'deterministic');
  // Exercise findTopProspects adapter contract without replacing its scoring.
  const top = findTopProspects(['m1'], { minAge: 16, maxAge: 30, position: 'MF' }, 2, { m1: [{ playerId: 'x', secondsPlayed: 900, age: 20, position: 'MF', primaryStat: 9 }] });
  assert.strictEqual(top.prospects[0].playerId, 'x');
  console.log('OK all 4 modes; proof=3; synthetic=50; hiddenGem=Planted Hidden Gem; regressions=' + checked.mismatches.length);
}

function syntheticBatch(count) {
  const rows = [];
  for (let i = 0; i < count; i++) rows.push({ id: 'syn-' + i, name: 'Synthetic ' + i, source: 'stats', leagueStrength: 0.75 + (i % 5) * 0.05, statScore: 48 + (i * 17 % 38), momentum: 25 + (i * 13 % 45), expectedRank: i === 0 ? 1 : undefined });
  rows[7] = { id: 'gem', name: 'Planted Hidden Gem', source: 'video', leagueStrength: 0.3, statScore: 18, momentum: 100, videoSignals: { energy: 1, momentumInvolvement: 1 } };
  rows[0] = { id: 'bad-control', name: 'Mis-ranked Control', source: 'stats', leagueStrength: 1, statScore: 52, momentum: 20, expectedRank: 1 };
  return rows;
}
