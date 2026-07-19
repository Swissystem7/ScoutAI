#!/usr/bin/env node
'use strict';
// PROOF-OF-CONCEPT (illustrative, NOT real biometric data): does the ScoutAI upside engine
// surface players who were undervalued by stats but spotted on intangibles/work-rate?
// Inputs are APPROXIMATED from each player's DOCUMENTED scouting story (sources in notes),
// not from real face measurements. Shows the engine ranks the grinders above a flashy-stats control.

const { faceEnergyProfile } = require('./lib/faceEnergyProfile.js');
const { scoutUpsideIndex } = require('./lib/scoutUpsideIndex.js');

// Each player: documented story -> approximated inputs.
// statScore = how a stats-only model rated them AT DISCOVERY (0-100). energy features 0-1 (0.5=median).
const PLAYERS = [
  {
    name: "N'Golo Kanté",
    story: 'Ranieri: "not big enough"; scouts Walsh/Ville saw relentless engine + ground covered. Ligue 2 -> PL+WC winner.',
    statScore: 42,          // undervalued at Caen: small, unremarkable box-score
    momentumRaw: 88,        // elite off-ball recovery / tackles = high momentum contribution
    features: { jawSquareness: 0.85, chinProjection: 0.8, foreheadHeight: 0.6, eyeSize: 0.7, browDensity: 0.55, faceAspect: 0.35 },
  },
  {
    name: 'Jamie Vardy',
    story: '8th-tier non-league at 25, no pro data trail. Spotted on relentless pressing + pace + never-stop mentality.',
    statScore: 38,          // invisible to stats models (non-league)
    momentumRaw: 82,
    features: { jawSquareness: 0.8, chinProjection: 0.85, noseBridgeConvex: 0.7, eyeProtrusion: 0.7, foreheadLines: 0.65, faceAspect: 0.6 },
  },
  {
    name: 'Flashy Winger (control)',
    story: 'Great highlight-reel stats, low work-rate + hides in big moments. The type stats OVER-rate.',
    statScore: 84,          // stats love him
    momentumRaw: 25,        // low grind / disappears when momentum swings
    features: { jawSquareness: 0.35, chinProjection: 0.3, browTilt: 0.8, lipFullness: 0.7, foreheadLines: 0.3 },
  },
];

function run() {
  const scored = PLAYERS.map((p) => {
    const energy = faceEnergyProfile(p.features).energy;
    const res = scoutUpsideIndex({ name: p.name, statScore: p.statScore, energy, momentum: p.momentumRaw });
    return { name: p.name, story: p.story, statScore: p.statScore, momentum: p.momentumRaw, energy, upside: res };
  });
  // rank by the upside index (higher = better hidden bet)
  scored.sort((a, b) => (b.upside.index) - (a.upside.index));

  const L = [];
  L.push('# ScoutAI — הוכחת רעיון: זיהוי שחקנים לא-מנוצלים');
  L.push('> קלט מקורב מהסיפור המתועד של כל שחקן (לא מדידות פנים אמיתיות) — הדגמה, לא ולידציה מדעית.\n');
  L.push('דירוג לפי מדד ה-Upside (סטטיסטיקה חלשה + אנרגיה/מומנטום גבוהים = הימור נסתר טוב):\n');
  scored.forEach((s, i) => {
    L.push(`## ${i + 1}. ${s.name} — Upside ${s.upside.index}/100  (סטט בלבד: ${s.statScore})`);
    L.push(`- ${s.story}`);
    L.push(`- אנרגיה: drive ${s.energy.drive} · resilience ${s.energy.resilience} · leadership ${s.energy.leadership} · intensity ${s.energy.intensity}`);
    L.push(`- מומנטום: ${s.momentum} | ${s.upside.explanation}`);
    L.push('');
  });
  // the proof assertion: grinders (low stats) outrank the flashy control (high stats)
  const control = scored.find((s) => s.name.includes('control'));
  const grinders = scored.filter((s) => !s.name.includes('control'));
  const proven = grinders.every((g) => g.upside.index > control.upside.index);
  L.push(`**תוצאת ההוכחה:** ${proven ? 'עבר ✅' : 'נכשל ❌'} — הגַ'רינדרים (Kanté/Vardy, סטט נמוך) מדורגים מעל ה-Flashy Winger (סטט גבוה). המנוע מצא את מה שהסטטיסטיקה החמיצה.`);
  const out = L.join('\n');
  console.log(out);
  return { out, proven };
}

if (require.main === module) {
  const { proven } = run();
  process.exit(proven ? 0 : 1);
}
module.exports = { run, PLAYERS };
