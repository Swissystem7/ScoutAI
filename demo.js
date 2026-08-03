(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScoutAIDemo = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hashSeed(seed) {
    const text = String(seed || 'scoutai-demo-001');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createDemoFixture(seed) {
    const hash = hashSeed(seed);
    const value = (offset, span) => offset + (hash % span);
    return {
      seed: String(seed || 'scoutai-demo-001'),
      video: { provenance: 'LOCAL_VIDEO', analyzed: false, uploaded: false },
      service: { provenance: 'VERIFIED_ANALYSIS_SERVICE', available: false },
      metrics: [
        { id: 'pace-demo', label: 'קצב המחשה', value: value(61, 25), unit: '/100', provenance: 'DEMO_METRIC', measured: false },
        { id: 'control-demo', label: 'שליטה להמחשה', value: value(55, 31), unit: '/100', provenance: 'DEMO_METRIC', measured: false },
        { id: 'work-demo', label: 'עבודה להמחשה', value: value(58, 28), unit: '/100', provenance: 'DEMO_METRIC', measured: false }
      ],
      timeline: [
        { at: '00:12', label: 'אירוע fixture א', provenance: 'DEMO_METRIC' },
        { at: `00:${30 + (hash % 20)}`, label: 'אירוע fixture ב', provenance: 'DEMO_METRIC' },
        { at: `01:${10 + (hash % 30)}`, label: 'אירוע fixture ג', provenance: 'DEMO_METRIC' }
      ]
    };
  }

  return { createDemoFixture };
}));
