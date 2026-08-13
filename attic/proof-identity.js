'use strict';

const assert = require('assert');
const dataset = require('./data/offball_identities.json');
const { loadIdentities, rankIdentities, PENALTY_WEIGHT } = require('./lib/identityProfiles.js');

const identities = loadIdentities(dataset);
const ranked = rankIdentities(identities);
const multi = ranked.filter(row => !row.singleClip);

console.log(`Consistency weighting: mean - ${PENALTY_WEIGHT}*std (documented choice; not tuned)`);
console.log('Top 10 multi-clip identities:');
multi.slice(0, 10).forEach((row, i) => {
  console.log(`${i + 1}. game ${row.gameID} ${row.team} #${row.jersey} | ${row.clips} clips, ${row.secondsTotal.toFixed(1)}s | ${row.offBallZMean.toFixed(3)}±${row.offBallZStd.toFixed(3)} | weighted=${row.weightedScore.toFixed(4)}${row.lowEvidence ? ' LOW EVIDENCE' : ''}`);
});

let inversion = null;
for (const lowerMean of multi) {
  const higherMean = multi.find(row =>
    row.offBallZMean > lowerMean.offBallZMean &&
    row.offBallZStd > lowerMean.offBallZStd &&
    row.weightedScore < lowerMean.weightedScore
  );
  if (higherMean) {
    inversion = { lowerMean, higherMean };
    break;
  }
}
assert(inversion, 'a consistency inversion must exist in the real dataset');
assert(inversion.lowerMean.weightedScore > inversion.higherMean.weightedScore);
console.log('Inversion example:');
console.log(`game ${inversion.lowerMean.gameID} ${inversion.lowerMean.team} #${inversion.lowerMean.jersey} (${inversion.lowerMean.offBallZMean.toFixed(3)}±${inversion.lowerMean.offBallZStd.toFixed(3)} => ${inversion.lowerMean.weightedScore.toFixed(4)}) outranks game ${inversion.higherMean.gameID} ${inversion.higherMean.team} #${inversion.higherMean.jersey} (${inversion.higherMean.offBallZMean.toFixed(3)}±${inversion.higherMean.offBallZStd.toFixed(3)} => ${inversion.higherMean.weightedScore.toFixed(4)})`);

const firstSingle = ranked.findIndex(row => row.singleClip);
assert(firstSingle === -1 || ranked.slice(0, firstSingle).every(row => !row.singleClip));
assert(firstSingle === -1 || ranked.slice(firstSingle).every(row => row.singleClip));
for (const single of ranked.filter(row => row.singleClip)) {
  assert(!multi.some(row => row.weightedScore >= single.weightedScore && ranked.indexOf(single) < ranked.indexOf(row)));
}
assert.deepStrictEqual(rankIdentities(identities), ranked);
console.log('Assertions: inversion=PASS; single-clip separation=PASS; determinism=PASS');
