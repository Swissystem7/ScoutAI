const fs = require('fs');
const path = require('path');

function exportPlayerComparisonReport(playersData, outputFilePath) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(playersData) || typeof outputFilePath !== 'string' || !outputFilePath) return reject(new TypeError('Invalid input'));
    const csv = value => {
      let text = value === undefined || value === null ? '' : String(value);
      // Prevent spreadsheet formula execution when reports are opened interactively.
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const dir = path.dirname(outputFilePath);
    fs.access(dir, fs.constants.W_OK, (err) => {
      if (err) {
        err.code = 'ENOENT';
        return reject(err);
      }

      const allMetrics = new Set();
      playersData.forEach(p => {
        if (p.metrics) {
          Object.keys(p.metrics).forEach(k => allMetrics.add(k));
        }
      });
      const metricKeys = Array.from(allMetrics);
      const header = ['playerName', 'matchId', ...metricKeys];

      const writeStream = fs.createWriteStream(outputFilePath);
      writeStream.on('error', (err) => reject(err));
      writeStream.on('finish', () => {
        const rowCount = playersData.length;
        resolve({ filePath: outputFilePath, rowCount });
      });

      writeStream.write(header.map(csv).join(',') + '\n');

      if (playersData.length === 0) {
        writeStream.end();
        return;
      }

      if (playersData.length > 10000) {
        let i = 0;
        function writeNext() {
          let ok = true;
          while (i < playersData.length && ok) {
            const p = playersData[i];
            const row = [p.playerName, p.matchId];
            metricKeys.forEach(k => {
              row.push(p.metrics && p.metrics[k] !== undefined ? p.metrics[k] : '');
            });
            ok = writeStream.write(row.map(csv).join(',') + '\n');
            i++;
          }
          if (i < playersData.length) {
            writeStream.once('drain', writeNext);
          } else {
            writeStream.end();
          }
        }
        writeNext();
      } else {
        playersData.forEach(p => {
          const row = [p.playerName, p.matchId];
          metricKeys.forEach(k => {
            row.push(p.metrics && p.metrics[k] !== undefined ? p.metrics[k] : '');
          });
          writeStream.write(row.map(csv).join(',') + '\n');
        });
        writeStream.end();
      }
    });
  });
}

module.exports = { exportPlayerComparisonReport };
