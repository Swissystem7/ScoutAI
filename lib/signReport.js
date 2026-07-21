function signReport(report, secret) {
  if (typeof report !== 'object' || report === null) throw new Error('Invalid report');
  if (typeof secret !== 'string') secret = '';
  if (secret === '') secret = 'default';
  const seen = new WeakSet();
  function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) throw new Error('Circular reference');
    seen.add(obj);
    const sorted = Array.isArray(obj) ? obj.map(sortKeys) : {};
    if (!Array.isArray(obj)) Object.keys(obj).sort().forEach(k => { sorted[k] = sortKeys(obj[k]); });
    seen.delete(obj);
    return sorted;
  }
  const { signature: _oldSignature, ...unsignedReport } = report;
  const sortedReport = sortKeys(unsignedReport);
  const json = JSON.stringify(sortedReport);
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', secret).update(json).digest('hex');
  return { ...report, signature };
}

function verifyReport(signedReport, secret) {
  if (typeof signedReport !== 'object' || signedReport === null) return { valid: false, report: null };
  if (typeof secret !== 'string') secret = '';
  if (secret === '') secret = 'default';
  const { signature, ...report } = signedReport;
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return { valid: false, report: null };
  try {
    const recomputed = signReport(report, secret);
    const crypto = require('crypto');
    const valid = crypto.timingSafeEqual(Buffer.from(recomputed.signature, 'hex'), Buffer.from(signature, 'hex'));
    return { valid, report: valid ? report : null };
  } catch {
    return { valid: false, report: null };
  }
}

module.exports = { signReport, verifyReport };
