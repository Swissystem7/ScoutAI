# data — files the live lab actually reads

| File | Used by | What it is |
| --- | --- | --- |
| `wc2018_event_aggregates.json` | `demo.js` → `loadLabSources` | StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). **Aggregated counts** from 64 matches, not an event-by-event log. Research / public sharing with credit; commercial use prohibited. |
| `user-dataset.example.json` | BYOD «טענו דוגמה סינתטית» | Four invented players for format practice. Not match data and not Open Data. |
| `basketball.example.csv` | `basketball/` «טען דוגמה סינתטית» | 80 invented players in 8 invented teams, written by `node tools/make-basketball-example.js` (seeded, reproducible). One hidden skill drives both the box score and +/-, so the metric "working" on +/- in this file is built in, not a finding. Simplified PIR (no fouls drawn / shots rejected). Two practice "new line" columns from a separate seeded stream: `שפת גוף (אקראי)` is pure noise; `בקרה (מושתל)` is built from the hidden skill (a positive control). Neither is a body-language measurement. |
| `basketball.gamelog.example.csv` | `basketball/` «טען דוגמה סינתטית משחק-משחק» | 80 invented players over 14 rounds, one row per player per game (1,061 rows; about 5% of games skipped as "did not play"). Written by the same tool from its own seeded stream, so the season file above does not change. Each player's hidden skill drifts during the season and every game adds noise, so the first rounds cannot predict the rest perfectly. Simplified PIR. Not match data. |

Every on-screen Open Data number is a field on `players[]` in `wc2018_event_aggregates.json`, or a `/90` / cap / weight derived from that field. Minutes are a lineup/substitution proxy (`totalMinutesProxy`), not the official FIFA clock.

Unused research snapshots live in `attic/research-data/` and are not loaded here.
