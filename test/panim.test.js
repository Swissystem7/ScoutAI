'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  identifyPlayerPanim,
  PANIM_GUIDE_TRAITS,
  scoreWithPanim,
  createStore,
  normalizeMetricSpec,
  serializeMetricHash,
  parseMetricHash,
  formatFormula,
  lessonContributions,
  DEFAULT_METRIC
} = require('../demo.js');

test('identifyPlayerPanim maps facial traits to score, boost, and summary according to PanimGuide', () => {
  const p1 = { name: "N'Golo Kanté", team: 'France', position: 'MF' };
  const res = identifyPlayerPanim(p1);

  assert.ok(res.score >= 50 && res.score <= 100, `score ${res.score} in [50, 100]`);
  assert.ok(res.boost > 0, `boost ${res.boost} > 0`);
  assert.match(res.summary, /זיהוי לפי PanimGuide/);
  assert.ok(res.traits.forehead);
  assert.ok(res.traits.eyes);
  assert.ok(res.traits.nose);
  assert.ok(res.traits.chin);
  assert.ok(res.traits.complexion);

  // Deterministic output
  const res2 = identifyPlayerPanim(p1);
  assert.deepEqual(res, res2);
});

test('identifyPlayerPanim supports custom panimTraits', () => {
  const custom = {
    name: 'Custom Prospect',
    team: 'Test Club',
    panimTraits: { forehead: 0, eyes: 0, nose: 0, chin: 0, complexion: 0 }
  };
  const res = identifyPlayerPanim(custom);
  assert.equal(res.traits.forehead, PANIM_GUIDE_TRAITS.forehead[0].label);
  assert.equal(res.traits.eyes, PANIM_GUIDE_TRAITS.eyes[0].label);
  assert.equal(res.traits.chin, PANIM_GUIDE_TRAITS.chin[0].label);
  assert.ok(res.score >= 80);
});

test('scoreWithPanim raises chances in the statistical row according to weight', () => {
  const base = 50;
  const panim = 85;
  const fullBoost = scoreWithPanim(base, panim, 100);
  const halfBoost = scoreWithPanim(base, panim, 50);
  const zeroBoost = scoreWithPanim(base, panim, 0);

  assert.equal(zeroBoost, base);
  assert.ok(halfBoost > zeroBoost);
  assert.ok(fullBoost > halfBoost);
});

test('store.derive attaches PanimGuide stats and raises chances in ranking when panimWeight > 0', () => {
  const dataset = {
    players: [
      { name: 'Player A', team: 'Club 1', minutes: 500, pressures: 20, progressiveActions: 15, shotXgSum: 0.1 },
      { name: 'Player B', team: 'Club 2', minutes: 500, pressures: 10, progressiveActions: 10, shotXgSum: 0.1 }
    ]
  };
  const store = createStore(dataset);

  // Default metric (panimWeight: 0)
  const baseView = store.derive(DEFAULT_METRIC);
  baseView.rows.forEach((row) => {
    assert.ok(row.panimScore > 0, 'has panimScore');
    assert.ok(row.panimBoost > 0, 'has panimBoost');
    assert.ok(row.panimSummary, 'has panimSummary');
    assert.equal(row.panimBonus, 0, 'bonus is 0 when weight is 0');
    assert.equal(row.score, row.baseScore, 'score equals baseScore');
  });

  // Boosted metric with panimWeight: 50
  const boostedView = store.derive(Object.assign({}, DEFAULT_METRIC, { panimWeight: 50 }));
  boostedView.rows.forEach((row) => {
    assert.ok(row.panimBonus > 0, 'bonus is positive when panimWeight > 0');
    assert.equal(row.score, Math.round((row.baseScore + row.panimBonus) * 100) / 100);
  });
});

test('spec normalization and permalink hash handle panimWeight cleanly', () => {
  const spec = normalizeMetricSpec({ panimWeight: 75 });
  assert.equal(spec.panimWeight, 75);

  const clamped = normalizeMetricSpec({ panimWeight: 250 });
  assert.equal(clamped.panimWeight, 100);

  const hash = serializeMetricHash({ panimWeight: 60 });
  assert.match(hash, /pw=60/);
  const parsed = parseMetricHash(hash);
  assert.equal(parsed.panimWeight, 60);

  const formula = formatFormula({ panimWeight: 40 });
  assert.match(formula, /40% חכמת פנים \(PanimGuide\)/);

  const contribs = lessonContributions(
    { components: { grit: 50, involvement: 50, clutch: 50 }, panimScore: 80, panimBoost: 11.2 },
    { panimWeight: 50 }
  );
  assert.ok(contribs.some((c) => c.key === 'panim'));
});

test('index.html contains PanimGuide slider, table column, and accessible labels', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="panimWeight"/);
  assert.match(html, /זיהוי שחקנים לפי חכמת הפנים \(PanimGuide\)/);
  assert.match(html, /<th scope="col">חכמת פנים \(Panim\)<\/th>/);
  assert.match(html, /<span class="badge">PanimGuide<\/span>/);
});
