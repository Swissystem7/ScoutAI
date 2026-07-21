function anonymizePlayerData(playerData) {
  if (!playerData || typeof playerData !== 'object') {
    throw new TypeError('playerData must be an object');
  }
  const { name, dob, club } = playerData;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('name must be a non-empty string');
  }
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    throw new TypeError('dob must be in YYYY-MM-DD format');
  }
  if (typeof club !== 'string' || club.trim() === '') {
    throw new TypeError('club must be a non-empty string');
  }
  const crypto = require('crypto');
  const hashInput = name + club;
  const fullHash = crypto.createHash('sha256').update(hashInput).digest('hex');
  const anonymizedId = fullHash.substring(0, 8);
  const timestamp = new Date().toISOString();
  const token = fullHash + timestamp;
  const mapping = anonymizePlayerData._mapping || (anonymizePlayerData._mapping = new Map());
  mapping.set(token, { name, dob, club });
  return { anonymizedId, token };
}
module.exports = { anonymizePlayerData };
