const fs = require('fs');
const path = require('path');

function monitorVideoFolder(folderPath, callback, intervalMs = 10000) {
  if (typeof folderPath !== 'string' || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Folder does not exist: ${folderPath}`);
  }
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    intervalMs = 10000;
  }

  const seen = new Set();
  let watcher = null;
  let stopped = false;
  let retryTimer = null;
  const pendingTimers = new Set();

  function retryOnEmfile(err) {
    if (!stopped && err && err.code === 'EMFILE') {
      if (watcher) watcher.close();
      watcher = null;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(startWatcher, 1000);
      return true;
    }
    return false;
  }

  function startWatcher() {
    try {
      watcher = fs.watch(folderPath, (eventType, filename) => {
        if (stopped || !filename) return;
        const ext = path.extname(filename).toLowerCase();
        if (ext !== '.mp4' && ext !== '.mov' && ext !== '.avi') return;
        const fullPath = path.resolve(folderPath, filename);
        if (seen.has(fullPath)) return;
        seen.add(fullPath);
        const timer = setTimeout(() => {
          pendingTimers.delete(timer);
          if (!stopped) {
            callback(fullPath);
          }
        }, 5000);
        pendingTimers.add(timer);
      });
      watcher.on('error', err => {
        if (!retryOnEmfile(err)) watcher.close();
      });
    } catch (err) {
      if (!retryOnEmfile(err)) {
        throw err;
      }
    }
  }

  const initialFiles = new Set(fs.readdirSync(folderPath).map(f => path.resolve(folderPath, f)));
  initialFiles.forEach(f => seen.add(f));

  startWatcher();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(retryTimer);
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      if (watcher) {
        watcher.close();
      }
    }
  };
}

module.exports = { monitorVideoFolder };
