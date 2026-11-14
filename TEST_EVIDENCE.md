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

The suite covers:

- every shipped World Cup 2018 score equals `compositeScore(componentsFromEvents(fileRow))`
- Kanté pressures 183 / 621 minutes / 26.52 per 90 / cap 100, read from the JSON
- BYOD lesson/explorer never claim the World Cup file
- Spearman holdout is a group split in the same tournament, not a later season
- curriculum graduates only on honest answers
- trap lesson uses archived hand-typed numbers, not a face model
- `.github/workflows/` holds only `validate.yml`, which runs the suite and never merges, force-pushes or deploys; no product-root `lib/`, no broken `proof-*.js` at the root
- Hebrew RTL, skip links, slider `aria-valuetext`, no `http(s)` in the product runtime

## 2026-11-14 — basketball lab

`npm test` now runs `node --test`, which picks up every file under `test/`, including `test/basketball.test.js`:

```text
node --test
tests 185
pass 185
fail 0
```

The basketball tests cover:

- a user CSV needs the licence checkbox; the synthetic example is labelled `SYNTHETIC_EXAMPLE`
- Basketball-Reference and Hebrew headers, clock minutes (32:15), per-game files with G turned into totals, TOT / 2TM traded-player rows counted once, summary rows / repeated headers / `-` cells / bad and negative numbers reported
- the component recipe (TS% with 0.44 × FTA; defense from steals and blocks; rebounding 60% ORB / 40% DRB as BPM 2.0 values ORB higher), open fallbacks when TOV / FGA / ORB / DRB are missing, the 24/20/24/32 and 250-minute defaults (Four Factors rebounding share, the old 30/30/40 kept inside the rest)
- game logs (a Round / מחזור column): summed to a season, a player who moved team counted once, rows without a round reported; the start-of-season test computes the metric only on the early rounds and the target only on the later ones, detects a lasting skill, stays in the noise when later form is scrambled, reports an unknown or low-minute target player, splits by default at about a quarter of the season, and the synthetic game log (80 players, 14 rounds) is deterministic
- the team split keeps each team on one side with equal halves, and validation always says "same season"
- PanimGuide stays inside the shuffle noise band on every outcome of the synthetic file, the permutation test does catch a planted signal, and the spelling probe shows the score is read from the name
- "new line" columns (body-language coding, fWHR, touches): numeric extras become candidates, text and box-score % columns do not; per-40 conversion; partial ρ removes what the metric explains; on the synthetic file the random line is noise and the planted line is caught raw but adds nothing beyond the metric; a line with information the metric lacks is reported as adding it; a column is never tested against itself
- the page is Hebrew RTL with skip links, a live status and cited sources; its runtime has no outbound network and its only external links are the citations
