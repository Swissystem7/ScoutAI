# data — files the live lab actually reads

| File | Used by | What it is |
| --- | --- | --- |
| `wc2018_event_aggregates.json` | `demo.js` → `loadLabSources` | StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). **Aggregated counts** from 64 matches, not an event-by-event log. Research / public sharing with credit; commercial use prohibited. |
| `user-dataset.example.json` | BYOD «טענו דוגמה סינתטית» | ~40 invented players (DF/MF/FW/GK; Hebrew names; teams א–ח) so the full 8-step course completes on the legal synthetic layer. File-derived caps: ceiling touch counts as capped. Not match data and not Open Data. |
| `user-dataset.template.csv` | BYOD column-mapping demo | Sample headers `Player` / `Minutes played` / `xG` (and two same-name rows) for `mapUserColumns` + typed numbers. Not match data. |

Every on-screen Open Data number is a field on `players[]` in `wc2018_event_aggregates.json`, or a `/90` / cap / weight derived from that field. Minutes are a lineup/substitution proxy (`totalMinutesProxy`), not the official FIFA clock.

BYOD licence guard (Stage A א3): `parseUserDataset` rejects re-imports that overlap the shipped Open Data roster via an abbreviated hash set of the 605 `name|team` pairs (threshold `min(20, ceil(0.30 × rows))`). Metadata-only checks are not enough after Excel→CSV. **Not caught:** a roster with altered names still passes — partial guard, not a warranty. Hashes live in `demo.js`; this folder does not add a second copy of the names.

BYOD coverage (Stage A א4): a missing count column is not filled as `0`. `parseUserDataset` returns a `coverage` map (per-field fill-rate + per-component `{available, missingFields}`). Unavailable components render as «לא זמין» and their weight is renormalized among present components.

Position aliases (Stage B ב1): short codes `GK/CB/LB/RB/DM/CM/AM/LW/RW/ST/CF` and Hebrew `שוער/בלם/מגן/קשר/כנף/חלוץ` map into `GK/DF/MF/FW` via `DEFAULT_POSITION_ALIASES` in `demo.js`. Pass `{ positionAliases }` to `createStore` (or a `positionAliases` object on the file) to override. `normalizeByPosition` refuses groups smaller than `MIN_POSITION_PEERS` (5); those rows keep raw scores and a visible `normalizationReason`. `derive().normalizationNote` reports the floor and how many rows still fell to `OT`.

File-derived caps (Stage B ב6): WC2018 teaching caps (`pressures90=18` …) stay on Open Data. `createStore(..., { caps: 'file'|'wc2018' })` — default `wc2018` for Open Data, `file` for `USER_LICENSED_DATA` / synthetic. File mode sets each recipe cap to the roster max /90 (no Open-Data scale on commercial runs). `store.caps` / `store.capsSource` / `store.capSaturation` report the active set and how often raw ≥ cap.

BYOD column mapping (Stage B ב2): `mapUserColumns(headers)` suggests `Player`→`name`, `Minutes played`→`minutes`, `xG`→`shotXgSum` (and other aliases in `HEADER_ALIASES`). `parseUserDataset(text, { mapping })` accepts an optional override. Typed conversion turns `"2,340"` into `2340` and `"90:00"` into `90`, or returns an error that cites row+column. `ensureDistinctPlayerIds` keeps two same-name/same-team rows on stable distinct ids (first keeps `name|team`, later ones get `|#2`, `|#3`, …) so fold hashes for unique Open Data pairs stay unchanged.

Unused research snapshots live in `attic/research-data/` and are not loaded here.
