# Graph Report - ScoutAI  (2026-07-23)

## Corpus Check
- 108 files · ~300,277 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 585 nodes · 757 edges · 86 communities (67 shown, 19 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `34b6d174`
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
- computePlayerValueIndex.js
- findTopProspects.js
- rankByUndervaluedUpside.js
- lib/impactScore.js
- WEIGHTS
- lib/percentileRank.js
- lib/playerStats.js
- lib/rankProspects.js
- DISCLAIMER
- lib/scientificUpsideIndex.js
- Narrative Face Energy
- ScoutAI – דף אימות שוק (מקסימום 350 מילים)
- estimateTransferValue.js
- exportEventClip.js
- applyReferralDiscount.js
- extractPlayerClips.js
- synchronizeMatchVideos.js
- createPlayerHighlightClip.js
- exportPlayerComparisonReport.js
- scanningScore.js
- autoAssignPlayersToRoster.js
- computeVideoIntegrityHash.js
- signReport.js

## God Nodes (most connected - your core abstractions)
1. `prepare()` - 23 edges
2. `Scientific Upside Index` - 19 edges
3. `Impact Score` - 18 edges
4. `runScan()` - 15 edges
5. `fbrefToSignals()` - 12 edges
6. `aggregatePlayers()` - 11 edges
7. `impactScore()` - 10 edges
8. `statSignatureScore()` - 10 edges
9. `faceEnergyProfile()` - 9 edges
10. `geneticPropensityScore()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `rankProspects()` --indirect_call--> `breakdown()`  [INFERRED]
  lib/rankProspects.js → proof-composite.js
- `run()` --calls--> `runScan()`  [EXTRACTED]
  proof-match.js → lib/scanPipeline.js
- `run()` --calls--> `runScan()`  [EXTRACTED]
  proof-tournament.js → lib/scanPipeline.js
- `run()` --calls--> `toSeasonSignals()`  [EXTRACTED]
  proof-tournament.js → lib/seasonAggregate.js
- `impactScore` --implements--> `Impact Score`  [EXTRACTED]
  index.html → IMPACT_SCORE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Impact Score Components** — grit, involvement, clutch, energy [EXTRACTED 1.00]
- **Top 12 Impact Score 2018** — player_lozano, player_neymar, player_hazard, player_sigurdsson, player_coutinho, player_de_bruyne, player_messi, player_vela, player_iniesta, player_golovin, player_mbappe, player_inui [EXTRACTED 1.00]
- **Scientific Upside Index Layers** — lib_statSignatureScore_statSignatureScore, lib_geneticPropensityScore_geneticPropensityScore, narrative_face_energy [INFERRED 0.75]

## Communities (86 total, 19 thin omitted)

### Community 0 - "convertExternalEventLog.test.js"
Cohesion: 0.08
Nodes (32): convertExternalEventLog(), mapOptaEventType(), normalizeLocation(), parseManualCsv(), parseOptaJson(), parseTimestamp(), parseWyscoutCsv(), parseXmlMatch() (+24 more)

### Community 1 - "Scientific Upside Index"
Cohesion: 0.05
Nodes (37): Clutch, Energy, Grit, Impact Score, Involvement, computePlayerValueIndex, geneticPropensityScore, impactScore (+29 more)

### Community 2 - "Impact Score"
Cohesion: 0.09
Nodes (29): fbrefToSignals(), FIELDS, finiteNonNegative(), loadFbrefDataset(), nullableNumber(), number(), optional(), parseJson() (+21 more)

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
Cohesion: 0.10
Nodes (24): componentScores(), { loadXtDataset, xtToSignals }, mergePlayerSignals(), normalizeName(), percentileMap(), { toSeasonSignals }, toSeasonSignals(), finite() (+16 more)

### Community 11 - "generateReferralLink.js"
Cohesion: 0.32
Nodes (7): crypto, DB_PATH, fs, generateReferralLink(), path, readDb(), writeDb()

### Community 12 - "rankProspects.js"
Cohesion: 0.39
Nodes (6): rankProspects(), rankScored(), round2(), selftest(), TIER_ORDER, breakdown()

### Community 13 - "resolveVideoDirectUrl.js"
Cohesion: 0.38
Nodes (6): handleDropbox(), handleGoogleDrive(), http, https, resolveVideoDirectUrl(), url

### Community 14 - "countByPosition.test.js"
Cohesion: 0.40
Nodes (4): countByPosition(), assert, { countByPosition }, zeros

### Community 15 - "detectMomentumShifts.js"
Cohesion: 0.06
Nodes (49): computePlayerValueIndex(), clamp(), detectMomentumShifts(), EVENT_VALUES, round4(), findTopProspects(), LEAGUE_TABLE, leagueStrength() (+41 more)

### Community 16 - "impactScore.js"
Cohesion: 0.06
Nodes (44): clamp(), impactScore(), r1(), sc(), WEIGHTS, aggregateSeason(), canonicalName(), COUNT_METRICS (+36 more)

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

### Community 29 - "leagueStrength.js"
Cohesion: 0.29
Nodes (14): addToCache(), crypto, dedupCache, fetchHudlVideos(), fetchVeoVideos(), fetchWithRetry(), fetchYoutubeVideos(), generateCacheKey() (+6 more)

### Community 34 - "computePlayerValueIndex.js"
Cohesion: 0.22
Nodes (8): Footage matters (Aviran can get both), GPU reality (honest), Honest accuracy expectations, Integration point (already being built), Milestones (parallel to the StatsBomb-event track that works today), Pipeline (4 stages) — output feeds ScoutAI's videoSignal contract, Reality check (why this is a CV build, not "an LLM watching"), ScoutAI — Full-Match Video → Player Ratings Pipeline (honest scope)

### Community 39 - "findTopProspects.js"
Cohesion: 0.29
Nodes (4): analyzedUrls, { randomUUID }, supportedPlatforms, ValidationError

### Community 51 - "rankByUndervaluedUpside.js"
Cohesion: 0.70
Nodes (4): clamp(), finite(), normalizeVideoSignal(), round4()

### Community 65 - "ScoutAI – דף אימות שוק (מקסימום 350 מילים)"
Cohesion: 0.25
Nodes (7): 1. ICP מדויק (ישראל), 2. מחיר + מודל, 3. זווית מול המתחרה המרכזי, 4. תוכנית 100 המשתמשים הראשונים (תקציב 0, ישראל), 5. קריטריון המשך/פיבוט/הריגה (30 יום), ScoutAI — Market Validation (auto, DeepSeek 2026-07-20), ScoutAI – דף אימות שוק (מקסימום 350 מילים)

### Community 66 - "estimateTransferValue.js"
Cohesion: 0.36
Nodes (7): convertToEUR(), estimateTransferValue(), euclideanSimilarity(), exchangeRates, fs, loadStoredComparables(), path

### Community 67 - "exportEventClip.js"
Cohesion: 0.33
Nodes (6): { execFile }, execFilePromise, exportEventClip(), fs, path, util

### Community 68 - "applyReferralDiscount.js"
Cohesion: 0.33
Nodes (4): discountedClubs, paidClubs, referralEpoch, referrals

### Community 69 - "extractPlayerClips.js"
Cohesion: 0.47
Nodes (5): allowedEventTypes, clampTime(), extractPlayerClips(), matchDatabase, parseTimestamp()

### Community 70 - "synchronizeMatchVideos.js"
Cohesion: 0.33
Nodes (4): crypto, http, https, storedVideoIds

### Community 71 - "createPlayerHighlightClip.js"
Cohesion: 0.83
Nodes (3): createPlayerHighlightClip(), extractClip(), getMatchData()

## Knowledge Gaps
- **240 isolated node(s):** `referralEpoch`, `referrals`, `discountedClubs`, `paidClubs`, `a` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runScan()` connect `detectMomentumShifts.js` to `impactScore.js`, `Impact Score`, `convertExternalEventLog.js`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `impactScore()` connect `impactScore.js` to `convertExternalEventLog.js`, `detectMomentumShifts.js`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `fbrefToSignals()` (e.g. with `fbrefAdapter.js` and `performanceRate()`) actually correct?**
  _`fbrefToSignals()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `referralEpoch`, `referrals`, `discountedClubs` to the rest of the system?**
  _240 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `convertExternalEventLog.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08377896613190731 - nodes in this community are weakly interconnected._
- **Should `Scientific Upside Index` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Impact Score` be split into smaller, more focused modules?**
  _Cohesion score 0.09274193548387097 - nodes in this community are weakly interconnected._