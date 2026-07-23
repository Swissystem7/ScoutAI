const crypto = require('crypto');

function getKey(secret) {
  if (typeof secret !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(secret)) {
    throw new TypeError('Invalid secret');
  }
  return Buffer.from(secret, 'base64');
}

function generateAuditToken(analysisId, userId, timestamp, secret) {
  if (typeof analysisId !== 'string' || typeof userId !== 'string' || analysisId.includes(':') || userId.includes(':')) {
    throw new TypeError('Invalid identifier');
  }
  if (typeof timestamp !== 'number') {
    timestamp = Number(timestamp);
    if (isNaN(timestamp)) throw new Error('Invalid timestamp');
  }
  const raw = `${analysisId}:${userId}:${timestamp}`;
  const token = Buffer.from(raw).toString('base64');
  if (!Number.isFinite(timestamp)) throw new Error('Invalid timestamp');
  const hmac = crypto.createHmac('sha256', getKey(secret)).update(token).digest('hex');
  return { token, hmac };
}

function verifyAuditToken(token, hmac, secret) {
  try {
    if (typeof token !== 'string' || typeof hmac !== 'string' || !/^[a-f\d]{64}$/i.test(hmac)) return { valid: false, payload: null };
    const tokenBytes = Buffer.from(token, 'base64');
    if (tokenBytes.toString('base64') !== token) return { valid: false, payload: null };
    const decoded = tokenBytes.toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return { valid: false, payload: null };
    const [analysisId, userId, timestampStr] = parts;
    const timestamp = Number(timestampStr);
    if (!Number.isFinite(timestamp)) return { valid: false, payload: null };
    const expectedHmac = crypto.createHmac('sha256', getKey(secret)).update(token).digest();
    const suppliedHmac = Buffer.from(hmac, 'hex');
    if (!crypto.timingSafeEqual(suppliedHmac, expectedHmac)) return { valid: false, payload: null };
    return { valid: true, payload: { analysisId, userId, timestamp } };
  } catch {
    return { valid: false, payload: null };
  }
}

module.exports = { generateAuditToken, verifyAuditToken };
