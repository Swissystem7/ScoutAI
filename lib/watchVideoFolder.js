function watchVideoFolder(folderPath, callback, options = {}) {
  const fs = require('fs');
  const path = require('path');
  const { videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'], pollIntervalMs = 1000, ignoreExisting = true } = options;
  const seenFiles = new Set();
  let watcher = null;
  let pollingTimer = null;
  let stopped = false;

  if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath) || typeof callback !== 'function' ||
      !options || typeof options !== 'object' || Array.isArray(options) ||
      !Array.isArray(videoExtensions) || !videoExtensions.every(ext => typeof ext === 'string') ||
      !Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0 ||
      typeof ignoreExisting !== 'boolean') {
    return { success: false, error: 'Invalid input' };
  }
  if (!fs.existsSync(folderPath)) {
    return { success: false, error: `Folder does not exist: ${folderPath}` };
  }

  try {
    fs.accessSync(folderPath, fs.constants.R_OK);
    if (!fs.statSync(folderPath).isDirectory()) {
      return { success: false, error: `Not a folder: ${folderPath}` };
    }
  } catch (e) {
    return { success: false, error: `Permission denied: ${folderPath}` };
  }

  const isVideoFile = (fileName) => {
    const ext = path.extname(fileName).toLowerCase();
    return videoExtensions.includes(ext);
  };

  const processFile = (filePath) => {
    if (stopped) return;
    const fileName = path.basename(filePath);
    if (!isVideoFile(fileName)) return;
    if (seenFiles.has(fileName)) return;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;
      seenFiles.add(fileName);
      callback({
        filePath,
        fileName,
        sizeBytes: stat.size,
        createdAt: stat.birthtime || stat.ctime
      });
    } catch (e) {
      // ignore errors on individual files
    }
  };

  const scanExisting = () => {
    try {
      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        const fullPath = path.join(folderPath, file);
        if (ignoreExisting) {
          if (isVideoFile(file) && fs.statSync(fullPath).isFile()) seenFiles.add(file);
        } else {
          processFile(fullPath);
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const poll = () => {
    if (stopped) return;
    try {
      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        const fullPath = path.join(folderPath, file);
        processFile(fullPath);
      }
    } catch (e) {
      stop();
    }
  };

  const stop = () => {
    stopped = true;
    if (watcher) {
      try { watcher.close(); } catch (e) {}
      watcher = null;
    }
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };

  scanExisting();

  try {
    watcher = fs.watch(folderPath, (eventType, fileName) => {
      if (stopped) return;
      if (fileName) {
        const fullPath = path.join(folderPath, fileName);
        processFile(fullPath);
      }
    });
    watcher.on('error', () => {
      stop();
    });
  } catch (e) {
    // fallback to polling
    watcher = null;
    pollingTimer = setInterval(poll, pollIntervalMs);
  }

  return {
    success: true,
    watcher: { stop }
  };
}

module.exports = { watchVideoFolder };
