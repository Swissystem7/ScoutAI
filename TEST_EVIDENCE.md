# Test evidence

Commands from the repository root:

```text
npm test
```

That runs `node --test`, which discovers every `test/*.test.js`.

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

## Headless phone smoke test

`test/smoke.test.js` opens `index.html` in headless Chromium at a 390×844 viewport. The page is served from
`127.0.0.1` and the test fails on any request that leaves that host, so the run needs no network of its own;
only downloading the browser does, which is why Playwright is not a dependency of this repository and the test
skips when the browser is missing. CI runs it in the `smoke` job of `validate.yml` with
`SCOUTAI_SMOKE_REQUIRED=1`, which turns that skip into a failure.

```text
npm install --no-save playwright
npx playwright install chromium
npm run smoke
```

Recorded on 2026-10-10:

```text
npm run smoke
tests 6
pass 6
fail 0
```

It fails the build on a console error, an uncaught exception, a failed or off-host request, a document that
scrolls sideways at 390px, a box that escapes the viewport outside a scroller, a control smaller than 24px on
either axis, or a live formula whose weight is reordered away from its component.

On the commit before this one it reported two real defects, both fixed here:

- `#normPos` and `#userAttest` were 13×13 CSS pixels while the page's own CSS gives every other control
  `min-height:44px`
- the live formula `ציון = (40×Grit + 30×Involvement + 30×Clutch) / 100` was dropped into an RTL paragraph as
  plain text, so bidi reordering rendered it `(Grit + 30×Involvement + 30×Clutch×40) = ציון`; the expression
  after the `=` is now isolated with `<bdi dir="ltr">`, in the lab line and in both lesson check lists
