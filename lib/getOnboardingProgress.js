function getOnboardingProgress(config) {
  if (config === null || config === undefined || typeof config !== 'object') {
    throw new TypeError("config must be an object");
  }
  const { teamCount, playerCount, videoSourcesCount, firstMatchAnalyzed } = config;
  if (teamCount === undefined || playerCount === undefined || videoSourcesCount === undefined || firstMatchAnalyzed === undefined) {
    throw new TypeError("config missing required fields");
  }
  if (![teamCount, playerCount, videoSourcesCount].every(Number.isInteger) || [teamCount, playerCount, videoSourcesCount].some(n => n < 0) || typeof firstMatchAnalyzed !== 'boolean') {
    throw new TypeError("config fields have invalid types");
  }
  const hasTeam = teamCount > 0;
  const hasPlayers = hasTeam && playerCount > 0;
  const hasVideo = hasPlayers && videoSourcesCount > 0;
  const steps = [
    { name: "Add team", done: hasTeam },
    { name: "Import players", done: hasPlayers },
    { name: "Connect video source", done: hasVideo },
    { name: "Analyze first match", done: hasVideo && firstMatchAnalyzed }
  ];
  const doneCount = steps.filter(s => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);
  let nextAction;
  if (progress === 100) {
    nextAction = "Start scouting";
  } else {
    const nextStep = steps.find(s => !s.done);
    nextAction = nextStep ? nextStep.name : "Start scouting";
  }
  return { progress, steps, nextAction };
}
module.exports = { getOnboardingProgress };
