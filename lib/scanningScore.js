'use strict';
// scanningScore — the science-backed "hidden ability" metric (Geir Jordet's scanning research):
// how often a player scans (head turns to gather info) BEFORE receiving the ball predicts
// elite level and pass success (J. Sports Sciences 2021; De Bruyne/Lampard = super-scanners).
// Input = scan events extracted upstream (CV head-orientation or manual clip tagging).
// This replaces face-reading as the perception layer: observed behavior, legally safe, real evidence.
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const r2 = (x) => Math.round(x * 100) / 100;

// receptions: [{ts:ms, scansBefore:int (head turns in windowMs before receiving), outcome:'kept'|'lost'|'forward' optional}]
// opts: {windowMs default 10000, eliteRate default 0.62 scans/sec*10 => ~6.2/10s per Jordet elite midfielders — calibration knob}
function scanningScore(receptions, opts = {}) {
  if (!Array.isArray(receptions)) throw new TypeError('scanningScore: receptions must be an array');
  const windowSec = (Number(opts.windowMs) > 0 ? opts.windowMs : 10000) / 1000;
  const eliteRate = Number(opts.eliteRate) > 0 ? opts.eliteRate : 0.62; // scans/sec of elite benchmark
  const valid = receptions.filter((r) => r && Number.isInteger(r.scansBefore) && r.scansBefore >= 0);
  if (!valid.length) return { score: null, confidence: 0, scansPerSec: null, receptions: 0, note: 'no valid scan data' };

  const rates = valid.map((r) => r.scansBefore / windowSec);
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  // score: linear vs elite benchmark, capped at 100 (above-elite stays 100)
  const score = r2(clamp((avgRate / eliteRate) * 100, 0, 100));
  // consistency bonus signal: share of receptions with at least 2 scans (Jordet: scan EVERY reception matters)
  const habitual = r2(valid.filter((r) => r.scansBefore >= 2).length / valid.length);
  // outcome link when outcomes exist: pass-keep rate among high-scan vs low-scan receptions
  let outcomeLift = null;
  const withOutcome = valid.filter((r) => r.outcome);
  if (withOutcome.length >= 10) {
    const hi = withOutcome.filter((r) => r.scansBefore >= 2);
    const lo = withOutcome.filter((r) => r.scansBefore < 2);
    const keep = (arr) => arr.length ? arr.filter((r) => r.outcome !== 'lost').length / arr.length : null;
    const kh = keep(hi), kl = keep(lo);
    if (kh !== null && kl !== null) outcomeLift = r2(kh - kl);
  }
  // confidence grows with sample size, full at 30+ receptions
  const confidence = r2(clamp(valid.length / 30, 0, 1));
  return {
    score, scansPerSec: r2(avgRate), habitualScanRate: habitual, outcomeLift,
    receptions: valid.length, confidence,
    note: 'Jordet-based: pre-reception visual scanning; observed behavior, not biometrics',
  };
}
module.exports = { scanningScore };

if (require.main === module && process.argv.includes('--selftest')) {
  const a = require('assert');
  const mk = (n, scans, outcome) => Array.from({ length: n }, (_, i) => ({ ts: i * 60000, scansBefore: scans, outcome }));
  const scanner = scanningScore([...mk(20, 7, 'kept'), ...mk(10, 5, 'forward')]);   // ~0.65/sec — elite
  const rusher = scanningScore([...mk(20, 1, 'lost'), ...mk(10, 0, 'lost')]);        // barely scans
  a.ok(scanner.score > 90 && rusher.score < 25, `elite ${scanner.score} vs rusher ${rusher.score}`);
  a.ok(scanner.confidence === 1 && scanner.receptions === 30);
  const lift = scanningScore([...mk(15, 3, 'kept'), ...mk(15, 0, 'lost')]);
  a.ok(lift.outcomeLift === 1, `outcomeLift ${lift.outcomeLift}`); // perfect separation in synthetic data
  a.deepStrictEqual(scanningScore([]).score, null);
  a.throws(() => scanningScore('x'));
  const junk = scanningScore([{ scansBefore: 2.5 }, { scansBefore: -1 }, null]);
  a.strictEqual(junk.score, null); // non-integer/negative/null all rejected
  console.log('OK', scanner.score, 'vs', rusher.score);
}
