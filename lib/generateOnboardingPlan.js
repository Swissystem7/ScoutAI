function generateOnboardingPlan(customerProfile, availableMatches) {
  if (!customerProfile || !['coach','agent','academy_admin'].includes(customerProfile.role) || !['u10','u12','u14','u16','u18'].includes(customerProfile.teamLevel) || !Number.isFinite(customerProfile.ageGroup) || !['free','basic','premium'].includes(customerProfile.subscriptionTier)) {
    return {
      plan: [],
      recommendedMatchId: null,
      completionPercentage: 0
    };
  }

  const { role, teamLevel, ageGroup, subscriptionTier } = customerProfile;

  const steps = [
    { stepId: 'profile_setup', description: 'Complete your profile with team details', actionLabel: 'Set Up Profile', isOptional: false },
    { stepId: 'team_roster', description: 'Add your team roster', actionLabel: 'Add Roster', isOptional: false },
    { stepId: 'first_match_upload', description: 'Upload or link your first match video', actionLabel: 'Upload Match', isOptional: false },
    { stepId: 'view_analytics', description: 'View your first match analytics', actionLabel: 'View Analytics', isOptional: false },
    { stepId: 'invite_staff', description: 'Invite assistant coaches or staff', actionLabel: 'Invite Staff', isOptional: true },
    { stepId: 'set_goals', description: 'Set team goals for the season', actionLabel: 'Set Goals', isOptional: true }
  ];

  if (role === 'academy_admin') {
    steps.push({ stepId: 'manage_academy', description: 'Configure academy-wide settings', actionLabel: 'Manage Academy', isOptional: false });
  }

  if (subscriptionTier === 'premium') {
    steps.push({ stepId: 'advanced_analytics', description: 'Enable advanced analytics features', actionLabel: 'Enable Analytics', isOptional: false });
  }

  const plan = steps.map(step => ({
    ...step,
    isCompleted: false
  }));

  let recommendedMatchId = null;
  if (availableMatches && availableMatches.length > 0) {
    const now = new Date();
    const sorted = availableMatches
      .filter(m => m && m.matchId)
      .slice()
      .sort((a, b) => {
        const aVideo = a.videoAvailable ? 1 : 0;
        const bVideo = b.videoAvailable ? 1 : 0;
        if (aVideo !== bVideo) return bVideo - aVideo;
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        const aDiff = Math.abs(aDate - now);
        const bDiff = Math.abs(bDate - now);
        if (aDiff !== bDiff) return aDiff - bDiff;
        const aAgeMatch = a.homeTeam && a.homeTeam.toLowerCase().includes(teamLevel) ? 1 : 0;
        const bAgeMatch = b.homeTeam && b.homeTeam.toLowerCase().includes(teamLevel) ? 1 : 0;
        return bAgeMatch - aAgeMatch;
      });
    if (sorted.length > 0) {
      recommendedMatchId = sorted[0].matchId;
    }
  }

  const completedCount = plan.filter(s => s.isCompleted).length;
  const completionPercentage = plan.length > 0 ? Math.round((completedCount / plan.length) * 100) : 0;

  return {
    plan,
    recommendedMatchId,
    completionPercentage
  };
}

module.exports = { generateOnboardingPlan };
