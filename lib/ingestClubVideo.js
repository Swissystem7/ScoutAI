const { createHash, randomUUID } = require('crypto');
const { existsSync, statSync } = require('fs');
const http = require('http');
const https = require('https');

const jobStore = new Map();

function computeHash(data) {
  return createHash('sha256').update(data).digest('hex');
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    const ext = parsed.pathname.split('.').pop().toLowerCase();
    const validExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
    return validExtensions.includes(ext);
  } catch {
    return false;
  }
}

function checkUrlReachable(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function ingestClubVideo(videoSource, clubId, options = {}) {
  if (typeof videoSource !== 'string' || typeof clubId !== 'string' || !clubId.trim()) throw new Error('InvalidSource');
  let hash;
  let source;

  if (videoSource.startsWith('http://') || videoSource.startsWith('https://')) {
    if (!validateUrl(videoSource)) {
      throw new Error('InvalidSource');
    }
    const reachable = await checkUrlReachable(videoSource);
    if (!reachable) {
      throw new Error('SourceNotFound');
    }
    hash = computeHash(videoSource);
    source = videoSource;
  } else {
    if (!existsSync(videoSource)) {
      throw new Error('SourceNotFound');
    }
    const stats = statSync(videoSource);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error('SourceNotFound');
    }
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(videoSource);
    hash = computeHash(fileBuffer);
    source = videoSource;
  }

  const existingJob = jobStore.get(hash);
  if (existingJob && !options.overwrite) {
    const err = new Error('DuplicateVideo');
    err.jobId = existingJob.jobId;
    throw err;
  }

  const jobId = randomUUID();
  const payload = { hash, clubId, source };

  try {
    const response = await new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const url = new URL('https://pipeline.scoutai.tech/ingest');
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('IngestionFailed'));
          }
        });
      });
      req.on('error', () => reject(new Error('IngestionFailed')));
      req.write(postData);
      req.end();
    });

    if (!response.jobId) {
      throw new Error('IngestionFailed');
    }

    jobStore.set(hash, { jobId, status: 'queued' });
    return { jobId: response.jobId, status: 'queued' };
  } catch (error) {
    if (error.message === 'IngestionFailed') {
      throw error;
    }
    throw new Error('IngestionFailed');
  }
}

module.exports = { ingestClubVideo };
