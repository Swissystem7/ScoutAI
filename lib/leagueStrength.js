'use strict';
// League-strength coefficients for cross-competition comparison. Anchor: elite men's (WC/UCL) = 1.00.
// Also carries `category` (men/women) — different physical baselines MUST be ranked separately, not
// merged via a coefficient. Coefficients are a pragmatic proxy (UEFA-coefficient / Opta-Power-Ranking
// style); tune per real data. Unknown competition -> conservative 0.6, category 'unknown'.
const LEAGUE_TABLE = {
  WorldCup2022:       { strength: 1.00, category: 'men' },
  UCL_2018_19:        { strength: 1.00, category: 'men' },
  Bundesliga_2023_24: { strength: 0.95, category: 'men' },
  CopaAmerica2024:    { strength: 0.88, category: 'men' },
  FA_WSL_2023_24:     { strength: 0.90, category: 'women' },
};
function leagueStrength(label) {
  const e = LEAGUE_TABLE[label];
  return e ? { ...e } : { strength: 0.6, category: 'unknown' };
}
module.exports = { leagueStrength, LEAGUE_TABLE };

if (require.main === module && process.argv.includes('--selftest')) {
  const a = require('assert');
  a.strictEqual(leagueStrength('WorldCup2022').strength, 1.00);
  a.strictEqual(leagueStrength('FA_WSL_2023_24').category, 'women');
  a.strictEqual(leagueStrength('nope').strength, 0.6);
  a.strictEqual(leagueStrength('nope').category, 'unknown');
  console.log('OK');
}
