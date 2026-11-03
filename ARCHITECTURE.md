# ScoutAI architecture

ScoutAI is a static, Hebrew RTL teaching lab. It shows how a composite football metric
(`Impact = 0.4×Grit + 0.3×Involvement + 0.3×Clutch`) is built from StatsBomb Open Data
(FIFA World Cup 2018 aggregates). There is no server, no build step, no runtime dependency,
no account and no network call except the relative `fetch` of the bundled dataset.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The main lab page (lesson, builder, explorer, validation, radar, BYOD, export). Inline UI script; all logic comes from `demo.js`. |
| `demo.js` | The whole domain layer, as a UMD module: `window.ScoutAIDemo` in the browser, `require('./demo.js')` in Node. Pure functions except `loadLabSources`, which takes a `fetch`. |
| `trap/index.html` + `trap.js` | The "convincing features trap" page: why an invented feature plus a tuned weight can manufacture any winner. Also UMD, no network. |
| `licence.html`, `offer.html` | Static pages: what the StatsBomb licence allows, and the workshop offer (no form, no payment). |
| `data/wc2018_event_aggregates.json` | The only data layer the lab loads. Per-player counts from 64 matches. |
| `data/user-dataset.example.json` | Synthetic example for "bring your own data". |
| `tools/pr-size.js` | Factory helper: weighs a diff against a 400-line PR budget and proposes a split (`npm run pr-size`). |
| `test/*.test.js` | Node built-in test runner suites. Pages are tested by reading their HTML as text. |
| `attic/` | Old proof scripts and research notes. Not part of the demo, not reproducible, not evidence. |

## Data flow (`demo.js`)

1. **Load**: `loadLabSources(fetch)` reads `data/wc2018_event_aggregates.json`. A user file instead goes
   through the BYOD path: `detectCsvDelimiter` / `parseCsvRecords` / `csvNumber` / header aliases
   (FBref, Opta, Hebrew), then audits (missing minutes, summary rows, duplicate names, minutes threshold).
   A file that looks like Open Data is rejected in BYOD mode (licence).
2. **Store**: `createStore(rows)` prepares each player once (`preparePlayer`: per-90 values, caps, 0–100 scale).
3. **Score**: `applyMetric(dataset, spec, baselineSpec)` applies the weights and minutes floor, optionally
   normalises by position (`normalizeByPosition`, percentiles), and attaches deltas against the 40/30/30 baseline.
4. **Views**, all derived from the same store: lesson (`buildLesson`), event explorer, glossary, validation
   (`validateMetric`: Spearman on World Cup groups A–D vs E–H), fragility (`fragilityReport`), radar
   (`buildCompareRadar`), exercise and course checks, export (`exportMetricBundle`, CSV with provenance).
5. **State**: the metric spec lives in the URL hash (`serializeMetricHash` / `parseMetricHash`).

Every number shown must be traceable to a field in the active file; source labels
(`STATSBOMB_OPEN_DATA`, `USER_LICENSED_DATA`, synthetic) follow the active layer.

## Run and test

```sh
npm ci          # no dependencies; installs nothing, but verifies the lockfile
npm test        # node --test: runs every test/*.test.js
npx --yes http-server -p 8080 .   # or: python -m http.server 8080
```

Then open `http://localhost:8080/`. Opening `index.html` from `file://` does not work, because the
relative `fetch` of the dataset is blocked there.

CI (`.github/workflows/validate.yml`) runs `npm ci` and `npm test` on Node 22, Ubuntu. Development also
happens on Windows: files are stored with LF in git and checked out with CRLF (`core.autocrlf=true`);
the CSV parser and `tools/pr-size.js` accept both.
