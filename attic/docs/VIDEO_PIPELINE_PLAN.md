# ScoutAI — Full-Match Video → Player Ratings Pipeline (honest scope)

Goal: feed a WHOLE match video → automatically rate every player (the good AND the bad),
using ScoutAI's "new statistic" (energy / scanning / momentum / impact) on top of extracted
events. No clips — full 90 minutes. This is the real product for footage that has NO event data.

## Reality check (why this is a CV build, not "an LLM watching")
An LLM on downsampled video gives only a coarse read of the 2-3 most extreme players and
hallucinates fine detail — it can't track 22 players or count events. Objective per-player
rating requires a computer-vision pipeline. That pipeline is well-trodden and buildable.

## Pipeline (4 stages) — output feeds ScoutAI's videoSignal contract
1. DETECTION — per-frame players + ball. Model: YOLOv8/YOLO11 (Roboflow "football-ai" weights
   exist as a starting point). GPU.
2. TRACKING — persistent IDs across frames. ByteTrack (or BoT-SORT). Handles occlusion; broadcast
   cuts break tracks (see footage note).
3. IDENTIFICATION — map track -> named player. Jersey-number OCR (crop -> OCR model) + team color
   clustering. This is the weakest link; partial ID is normal — rate by (team, number) where
   visible, flag low-confidence players.
4. SPATIAL + EVENTS — pitch homography (keypoint detection -> real pitch coords) → per-player
   signals: distance covered, sprints, pressing/recovery actions, touches, duels, position heatmap,
   scanning (head-turn detection on player crop, pose model). Aggregate per match.

Output = one videoSignal record per identified player -> normalizeVideoSignal() (lib/videoSignal.js,
built in msg9) -> runScan(players,{mode:'rank'}) -> good/bad board. Same engine as the StatsBomb path.

## Footage matters (Aviran can get both)
- TACTICAL wide-angle fixed cam: BEST. All 22 visible continuously, no cuts, tracking stays stable,
  homography is one-time. Start here — highest accuracy, cleanest proof.
- BROADCAST TV: hardest. Moving camera + cuts + replays + zoom break tracking and lose off-ball
  players. Needs shot-boundary detection + re-ID after each cut; accuracy drops, coverage partial.
  Support as phase 2, label confidence lower.

## GPU reality (honest)
None of Aviran's machines have a usable GPU (desktop/laptop weak CPU, Azure 2vCPU CPU-only).
Options, cheapest first:
- Google Colab (free T4 GPU; Aviran has Google) — right place to start / prototype.
- Paid cloud GPU (Colab Pro / vast.ai / Lambda) when scaling to many full matches.
- Roboflow hosted inference (no local GPU) for the detection stage.

## Honest accuracy expectations
- Detection/tracking on tactical cam: strong for presence, distance, activity, heatmaps.
- Player-ID via jersey OCR: partial — expect gaps, especially far side / motion blur.
- Fine events (pass outcomes, duel wins): approximate vs a pro provider (StatsBomb/SkillCorner).
- Every per-player rating carries a confidence; low-confidence players are flagged, not hidden.
Label everything measured vs inferred — same honesty hierarchy as the engine.

## Milestones (parallel to the StatsBomb-event track that works today)
- M0 (today): prove the RATING engine on a full StatsBomb match — all 22 rated good/bad (no video).
- M1: Colab notebook — detection+tracking on ONE tactical-cam full match → per-player activity +
  heatmaps → videoSignal records → runScan rank. Proof the video path reaches the same engine.
- M2: add jersey-OCR identification + pitch homography → real per-player event signals.
- M3: scanning (head-turn) + energy layer on tracked crops. The "new statistic" from video.
- M4: broadcast support (shot-boundary + re-ID). Lower confidence, wider footage availability.

## Integration point (already being built)
lib/videoSignal.js (msg9) defines the record the Colab notebook must emit. The CV notebook is a
DATA PRODUCER; ScoutAI's engine is unchanged. Clean seam: notebook -> JSON -> runScan.
