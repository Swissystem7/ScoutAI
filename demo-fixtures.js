(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScoutAIDemoFixtures = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_SEED = 'SCOUTAI_LOCAL_DEMO';

  function normalizeSeed(seed) {
    return String(seed || DEFAULT_SEED).trim() || DEFAULT_SEED;
  }

  function hashSeed(seed) {
    const normalized = normalizeSeed(seed);
    let hash = 2166136261;
    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function metricFromRange(hash, min, max, step) {
    const slots = Math.floor((max - min) / step) + 1;
    const value = min + (hash % slots) * step;
    return Number(value.toFixed(1));
  }

  function createDemoFixture(seed) {
    const normalizedSeed = normalizeSeed(seed);
    const hash = hashSeed(normalizedSeed);

    const metrics = {
      speedKmh: metricFromRange(hash, 24, 32, 0.2),
      distanceKm: metricFromRange(hash >>> 3, 5.2, 8.4, 0.1),
      passAccuracyPct: Math.round(metricFromRange(hash >>> 5, 72, 93, 1)),
      touches: Math.round(metricFromRange(hash >>> 7, 20, 48, 1)),
      teamAvgSpeedKmh: metricFromRange(hash >>> 9, 18, 25, 0.1),
      teamAvgRunKm: metricFromRange(hash >>> 11, 4.2, 6.8, 0.1),
      teamPassAccuracyPct: Math.round(metricFromRange(hash >>> 13, 68, 89, 1)),
      teamAvgTouches: Math.round(metricFromRange(hash >>> 15, 18, 34, 1))
    };

    const timelineEvents = [
      { pct: 14, type: 't-sprint', icon: '⚡', label: 'DEMO_METRIC · ספרינט דמו' },
      { pct: 29, type: 't-pass', icon: '🎯', label: 'DEMO_METRIC · מסירה דטרמיניסטית' },
      { pct: 43, type: 't-goal', icon: '⚽', label: 'DEMO_METRIC · אירוע סיום דמו' },
      { pct: 57, type: 't-sprint', icon: '⚡', label: 'DEMO_METRIC · ספרינט דמו' },
      { pct: 71, type: 't-pass', icon: '🎯', label: 'DEMO_METRIC · מסירה דטרמיניסטית' },
      { pct: 86, type: 't-goal', icon: '⚽', label: 'DEMO_METRIC · אירוע סיום דמו' }
    ];

    const seedShift = hash % 5;
    const shiftedTimelineEvents = timelineEvents.map(function (event, index) {
      const offset = ((seedShift + index) % 5) - 2;
      return {
        pct: Math.max(5, Math.min(95, event.pct + offset)),
        type: event.type,
        icon: event.icon,
        label: event.label + ' #' + (index + 1)
      };
    });

    return {
      seed: normalizedSeed,
      classifications: {
        video: 'LOCAL_VIDEO',
        metric: 'DEMO_METRIC',
        service: 'VERIFIED_ANALYSIS_SERVICE: unavailable'
      },
      metrics: metrics,
      timelineEvents: shiftedTimelineEvents
    };
  }

  return {
    DEFAULT_SEED: DEFAULT_SEED,
    normalizeSeed: normalizeSeed,
    hashSeed: hashSeed,
    createDemoFixture: createDemoFixture
  };
});
