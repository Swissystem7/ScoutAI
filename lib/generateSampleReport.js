function generateSampleReport(playerName, ageGroup, sampleStats) {
  const validAgeGroups = ['U12', 'U14', 'U16', 'U18'];
  if (!validAgeGroups.includes(ageGroup)) ageGroup = 'U14';
  const name = playerName && playerName.trim() ? playerName.trim() : 'Unknown Player';
  const benchmarks = {
    U12: { avgSpeedKmh: { min: 8, max: 15 }, passAccuracy: { min: 50, max: 75 }, distanceCoveredKm: { min: 3, max: 6 }, possessionLost: { min: 5, max: 20 } },
    U14: { avgSpeedKmh: { min: 10, max: 20 }, passAccuracy: { min: 55, max: 80 }, distanceCoveredKm: { min: 4, max: 8 }, possessionLost: { min: 4, max: 18 } },
    U16: { avgSpeedKmh: { min: 12, max: 25 }, passAccuracy: { min: 60, max: 85 }, distanceCoveredKm: { min: 5, max: 10 }, possessionLost: { min: 3, max: 15 } },
    U18: { avgSpeedKmh: { min: 14, max: 30 }, passAccuracy: { min: 65, max: 90 }, distanceCoveredKm: { min: 6, max: 12 }, possessionLost: { min: 2, max: 12 } }
  };
  const bm = benchmarks[ageGroup];
  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
  const notes = [];
  let avgSpeedKmh = sampleStats.avgSpeedKmh !== undefined ? sampleStats.avgSpeedKmh : 'N/A';
  if (typeof avgSpeedKmh === 'number') {
    if (avgSpeedKmh > 40) { avgSpeedKmh = clamp(avgSpeedKmh, 0, 40); notes.push('avgSpeedKmh clamped to 40 km/h (unrealistic value)'); }
    else if (avgSpeedKmh < 0) { avgSpeedKmh = 0; notes.push('avgSpeedKmh set to 0 (negative value)'); }
  }
  let passAccuracy = sampleStats.passAccuracy !== undefined ? sampleStats.passAccuracy : 'N/A';
  if (typeof passAccuracy === 'number') {
    if (passAccuracy > 100) { passAccuracy = 100; notes.push('passAccuracy clamped to 100%'); }
    else if (passAccuracy < 0) { passAccuracy = 0; notes.push('passAccuracy set to 0% (negative value)'); }
  }
  let distanceCoveredKm = sampleStats.distanceCoveredKm !== undefined ? sampleStats.distanceCoveredKm : 'N/A';
  if (typeof distanceCoveredKm === 'number') {
    if (distanceCoveredKm > 20) { distanceCoveredKm = clamp(distanceCoveredKm, 0, 20); notes.push('distanceCoveredKm clamped to 20 km (unrealistic value)'); }
    else if (distanceCoveredKm < 0) { distanceCoveredKm = 0; notes.push('distanceCoveredKm set to 0 km (negative value)'); }
  }
  let possessionLost = sampleStats.possessionLost !== undefined ? sampleStats.possessionLost : 'N/A';
  if (typeof possessionLost === 'number') {
    if (possessionLost > 50) { possessionLost = 50; notes.push('possessionLost clamped to 50 (unrealistic value)'); }
    else if (possessionLost < 0) { possessionLost = 0; notes.push('possessionLost set to 0 (negative value)'); }
  }
  const stats = { avgSpeedKmh, passAccuracy, distanceCoveredKm, possessionLost };
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scout Report - ${name}</title><style>body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5}h1{color:#333}h2{color:#555}.stat{background:#fff;padding:10px;margin:5px 0;border-radius:5px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}.benchmark{color:#888;font-size:0.9em}.note{color:#c00;font-style:italic}.na{color:#999}</style></head><body><h1>Scout Report: ${name}</h1><h2>Age Group: ${ageGroup}</h2><div class="stat"><strong>Average Speed (km/h):</strong> ${typeof stats.avgSpeedKmh === 'number' ? stats.avgSpeedKmh.toFixed(1) : '<span class="na">N/A</span>'} <span class="benchmark">(Benchmark: ${bm.avgSpeedKmh.min}-${bm.avgSpeedKmh.max})</span></div><div class="stat"><strong>Pass Accuracy (%):</strong> ${typeof stats.passAccuracy === 'number' ? stats.passAccuracy.toFixed(1) : '<span class="na">N/A</span>'} <span class="benchmark">(Benchmark: ${bm.passAccuracy.min}-${bm.passAccuracy.max})</span></div><div class="stat"><strong>Distance Covered (km):</strong> ${typeof stats.distanceCoveredKm === 'number' ? stats.distanceCoveredKm.toFixed(1) : '<span class="na">N/A</span>'} <span class="benchmark">(Benchmark: ${bm.distanceCoveredKm.min}-${bm.distanceCoveredKm.max})</span></div><div class="stat"><strong>Possession Lost:</strong> ${typeof stats.possessionLost === 'number' ? stats.possessionLost : '<span class="na">N/A</span>'} <span class="benchmark">(Benchmark: ${bm.possessionLost.min}-${bm.possessionLost.max})</span></div>${notes.length ? '<h3>Notes:</h3><ul>' + notes.map(n => '<li class="note">' + n + '</li>').join('') + '</ul>' : ''}</body></html>`;
  const fs = require('fs');
  const path = require('path');
  const tmpDir = require('os').tmpdir();
  const fileName = `scout_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
  const filePath = path.join(tmpDir, fileName);
  try {
    fs.writeFileSync(filePath, html, 'utf8');
  } catch (err) {
    throw new Error(`Failed to create report file: ${err.message}`);
  }
  return filePath;
}
module.exports = { generateSampleReport };