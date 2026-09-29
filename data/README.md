# data — files the live lab actually reads

| File | Used by | What it is |
| --- | --- | --- |
| `wc2018_event_aggregates.json` | `demo.js` → `loadLabSources` | StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). **Aggregated counts** from 64 matches, not an event-by-event log. Research / public sharing with credit; commercial use prohibited. |
| `wc2018_mentality_matches.json` | `mentality.js` → `mentality/` | StatsBomb Open Data, WC2018, **one row per player per match** (1,790 rows): minutes and actions by score state and phase, counter-press, reactions after own ball loss. Built by `node tools/build-mentality.js` from the 64 public event files. Same licence. |
| `radar_tournaments.json` | `radar.js` → `radar/`, `scout-report.js` → `shortlist/` | StatsBomb Open Data, four men's tournaments: WC 2018 (43/3), WC 2022 (43/106), Euro 2020 (55/43), Euro 2024 (55/282) — every published match (230). One row per team per match (raw sums for 14 tactical metrics) and one row per player per tournament (45+ minutes). Built by `node tools/build-radar.js [cacheDir]`. Same licence: no commercial use. |
| `user-dataset.example.json` | BYOD «טענו דוגמה סינתטית» | Four invented players for format practice. Not match data and not Open Data. |

Every on-screen Open Data number is a field on `players[]` in `wc2018_event_aggregates.json`, or a `/90` / cap / weight derived from that field. Minutes are a lineup/substitution proxy (`totalMinutesProxy`), not the official FIFA clock.

Unused research snapshots live in `attic/research-data/` and are not loaded here.
