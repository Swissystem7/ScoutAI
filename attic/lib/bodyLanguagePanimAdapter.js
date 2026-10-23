'use strict';

/**
 * Body Language adapter that emits metrics named with conceptual labels
 * inspired by Chochmat HaPanim (face wisdom) sources, but computed solely
 * from measurable pose geometry (MediaPipe Pose style signals).
 *
 * NOT facial emotion recognition. NOT diagnostic.
 * Provenance must always be carried.
 */

function normalize(value, min, max) {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Convert raw pose measurements into named signals.
 * Input shape matches the experimental body_v2 JSON.
 */
function bodyToPanimInspiredSignals(raw) {
  const scanningNorm = normalize(raw.scanningRate || 0, 0, 4); // rough expected range
  const uprightNorm = raw.uprightness || 0; // already 0-1
  const intensityNorm = normalize(raw.intensityRaw || 0, 0, 0.5);

  const presenceScore = 0.4 * scanningNorm + 0.4 * uprightNorm + 0.2 * intensityNorm;

  return {
    // Traditional concept labels — conceptual only
    eyes_scanning: {
      value: raw.scanningRate || 0,
      normalized: scanningNorm,
      concept: 'עיניים — יציבות, תשוקה, הסתכלות סביב',
      measured: 'head yaw delta rate (MediaPipe Pose)'
    },
    forehead_confidence: {
      value: uprightNorm,
      concept: 'מצח — ביטחון עצמי, קוגניציה',
      measured: 'torso / shoulder uprightness'
    },
    face_presence: {
      value: presenceScore,
      concept: 'אנפין — נוכחות כללית / אווירה שנוצרת',
      measured: 'weighted scanning + uprightness + intensity'
    },
    // Pure technical names (preferred for production)
    scanningRate: raw.scanningRate,
    uprightness: raw.uprightness,
    intensityRaw: raw.intensityRaw,
    presenceScore,
    provenance: raw.provenance || 'measured-geometry MediaPipe Pose; conceptual labels from traditional sources, not diagnostic'
  };
}

/**
 * Example usage with the existing experimental dataset format.
 */
function processBodyDataset(dataset) {
  return (dataset.players || []).map(p => ({
    trackId: p.trackId,
    seconds: p.seconds,
    signals: bodyToPanimInspiredSignals(p)
  }));
}

module.exports = {
  bodyToPanimInspiredSignals,
  processBodyDataset,
  normalize
};
