function generateMatchReportDigest(report, secretKey) {
  if (!report || typeof report !== 'object' || Object.keys(report).length === 0) {
    return new Error('Empty report');
  }
  if (!secretKey || typeof secretKey !== 'string' || secretKey.length < 8) {
    return new Error('Invalid secretKey');
  }
  let serialized;
  try {
    serialized = JSON.stringify(report);
  } catch (e) {
    return new Error('Report not serializable');
  }
  if (serialized === undefined) return new Error('Report not serializable');
  const timestamp = new Date().toISOString();
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(serialized + '|' + timestamp);
  const digest = hmac.digest('hex');
  return { digest, timestamp };
}
module.exports = { generateMatchReportDigest };
