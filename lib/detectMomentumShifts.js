'use strict';
/*
 * ScoutAI / detectMomentumShifts.js  (Node >=18, zero deps, pure & deterministic)
 *
 * HEURISTIC / NARRATIVE LAYER — read before trusting the numbers.
 * The momentum "small-moments" model below (counter-press regains, efficacy
 * spirals, resilient-response vs head-drop, gegenpress flow) uses tunable
 * research-flavoured weights (windowSec, lambda, swings, thresholds). They are
 * a narrative scoring layer for scouting intuition, NOT a validated predictor
 * of match outcome. Every knob is an `opts` field precisely because it is meant
 * to be re-tuned, not because a value has been proven. This is the momentum
 * sibling of ScoutAI's chochmat-panim face-energy layer, which is likewise an
 * explicit heuristic/folk-physiognomy narrative — not science, not prediction.
 * Treat all swings as directional storytelling, not calibrated probabilities.
 */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (x, d) => (Number.isFinite(x) ? x : d);
const round4 = (x) => {
  const r = Math.round(x * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
};

// Exported value table: type -> { category, value(event, opts) }
const EVENT_VALUES = {
  pass:         { category: 'attack',  value: (e, o) => clamp(num(e.xtDelta, 0), -o.clipXt, o.clipXt) },
  carry:        { category: 'attack',  value: (e, o) => clamp(num(e.xtDelta, 0), -o.clipXt, o.clipXt) },
  shot:         { category: 'attack',  value: (e)    => clamp(num(e.xg, 0.05), 0, 1) },
  goal:         { category: 'attack',  value: ()     => 0.30 },
  turnover:     { category: 'attack',  value: ()     => -0.02 },
  tackle:       { category: 'defense', value: ()     => 0.015 },
  interception: { category: 'defense', value: ()     => 0.015 },
  recovery:     { category: 'defense', value: ()     => 0.020 },
  pressure:     { category: 'defense', value: ()     => 0.008 },
  duelWon:      { category: 'effort',  value: ()     => 0.010 },
  sprint:       { category: 'effort',  value: ()     => 0.005 },
  recoveryRun:  { category: 'effort',  value: ()     => 0.005 },
  save:         { category: 'none',    value: ()     => 0 },
  redCard:      { category: 'none',    value: ()     => 0 },
};

function detectMomentumShifts(events, opts = {}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');

  const w = { alpha: 1.0, beta: 0.8, gamma: 0.6, ...(opts.weights || {}) };
  const o = {
    windowSec: 240, lambdaPerMin: 0.25, clipXt: 0.1, flipThreshold: 0.05,
    earlyMinuteCutoffSec: 900, counterPressSec: 8, teamOf: null,
    ...opts,
    weights: w,
  };

  events.forEach((e) => {
    if (e == null || typeof e !== 'object') throw new TypeError('event must be an object');
    if (!Number.isFinite(e.ts) || e.ts < 0) throw new TypeError('event.ts must be a finite number >= 0');
    if (typeof e.playerId !== 'string') throw new TypeError('event.playerId must be a string');
    if (typeof e.type !== 'string') throw new TypeError('event.type must be a string');
  });

  // Stable sort a COPY by (ts, original index). Original never mutated.
  const sorted = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.ts - b.e.ts || a.i - b.i)
    .map((x) => x.e);

  // ---- byPlayer: whole-match, no decay ----
  const byPlayer = {};
  const sums = {};
  for (const e of sorted) {
    if (!(e.playerId in byPlayer)) byPlayer[e.playerId] = 0; // entry even for ignored/trigger-only
    const def = EVENT_VALUES[e.type];
    if (!def || def.category === 'none') continue;
    const s = sums[e.playerId] || (sums[e.playerId] = { attack: 0, defense: 0, effort: 0 });
    s[def.category] += def.value(e, o);
  }
  for (const id in byPlayer) {
    const s = sums[id] || { attack: 0, defense: 0, effort: 0 };
    byPlayer[id] = round4(w.alpha * s.attack + w.beta * s.defense + w.gamma * s.effort);
  }

  // ---- shift triggers (ts order) ----
  const pTs = {};
  for (const e of sorted) (pTs[e.playerId] || (pTs[e.playerId] = [])).push(e.ts);

  const lambda = o.lambdaPerMin / 60;
  const maxTs = sorted.length ? sorted[sorted.length - 1].ts : 0;
  let lastTurnoverTs = -Infinity;
  const seenDuel = new Set();
  const raw = [];
  let prevM = null;

  for (let idx = 0; idx < sorted.length; idx++) {
    const e = sorted[idx];
    const t = e.ts;
    const type = e.type;

    if (type === 'goal') raw.push({ at: t, trigger: 'goal', playerId: e.playerId, swing: 1.0 });
    if (type === 'redCard') raw.push({ at: t, trigger: 'redCard', playerId: e.playerId, swing: -0.8 });
    if (type === 'save' && Number.isFinite(e.xg) && e.xg >= 0.3)
      raw.push({ at: t, trigger: 'bigSave', playerId: e.playerId, swing: 0.5 });
    if ((type === 'recovery' || type === 'tackle') && (t - lastTurnoverTs) <= o.counterPressSec)
      raw.push({ at: t, trigger: 'counterPress', playerId: e.playerId, swing: 0.2 });
    if (type === 'duelWon' && t <= o.earlyMinuteCutoffSec && !seenDuel.has(e.playerId))
      raw.push({ at: t, trigger: 'earlyDuel', playerId: e.playerId, swing: 0.1 });
    if (type === 'duelWon') seenDuel.add(e.playerId);

    if (type === 'shot' && Number.isFinite(e.xg) && e.xg >= 0.3 && !e.isGoal && maxTs >= t + 300) {
      const arr = pTs[e.playerId];
      const before = arr.filter((x) => x >= t - 300 && x < t).length;
      const after = arr.filter((x) => x > t && x <= t + 300).length;
      if (after >= before) raw.push({ at: t, trigger: 'resilientResponse', playerId: e.playerId, swing: 0.15 });
      else raw.push({ at: t, trigger: 'headDrop', playerId: e.playerId, swing: -0.15 });
    }

    // ponytail: O(n^2) trailing-window scan; fine for match-length logs, swap to
    // a decayed running accumulator if events ever get huge.
    if (o.teamOf) {
      let M = 0;
      for (let j = idx; j >= 0; j--) {
        const ev = sorted[j];
        if (t - ev.ts > o.windowSec) break;
        const def = EVENT_VALUES[ev.type];
        const v = def ? def.value(ev, o) : 0;
        const decay = Math.exp(-lambda * (t - ev.ts));
        const team = o.teamOf[ev.playerId];
        if (team === 'A') M += v * decay;
        else if (team === 'B') M -= v * decay;
      }
      if (prevM !== null) {
        const dM = M - prevM;
        if (Math.sign(M) * Math.sign(prevM) < 0 && Math.abs(dM) >= o.flipThreshold)
          raw.push({ at: t, trigger: 'flowFlip', playerId: e.playerId, swing: clamp(dM / 0.2, -1, 1) });
      }
      prevM = M;
    }

    if (type === 'turnover') lastTurnoverTs = t; // after counterPress check
  }

  // Dedupe: at most one per (trigger, playerId) per 60s, keep first (anchor to last kept).
  const lastKept = {};
  const shifts = [];
  for (const s of raw) {
    const key = s.trigger + '|' + s.playerId;
    if (key in lastKept && s.at - lastKept[key] < 60) continue;
    lastKept[key] = s.at;
    shifts.push(s);
  }

  return { shifts, byPlayer };
}

