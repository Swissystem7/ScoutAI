# Test evidence

Commands from the repository root:

```text
npm test
```

That runs `node --test test/demo.test.js test/trap.test.js test/byod.test.js`.

Re-measured on 2026-09-24 with Node 22.22.2, on this branch (`npm test`):

```text
node --test test/demo.test.js test/trap.test.js test/byod.test.js
tests 69
pass 69
fail 0
```

(Earlier record, 2026-08-13 after the honesty pass: tests 48, pass 48, fail 0.)

The suite covers:

- every shipped World Cup 2018 score equals `compositeScore(componentsFromEvents(fileRow))`
- Kanté pressures 183 / 621 minutes / 26.52 per 90 / cap 100, read from the JSON
- BYOD lesson/explorer never claim the World Cup file
- Spearman holdout is a group split in the same tournament, not a later season
- curriculum graduates only on honest answers
- trap lesson uses archived hand-typed numbers, not a face model
- no `.github/workflows/`, no product-root `lib/`, no broken `proof-*.js` at the root
- Hebrew RTL, skip links, slider `aria-valuetext`, no `http(s)` in the product runtime
