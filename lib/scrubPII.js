function scrubPII(playerData, piiFields, hashingKey) {
  if (playerData == null) return { scrubbedData: {}, removedFields: [] };
  if (typeof playerData !== 'object' || !Array.isArray(piiFields)) throw new TypeError('Invalid input');
  if (!Array.isArray(piiFields) || piiFields.length === 0) return { scrubbedData: JSON.parse(JSON.stringify(playerData)), removedFields: [] };
  const scrubbedData = JSON.parse(JSON.stringify(playerData));
  const removedFields = [];
  for (const fieldPath of piiFields) {
    if (typeof fieldPath !== 'string' || fieldPath === '') continue;
    const parts = fieldPath.split('.');
    let current = scrubbedData;
    let parent = null;
    let lastKey = null;
    let pathExists = true;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (key === '__proto__' || key === 'prototype' || key === 'constructor' || current == null ||
          typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
        pathExists = false;
        break;
      }
      parent = current;
      lastKey = key;
      current = current[key];
    }
    if (!pathExists) continue;
    const originalValue = parent[lastKey];
    if (hashingKey) {
      const hash = require('crypto').createHash('sha256').update(String(originalValue) + hashingKey).digest('hex');
      parent[lastKey] = hash;
    } else {
      delete parent[lastKey];
    }
    removedFields.push(fieldPath);
  }
  return { scrubbedData, removedFields };
}
module.exports = { scrubPII };
