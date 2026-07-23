'use strict';

const PENALTY_WEIGHT = 0.5; // Stated scientific choice; not fitted or tuned to this dataset.

function finite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
}

function loadIdentities(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray(json.identities)) {
    throw new TypeError('identity dataset must be an object with an identities array');
  }
  for (const [i, row] of json.identities.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError(`identities[${i}] must be an object`);
    for (const field of ['gameID', 'team', 'jersey']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) throw new TypeError(`identities[${i}].${field} must be a non-empty string`);
    }
    if (!/^\d+$/.test(row.jersey)) throw new TypeError(`identities[${i}].jersey must be numeric`);
    if (!Number.isInteger(row.clips) || row.clips < 1) throw new TypeError(`identities[${i}].clips must be a positive integer`);
    if (typeof row.singleClip !== 'boolean' || row.singleClip !== (row.clips === 1)) {
      throw new TypeError(`identities[${i}].singleClip must agree with clips`);
    }
    finite(row.offBallZMean, `identities[${i}].offBallZMean`);
    finite(row.closingZMean, `identities[${i}].closingZMean`);
    finite(row.secondsTotal, `identities[${i}].secondsTotal`);
    if (row.secondsTotal < 0) throw new TypeError(`identities[${i}].secondsTotal must be non-negative`);
    if (row.singleClip ? row.offBallZStd !== null : typeof row.offBallZStd !== 'number' || !Number.isFinite(row.offBallZStd) || row.offBallZStd < 0) {
      throw new TypeError(`identities[${i}].offBallZStd is invalid`);
    }
    if (!Array.isArray(row.actions) || row.actions.some(x => typeof x !== 'string')) {
      throw new TypeError(`identities[${i}].actions must be a string array`);
    }
  }
  return json.identities.map(row => ({ ...row, actions: row.actions.slice() }));
}

function rankIdentities(identities, opts = {}) {
  if (!Array.isArray(identities)) throw new TypeError('identities must be an array');
  if (opts.penaltyWeight !== undefined && opts.penaltyWeight !== PENALTY_WEIGHT) {
    throw new TypeError('penaltyWeight is fixed at 0.5 (documented, not tuned)');
  }
  const ranked = identities.map((row, index) => {
    loadIdentities({ identities: [row] });
    const penalty = row.singleClip ? null : PENALTY_WEIGHT * row.offBallZStd;
    return {
      ...row,
      penaltyWeight: PENALTY_WEIGHT,
      penalty,
      weightedScore: row.singleClip ? row.offBallZMean : row.offBallZMean - penalty,
      evidenceGroup: row.singleClip ? 'single-clip' : 'multi-clip',
      lowEvidence: row.singleClip || row.secondsTotal < 30,
      inputIndex: index
    };
  });
  // Single clips have no consistency estimate, so they are deliberately ranked
  // after every multi-clip profile instead of receiving an invented std/discount.
  return ranked.sort((a, b) =>
    Number(a.singleClip) - Number(b.singleClip) ||
    b.weightedScore - a.weightedScore ||
    b.secondsTotal - a.secondsTotal ||
    a.gameID.localeCompare(b.gameID) ||
    a.team.localeCompare(b.team) ||
    a.jersey.localeCompare(b.jersey, undefined, { numeric: true }) ||
    a.inputIndex - b.inputIndex
  ).map(({ inputIndex, ...row }) => row);
}

module.exports = { PENALTY_WEIGHT, loadIdentities, rankIdentities };

if (require.main === module && process.argv.includes('--selftest')) {
  const assert = require('assert');
  const rows = [
    { gameID: '8', team: 'left', jersey: '16', clips: 3, singleClip: false, offBallZMean: 1.19, offBallZStd: 1.17, closingZMean: 0.3, secondsTotal: 54, actions: ['Shot'] },
    { gameID: '8', team: 'right', jersey: '36', clips: 3, singleClip: false, offBallZMean: 1.15, offBallZStd: 0.31, closingZMean: 0.8, secondsTotal: 55, actions: ['Foul'] },
    { gameID: '8', team: 'left', jersey: '3', clips: 1, singleClip: true, offBallZMean: 4, offBallZStd: null, closingZMean: 1, secondsTotal: 8, actions: ['Shot'] }
  ];
  const loaded = loadIdentities({ identities: rows });
  const ranked = rankIdentities(loaded);
  assert.strictEqual(ranked[0].jersey, '36');
  assert.strictEqual(ranked[2].evidenceGroup, 'single-clip');
  assert.strictEqual(ranked[0].penalty, 0.155);
  assert.deepStrictEqual(rankIdentities(loaded), ranked);
  assert.throws(() => rankIdentities(loaded, { penaltyWeight: 0.49 }), TypeError);
  console.log('identityProfiles selftest: OK');
}
