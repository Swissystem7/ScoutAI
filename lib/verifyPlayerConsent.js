function verifyPlayerConsent(playerId, scoutId, clientToken, storedConsentDigest, consentDBPath) {
  const fs = require('fs');
  const crypto = require('crypto');
  let consentDB;
  try {
    const raw = fs.readFileSync(consentDBPath, 'utf8');
    consentDB = JSON.parse(raw);
  } catch (e) {
    throw new Error('consentDB corrupt');
  }
  if (!Array.isArray(consentDB)) {
    throw new Error('consentDB corrupt');
  }
  const record = consentDB.find(r => r.id === playerId);
  if (!record) {
    return { valid: false, message: 'unknown player' };
  }
  if (record.token !== clientToken) {
    return { valid: false, message: 'token expired' };
  }
  if (record.revoked === true) {
    return { valid: false, message: 'revoked' };
  }
  const computedDigest = crypto.createHash('sha256').update(record.id + record.token + record.date + String(record.revoked)).digest('hex');
  if (computedDigest !== storedConsentDigest) {
    return { valid: false, message: 'data tampered' };
  }
  return { valid: true, message: 'consent verified' };
}
module.exports = { verifyPlayerConsent };