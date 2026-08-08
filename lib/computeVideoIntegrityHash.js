const crypto = require('crypto');

function computeVideoIntegrityHash(videoBuffer) {
  if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
    throw new TypeError('videoBuffer must be a non-empty Buffer');
  }
  const hash = crypto.createHash('sha256').update(videoBuffer).digest('hex');
  return { hash, algorithm: 'sha256' };
}

module.exports = { computeVideoIntegrityHash };