module.exports = { detectMomentumShifts, EVENT_VALUES };

// ---- self-check: node scout-detectMomentumShifts.js --selftest ----
if (process.argv.includes('--selftest')) {
  const assert = require('node:assert');

  // PROOF fixture: 12 events, turnover@100 + recovery@105 => counterPress@105.
  const fx = [
    { ts: 10,  playerId: 'p1', type: 'pass', xtDelta: 0.03 },
    { ts: 20,  playerId: 'p1', type: 'duelWon' },
    { ts: 30,  playerId: 'p2', type: 'pressure' },
    { ts: 40,  playerId: 'p1', type: 'tackle' },
    { ts: 100, playerId: 'p2', type: 'turnover' },
    { ts: 105, playerId: 'p1', type: 'recovery' },
    { ts: 200, playerId: 'p1', type: 'goal' },
    { ts: 210, playerId: 'p2', type: 'save', xg: 0.4 },
    { ts: 260, playerId: 'p1', type: 'carry', xtDelta: 0.5 }, // clamps to clipXt 0.1
    { ts: 300, playerId: 'p2', type: 'interception' },
    { ts: 320, playerId: 'p1', type: 'sprint' },
    { ts: 340, playerId: 'p2', type: 'weirdUnknownType' },    // ignored
  ];
  const snapshot = JSON.stringify(fx);
  const r = detectMomentumShifts(fx);

  // 1) PROOF: counterPress at 105
  assert.ok(
    r.shifts.some((s) => s.at === 105 && s.trigger === 'counterPress' && s.playerId === 'p1' && s.swing === 0.2),
    'expected counterPress @105'
  );
  // 2) goal => swing 1.0
  assert.ok(
    r.shifts.some((s) => s.at === 200 && s.trigger === 'goal' && s.swing === 1.0),
    'expected goal swing 1.0'
  );
  // 3) byPlayer hand-computed
  // p1: attack .03+.30+.10=.43 | def .015+.020=.035 | eff .010+.005=.015
  //     1*.43 + .8*.035 + .6*.015 = .467
  // p2: attack -.02 | def .008+.015=.023 | eff 0 => -.02 + .8*.023 = -.0016
  assert.strictEqual(r.byPlayer.p1, 0.467, 'p1 contribution');
  assert.strictEqual(r.byPlayer.p2, -0.0016, 'p2 contribution');
  // input not mutated
  assert.strictEqual(JSON.stringify(fx), snapshot, 'input mutated');

  // 4) empty
  assert.deepStrictEqual(detectMomentumShifts([]), { shifts: [], byPlayer: {} });

  // 5) single goal
  const one = detectMomentumShifts([{ ts: 5, playerId: 'x', type: 'goal' }]);
  assert.deepStrictEqual(one.shifts, [{ at: 5, trigger: 'goal', playerId: 'x', swing: 1.0 }]);
  assert.strictEqual(one.byPlayer.x, 0.3);

  // 6) unknown type: entry exists, no shift, contribution 0
  const unk = detectMomentumShifts([{ ts: 1, playerId: 'y', type: 'foo' }]);
  assert.deepStrictEqual(unk, { shifts: [], byPlayer: { y: 0 } });

  // determinism
  assert.deepStrictEqual(detectMomentumShifts(fx), detectMomentumShifts(fx));

  console.log('OK');
}
