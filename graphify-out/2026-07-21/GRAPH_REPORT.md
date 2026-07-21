# Graph Report - .  (2026-07-20)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 319 nodes · 339 edges · 65 communities (50 shown, 15 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bbcb917d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- convertExternalEventLog.test.js
- Scientific Upside Index
- Impact Score
- proof-demo.js
- calculatePlayerPercentile.test.js
- matchRosterToTracking.test.js
- statSignatureScore.js
- geneticPropensityScore.js
- scientificUpsideIndex.js
- ingestClubVideo.js
- convertExternalEventLog.js
- generateReferralLink.js
- rankProspects.js
- resolveVideoDirectUrl.js
- countByPosition.test.js
- detectMomentumShifts.js
- impactScore.js
- importTeamRoster.js
- playerStats.test.js
- assessPositionBias.js
- percentileRank.test.js
- avgRating.test.js
- detectScoutBias.js
- importPlayersFromCsv.js
- monitorVideoFolder.js
- verifyPlayerIdentityConsistency.js
- verifyVideoIntegrity.js
- calculateReferralRewards.js
- generateScoutingReport.js
- leagueStrength.js
- lib/impactScore.js
- WEIGHTS
- lib/percentileRank.js
- lib/playerStats.js
- lib/rankProspects.js
- DISCLAIMER
- lib/scientificUpsideIndex.js
- Narrative Face Energy

## God Nodes (most connected - your core abstractions)
1. `Scientific Upside Index` - 19 edges
2. `Impact Score` - 18 edges
3. `statSignatureScore()` - 8 edges
4. `faceEnergyProfile()` - 7 edges
5. `geneticPropensityScore()` - 7 edges
6. `scientificUpsideIndex()` - 7 edges
7. `convertExternalEventLog()` - 6 edges
8. `parseOptaJson()` - 5 edges
9. `parseTimestamp()` - 5 edges
10. `normalizeLocation()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Neymar` --conceptually_related_to--> `Scientific Upside Index`  [EXTRACTED]
  IMPACT_SCORE.md → POC_REPORT.md
- `impactScore` --implements--> `Impact Score`  [EXTRACTED]
  index.html → IMPACT_SCORE.md
- `Filippa Angeldal` --conceptually_related_to--> `Scientific Upside Index`  [EXTRACTED]
  POC_REPORT_CALIBRATED.md → POC_REPORT.md
- `Kevin De Bruyne` --conceptually_related_to--> `Scientific Upside Index`  [EXTRACTED]
  IMPACT_SCORE.md → POC_REPORT.md
- `Stephen Eustáquio` --conceptually_related_to--> `Scientific Upside Index`  [EXTRACTED]
  POC_REPORT_CALIBRATED.md → POC_REPORT.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Impact Score Components** — grit, involvement, clutch, energy [EXTRACTED 1.00]
- **Top 12 Impact Score 2018** — player_lozano, player_neymar, player_hazard, player_sigurdsson, player_coutinho, player_de_bruyne, player_messi, player_vela, player_iniesta, player_golovin, player_mbappe, player_inui [EXTRACTED 1.00]
- **Scientific Upside Index Layers** — lib_statSignatureScore_statSignatureScore, lib_geneticPropensityScore_geneticPropensityScore, narrative_face_energy [INFERRED 0.75]

## Communities (65 total, 15 thin omitted)

### Community 0 - "convertExternalEventLog.test.js"
Cohesion: 0.08
Nodes (24): assert, { convertExternalEventLog }, mapping, optaJsonData, optaJsonWrapper, optaLarge, optaMissing, optaNaN (+16 more)

### Community 1 - "Scientific Upside Index"
Cohesion: 0.09
Nodes (20): computePlayerValueIndex, geneticPropensityScore, rankProspects, scientificUpsideIndex, statSignatureScore, Filippa Angeldal, Kevin De Bruyne, Stephen Eustáquio (+12 more)

### Community 2 - "Impact Score"
Cohesion: 0.11
Nodes (17): Clutch, Energy, Grit, Impact Score, Involvement, impactScore, Philippe Coutinho, Aleksandr Golovin (+9 more)

### Community 3 - "proof-demo.js"
Cohesion: 0.18
Nodes (14): DIMS, faceEnergyProfile(), isPlainObject(), mergeWeights(), round1(), WEIGHTS, ENERGY_DIMS, round1() (+6 more)

