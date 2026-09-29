# data — files the live lab actually reads

| File | Used by | What it is |
| --- | --- | --- |
| `wc2018_event_aggregates.json` | `demo.js` → `loadLabSources` | StatsBomb Open Data, FIFA World Cup 2018 (competition 43, season 3). **Aggregated counts** from 64 matches, not an event-by-event log. Research / public sharing with credit; commercial use prohibited. |
| `wc2018_mentality_matches.json` | `mentality.js` → `mentality/` | StatsBomb Open Data, WC2018, **one row per player per match** (1,790 rows): minutes and actions by score state and phase, counter-press, reactions after own ball loss. Built by `node tools/build-mentality.js` from the 64 public event files. Same licence. |
| `wc2018_gems_matches.json` | `gems.js` → `gems/` | StatsBomb Open Data, WC2018, **one row per player per match** (1,790 rows): physical / aerial / duel counts, technical / decision counts (passes into the box, progressive passes and carries, receptions between the lines as a location proxy, passes under pressure, counter-press, interceptions, recoveries), xA, xGChain, xGBuildup. Built by `node tools/build-gems.js`. Same licence. |
| `wc2018_heights.json` | `gems.js` → `gems/` | Height (cm) and birth **month** of 572 of the 604 StatsBomb WC2018 players, from Wikidata (CC0), strict name + national-team match. Built by `node tools/build-heights.js`. Used only to test the size-bias premise and the relative age effect. |
| `gems-template.csv` | `gems/` «הביאו נתונים שלכם» | Column template with two invented rows. Not match data. |
| `user-dataset.example.json` | BYOD «טענו דוגמה סינתטית» | Four invented players for format practice. Not match data and not Open Data. |

Every on-screen Open Data number is a field on `players[]` in `wc2018_event_aggregates.json`, or a `/90` / cap / weight derived from that field. Minutes are a lineup/substitution proxy (`totalMinutesProxy`), not the official FIFA clock.

Unused research snapshots live in `attic/research-data/` and are not loaded here.
