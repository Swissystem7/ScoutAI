# data — files the live lab actually reads

| File | Used by | What it is |
| --- | --- | --- |
| `wc2018_event_aggregates.json` | `demo.js` → `loadLabSources` | StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). **Aggregated counts** from 64 matches, not an event-by-event log. Research / public sharing with credit; commercial use prohibited. |
| `wc2018_mentality_matches.json` | `mentality.js` → `mentality/` | StatsBomb Open Data, WC2018, **one row per player per match** (1,790 rows): minutes and actions by score state and phase, counter-press, reactions after own ball loss. Built by `node tools/build-mentality.js` from the 64 public event files. Same licence. |
| `wc2018_club_fit.json` | `clubfit.js` → `club-fit/` | StatsBomb Open Data, WC2018: `teamMatches[]` (128 rows, one per team per match: raw counts behind nine style dimensions — passes, PPDA inputs, pressing height, directness, crosses, through balls, short build-up, set-piece xG, counter-press, possessions) and `playerMatches[]` (1,790 rows: minutes, position and role actions such as progressive passes under pressure, counter-presses, aerials won, through balls received). Built by `node tools/build-club-fit.js`. Same licence. |
| `user-dataset.example.json` | BYOD «טענו דוגמה סינתטית» | Four invented players for format practice. Not match data and not Open Data. |

Every on-screen Open Data number is a field on `players[]` in `wc2018_event_aggregates.json`, or a `/90` / cap / weight derived from that field. Minutes are a lineup/substitution proxy (`totalMinutesProxy`), not the official FIFA clock.

Unused research snapshots live in `attic/research-data/` and are not loaded here.
