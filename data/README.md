# data — files the live lab actually reads

| File | Used by | What it is |
| --- | --- | --- |
| `wc2018_event_aggregates.json` | `demo.js` → `loadLabSources` | StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). **Aggregated counts** from 64 matches, not an event-by-event log. Research / public sharing with credit; commercial use prohibited. |
| `user-dataset.example.json` | BYOD «טענו דוגמה סינתטית» | Four invented players for format practice. Not match data and not Open Data. |

Every on-screen Open Data number is a field on `players[]` in `wc2018_event_aggregates.json`, or a `/90` / cap / weight derived from that field. Minutes are a lineup/substitution proxy (`totalMinutesProxy`), not the official FIFA clock.

BYOD licence guard (Stage A א3): `parseUserDataset` rejects re-imports that overlap the shipped Open Data roster via an abbreviated hash set of the 605 `name|team` pairs (threshold `min(20, ceil(0.30 × rows))`). Metadata-only checks are not enough after Excel→CSV. **Not caught:** a roster with altered names still passes — partial guard, not a warranty. Hashes live in `demo.js`; this folder does not add a second copy of the names.

BYOD coverage (Stage A א4): a missing count column is not filled as `0`. `parseUserDataset` returns a `coverage` map (per-field fill-rate + per-component `{available, missingFields}`). Unavailable components render as «לא זמין» and their weight is renormalized among present components.

Unused research snapshots live in `attic/research-data/` and are not loaded here.
