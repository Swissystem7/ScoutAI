# Body Language + חכמת הפנים Integration for ScoutAI

**Status**: Research + design layer. Builds on existing `attic/` pose experiments.  
**Date**: 2026-10-24  
**Honesty note**: This is **not** facial recognition, not personality diagnosis, and not a claim that Kabbalistic physiognomy is scientifically predictive. It uses **measurable pose geometry** (already prototyped) and maps traditional concepts only as **inspiration for which signals to look for**.

## Existing Technologies Used

From `attic/` and the VIDEO_PIPELINE_PLAN:

- **MediaPipe Pose** on player crops → head-turn / scanning detection, uprightness, intensity.
- Provenance explicitly: "measured-geometry per tracked player (MediaPipe Pose on tracking crops); NOT facial emotion".
- `proof-body.js` shows how body signals can be layered onto a ranking engine with a weight cap (e.g. ≤12%).
- Full pipeline plan: YOLO detection → ByteTrack → jersey OCR → homography → per-player videoSignals (scanning, energy, distance, etc.).

These signals are **objective geometry**, not subjective face reading.

## Mapping Traditional Concepts to Measurable Signals

Drawn from the textual tradition documented in PanimGuide (Zohar, sources on forehead / eyes / face as reflecting inner qualities). Used **only** as a lens for which body-language dimensions to instrument. Not applied to any living person.

| Traditional concept (from sources) | Approximate meaning in tradition | Measurable body / pose signal | Example metric |
|------------------------------------|----------------------------------|-------------------------------|----------------|
| עיניים / Eyes | Window to stability, endurance, passion, truth | Scanning rate (head yaw changes before receiving ball) | `scanningRate` (already in body_v2) |
| מצח / Forehead | Cognitive ability, self-confidence, thoughts | Uprightness + open posture under pressure | `uprightness`, `chestOpenness` |
| אנפין / Overall face / presence | Overall impression, atmosphere created | Combined presence: upright + intensity + scanning | `PresenceScore` |
| שפתיים / Lips / mouth | Expression of intent / communication | Not directly used (avoids facial emotion); proxy = body openness after actions | `recoveryOpenness` |
| שער / Hair (mentioned in Zohar) | Character traits | Not instrumented (static, not dynamic body language) | — |

Additional modern scouting concepts that align:

- **Resilience / bounce-back**: time or posture recovery after error or lost duel.
- **Pressure response**: does the player stay upright and keep scanning when pressed?
- **Leadership presence**: frequency of open, upright, scanning posture in key moments.

## Proposed New Statistical Metrics ("עסקאות סטטיסטיקה")

These can be computed from the same pose pipeline already sketched:

1. **ScanningRate** — head-turn events per second before ball reception (already prototyped).
2. **UprightnessIndex** — average torso/shoulder uprightness (0–1) during involvement phases.
3. **ResilienceIndex** — post-error uprightness recovery speed + continued scanning.
4. **PresenceScore** — weighted combination of scanning + uprightness + intensity, normalized per 90'.
5. **PressureResponse** — delta in uprightness/scanning when opponent is within X meters (requires tracking).

These are intended to be added as optional, transparent components to the existing Impact Score formula, with full provenance and weight visibility — consistent with ScoutAI's design principles.

## Implementation Sketch

```js
// Conceptual extension of videoSignals
const bodyLanguageSignals = {
  scanningRate: 2.56,      // from MediaPipe yaw deltas
  uprightness: 0.97,       // torso angle
  intensityRaw: 0.22,      // movement energy
  // derived
  presenceScore: 0.4 * scanningNorm + 0.4 * uprightness + 0.2 * intensityNorm,
  provenance: "measured-geometry MediaPipe Pose; conceptual labels inspired by traditional face concepts, not diagnostic"
};
```

Weight recommendation (to stay honest): body language contribution ≤ 10–15% of total Impact until validated on larger samples.

## Next Steps

1. Expand the existing pose adapter (`bodyLanguageAdapter` referenced in attic) to emit the new named metrics.
2. Run on larger tactical-camera datasets (SoccerNet, or self-collected).
3. Correlate the new metrics against known success indicators (progressive actions, clutch moments, etc.) from StatsBomb or equivalent.
4. Add a transparent "Body Language" panel to the demo UI with the same provenance banners used elsewhere.
5. Keep the explicit disclaimer: traditional concepts are cultural/textual inspiration only.

## Boundaries (non-negotiable)

- No camera upload of real faces for "reading".
- No claim of personality, morality, or destiny prediction.
- No violation of the integrity stance in PanimGuide or ScoutAI READMEs.
- All numbers must be traceable to measured geometry or event data.

---
*This document is a design proposal created to fulfill the request to integrate body-language technologies with face-wisdom concepts while staying within the honesty framework of both projects.*
