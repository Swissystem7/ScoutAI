'use strict';

const assert = require('node:assert');
const { countByPosition } = require('./countByPosition.js');

// normal
assert.deepStrictEqual(
  countByPosition([
    { position: 'GK' },
    { position: 'DEF' }, { position: 'DEF' },
    { position: 'MID' }, { position: 'MID' }, { position: 'MID' },
    { position: 'FWD' },
  ]),
  { GK: 1, DEF: 2, MID: 3, FWD: 1 }
);

// non-array -> all zeros
const zeros = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
assert.deepStrictEqual(countByPosition(null), zeros);
assert.deepStrictEqual(countByPosition(undefined), zeros);
assert.deepStrictEqual(countByPosition('GK'), zeros);
assert.deepStrictEqual(countByPosition({}), zeros);
assert.deepStrictEqual(countByPosition(42), zeros);

// empty array -> all zeros
assert.deepStrictEqual(countByPosition([]), zeros);

// unknown / missing positions ignored
assert.deepStrictEqual(
  countByPosition([
    { position: 'REF' },
    { position: '' },
    {},
    { position: null },
    null,
    undefined,
    { position: 'gk' }, // case-sensitive, not counted
    { position: 'GK' },
  ]),
  { GK: 1, DEF: 0, MID: 0, FWD: 0 }
);

// prototype keys must not be counted (e.g. 'toString')
assert.deepStrictEqual(
  countByPosition([{ position: 'toString' }, { position: 'constructor' }]),
  zeros
);

console.log('ok');
