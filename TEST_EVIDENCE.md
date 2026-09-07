# Test evidence

Commands from the repository root:

```text
npm test
```

That runs `node --test test/demo.test.js test/trap.test.js test/byod.test.js`.

Recorded on 2026-08-13 after the honesty pass (single data layer, no video theater, no factory `lib/`, BYOD provenance, shipped-file receipts):

```text
node --test test/demo.test.js test/trap.test.js test/byod.test.js
tests 48
pass 48
fail 0
```

After Stage A item א1-א6 (holdout reference baselines on bare BASE `29585295d1e7d6e4dc2031e666d7a724662cebf2`), re-recorded locally:

```text
node --test test/demo.test.js test/trap.test.js test/byod.test.js
tests 61
pass 61
fail 0
```

Known BASE numbers (DEFAULT_METRIC 40/30/30 vs assists, groups split, seed `scoutai-demo-001`): learner test ρ = 0.30 does **not** beat minutes-only ρ = 0.31; Hebrew verdict matches `/לא עוקף/`; defender-hint metric on the same fold yields negative ρ vs assists.

The suite covers:

- every shipped World Cup 2018 score equals `compositeScore(componentsFromEvents(fileRow))`
- Kanté pressures 183 / 621 minutes / 26.52 per 90 / cap 100, read from the JSON
- BYOD lesson/explorer never claim the World Cup file
- Spearman holdout is a group split in the same tournament, not a later season
- holdout baselines expose minutes-only ρ, best single component, and a seeded permutation null band on the same test fold
- curriculum holdout requires a beats/not-beats-minutes answer that matches live `baselines`
- curriculum graduates only on honest answers
- trap lesson uses archived hand-typed numbers, not a face model
- no `.github/workflows/`, no product-root `lib/`, no broken `proof-*.js` at the root
- Hebrew RTL, skip links, slider `aria-valuetext`, no `http(s)` in the product runtime

- position normalize uses mid-rank percentiles (`rankValues`); zero-tied blocks expose `tiedPeers` + `groupN` and land <=50 for Clutch
- `auditOutcome` measures Spearman vs scoring-input counts; |rho|>=0.95 => leaky; `duelsWon` identical to `tackles` on 605/605 rows
- BYOD coverage: missing count columns stay null; weights renormalize; missing outcome -> rho null
- curriculum per90/caps/fragility answers that finish Kante fail when the same sheet is evaluated for Kane
