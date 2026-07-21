const referralEpoch = Date.now();
const referrals = {
    "TOKEN123": { referrerClubId: "clubA", expiresAt: referralEpoch + 100000, redeemed: false },
    "TOKEN456": { referrerClubId: "clubB", expiresAt: referralEpoch - 1000, redeemed: false },
    "TOKEN789": { referrerClubId: "clubC", expiresAt: referralEpoch + 100000, redeemed: true },
    "TOKEN999": { referrerClubId: "clubD", expiresAt: referralEpoch + 100000, redeemed: false }
};
const discountedClubs = new Set(["clubAlreadyDiscounted"]);
const paidClubs = new Set(["clubAlreadyPaid"]);

function applyReferralDiscount(referralToken, newClubId) {
  const now = Date.now();
  if (typeof referralToken !== 'string' || !referralToken.trim() || typeof newClubId !== 'string' || !newClubId.trim()) {
    return { success: false, discountPercent: 0, message: "Invalid referral token." };
  }

  if (!referralToken || !referrals[referralToken]) {
    return { success: false, discountPercent: 0, message: "Invalid referral token." };
  }

  const referral = referrals[referralToken];

  if (referral.expiresAt < now) {
    return { success: false, discountPercent: 0, message: "Referral link expired." };
  }

  if (referral.redeemed) {
    return { success: false, discountPercent: 0, message: "Referral already used." };
  }

  if (referral.referrerClubId === newClubId) {
    return { success: false, discountPercent: 0, message: "Cannot refer yourself." };
  }

  if (discountedClubs.has(newClubId) || paidClubs.has(newClubId)) {
    return { success: false, discountPercent: 0, message: "Club not eligible for referral discount." };
  }

  referral.redeemed = true;
  return { success: true, discountPercent: 20, message: "Referral discount applied successfully." };
}

module.exports = { applyReferralDiscount };