### Community 4 - "calculatePlayerPercentile.test.js"
Cohesion: 0.15
Nodes (12): calculatePlayerPercentile(), assert, { calculatePlayerPercentile }, negativePeers, negativePlayer, negativeResult, peers, player (+4 more)

### Community 5 - "matchRosterToTracking.test.js"
Cohesion: 0.17
Nodes (11): matchRosterToTracking(), assert, dupRes, matchMetadata, { matchRosterToTracking }, noMatch, result, result2 (+3 more)

### Community 6 - "statSignatureScore.js"
Cohesion: 0.26
Nodes (11): clamp(), computeStatComposite(), normalizeMetrics(), num(), peakAgeFor(), NOTE: repo normalizeMetrics is a BATCH cross-player normalizer (players[] -> inc, NOTE: repo computeStatComposite has an incompatible signature (weighted metric o, round2() (+3 more)

### Community 7 - "geneticPropensityScore.js"
Cohesion: 0.33
Nodes (10): clamp(), geneticPropensityScore(), isNum(), isPlainObject(), NORM, normField(), round2(), selftest() (+2 more)

### Community 8 - "scientificUpsideIndex.js"
Cohesion: 0.40
Nodes (10): BASE_NO_NARR, BASE_WITH_NARR, clamp(), collapseGenetic(), fuse(), num(), round2(), scientificUpsideIndex() (+2 more)

### Community 9 - "ingestClubVideo.js"
Cohesion: 0.27
Nodes (9): checkUrlReachable(), computeHash(), { createHash, randomUUID }, { existsSync, statSync }, http, https, ingestClubVideo(), jobStore (+1 more)

### Community 10 - "convertExternalEventLog.js"
Cohesion: 0.58
Nodes (8): convertExternalEventLog(), mapOptaEventType(), normalizeLocation(), parseManualCsv(), parseOptaJson(), parseTimestamp(), parseWyscoutCsv(), parseXmlMatch()

### Community 11 - "generateReferralLink.js"
Cohesion: 0.32
Nodes (7): crypto, DB_PATH, fs, generateReferralLink(), path, readDb(), writeDb()

### Community 12 - "rankProspects.js"
Cohesion: 0.48
Nodes (5): rankProspects(), rankScored(), round2(), selftest(), TIER_ORDER

### Community 13 - "resolveVideoDirectUrl.js"
Cohesion: 0.38
Nodes (6): handleDropbox(), handleGoogleDrive(), http, https, resolveVideoDirectUrl(), url

### Community 14 - "countByPosition.test.js"
Cohesion: 0.40
Nodes (4): countByPosition(), assert, { countByPosition }, zeros

### Community 15 - "detectMomentumShifts.js"
Cohesion: 0.47
Nodes (4): clamp(), detectMomentumShifts(), EVENT_VALUES, round4()

### Community 16 - "impactScore.js"
Cohesion: 0.60
Nodes (5): clamp(), impactScore(), r1(), sc(), WEIGHTS

### Community 17 - "importTeamRoster.js"
Cohesion: 0.40
Nodes (5): allowed, csvRows(), fs, importTeamRoster(), { randomUUID }

### Community 18 - "playerStats.test.js"
Cohesion: 0.40
Nodes (4): playerStats(), assert, events, { playerStats }

### Community 19 - "assessPositionBias.js"
Cohesion: 0.70
Nodes (4): assessPositionBias(), chiSquaredCDF(), lgamma(), regularizedGammaP()

### Community 20 - "percentileRank.test.js"
Cohesion: 0.50
Nodes (3): percentileRank(), assert, { percentileRank }

### Community 22 - "detectScoutBias.js"
Cohesion: 0.83
Nodes (3): detectScoutBias(), getCriticalZ(), normalCDF()

### Community 25 - "verifyPlayerIdentityConsistency.js"
Cohesion: 0.83
Nodes (3): computeIoU(), cosineSimilarity(), verifyPlayerIdentityConsistency()

## Knowledge Gaps
- **133 isolated node(s):** `a`, `{avgRating}`, `assert`, `{ calculatePlayerPercentile }`, `player` (+128 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Scientific Upside Index` connect `Scientific Upside Index` to `Impact Score`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `Impact Score` connect `Impact Score` to `Scientific Upside Index`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Neymar` connect `Impact Score` to `Scientific Upside Index`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `a`, `{avgRating}`, `assert` to the rest of the system?**
  _133 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `convertExternalEventLog.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Scientific Upside Index` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Impact Score` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._