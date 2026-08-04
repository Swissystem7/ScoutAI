const fs = require('fs').promises;
const path = require('path');

async function calculateReferralRewards(clubId) {
  if (typeof clubId !== 'string' || !clubId.trim()) throw new Error('clubId is required');
  
  const filePath = path.join(__dirname, 'referralEvents.json');
  let data;
  try {
    data = await fs.readFile(filePath, 'utf8');
  } catch {
    return { totalReferrals: 0, freeMatches: 0, discountPercent: 0 };
  }
  
  let events;
  try {
    events = JSON.parse(data);
  } catch {
    return { totalReferrals: 0, freeMatches: 0, discountPercent: 0 };
  }
  
  if (!Array.isArray(events)) {
    return { totalReferrals: 0, freeMatches: 0, discountPercent: 0 };
  }
  
  const totalReferrals = events.filter(e => e && e.clubId === clubId && typeof e.referredClubId === 'string' && Number.isFinite(Date.parse(e.timestamp))).length;
  const freeMatches = Math.floor(totalReferrals / 3);
  const discountPercent = Math.min(Math.floor(totalReferrals / 5) * 5, 20);
  
  return { totalReferrals, freeMatches, discountPercent };
}

module.exports = { calculateReferralRewards };
