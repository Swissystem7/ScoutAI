const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'referrals.json');

function readDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeDb(db) {
  return new Promise((resolve, reject) => {
    fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8', (err) => {
      if (err) reject(new Error('Failed to write referral database'));
      else resolve();
    });
  });
}

async function generateReferralLink(clubId) {
  if (typeof clubId !== 'string' || clubId.trim() === '') {
    throw new Error('clubId must be a non-empty string');
  }

  const db = readDb();
  let referralCode;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    referralCode = crypto.randomBytes(4).toString('hex');
    if (!db[referralCode]) break;
    attempts++;
  }

  if (attempts === maxAttempts) {
    throw new Error('Unable to generate unique referral code');
  }

  db[referralCode] = {
    clubId: clubId.trim(),
    createdAt: new Date().toISOString()
  };

  await writeDb(db);

  return {
    referralCode,
    link: `https://scoutshare.app/refer/${referralCode}`
  };
}

module.exports = { generateReferralLink };