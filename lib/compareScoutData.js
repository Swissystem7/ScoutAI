function compareScoutData(aiData, humanData, options) {
  if (!Array.isArray(aiData) || !Array.isArray(humanData)) {
    return { success: false, error: "Invalid input: aiData and humanData must be arrays" };
  }
  options = options == null ? {} : options;
  if (typeof options !== "object" || Array.isArray(options)) {
    return { success: false, error: "Invalid options" };
  }
  const timeToleranceMs = (options && options.timeToleranceMs != null) ? options.timeToleranceMs : 5000;
  const humanCostPerMinute = (options && options.humanCostPerMinute != null) ? options.humanCostPerMinute : 0;
  const aiCostPerMatch = (options && options.aiCostPerMatch != null) ? options.aiCostPerMatch : 0;
  if (![timeToleranceMs, humanCostPerMinute, aiCostPerMatch].every(Number.isFinite) ||
      timeToleranceMs < 0 || humanCostPerMinute < 0 || aiCostPerMatch < 0) {
    return { success: false, error: "Invalid options" };
  }
  const isEvent = event => event && typeof event === "object" &&
    Number.isFinite(event.timestamp) && typeof event.eventType === "string" &&
    event.eventType.length > 0 &&
    (event.playerId === undefined || typeof event.playerId === "string");
  if (!aiData.every(isEvent) || !humanData.every(isEvent)) {
    return { success: false, error: "Invalid event data" };
  }
  const totalAiEvents = aiData.length;
  const totalHumanEvents = humanData.length;
  const matchedEvents = [];
  const unmatchedAi = [];
  const unmatchedHuman = [];
  const usedHumanIndices = new Set();
  for (let i = 0; i < aiData.length; i++) {
    const aiEvent = aiData[i];
    let matched = false;
    for (let j = 0; j < humanData.length; j++) {
      if (usedHumanIndices.has(j)) continue;
      const humanEvent = humanData[j];
      if (aiEvent.eventType === humanEvent.eventType && Math.abs(aiEvent.timestamp - humanEvent.timestamp) <= timeToleranceMs) {
        const match = {
          timestamp: aiEvent.timestamp,
          eventType: aiEvent.eventType,
          timeDeltaMs: Math.abs(aiEvent.timestamp - humanEvent.timestamp)
        };
        if (aiEvent.playerId !== undefined) match.playerId = aiEvent.playerId;
        matchedEvents.push(match);
        usedHumanIndices.add(j);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const unmatched = { timestamp: aiEvent.timestamp, eventType: aiEvent.eventType };
      if (aiEvent.playerId !== undefined) unmatched.playerId = aiEvent.playerId;
      unmatchedAi.push(unmatched);
    }
  }
  for (let j = 0; j < humanData.length; j++) {
    if (!usedHumanIndices.has(j)) {
      const unmatched = { timestamp: humanData[j].timestamp, eventType: humanData[j].eventType };
      if (humanData[j].playerId !== undefined) unmatched.playerId = humanData[j].playerId;
      unmatchedHuman.push(unmatched);
    }
  }
  const matchRate = totalHumanEvents > 0 ? matchedEvents.length / totalHumanEvents : 0;
  const estimatedTimeSavedMs = matchedEvents.length * timeToleranceMs;
  const costPerPlayerAi = totalAiEvents > 0 ? (aiCostPerMatch * totalAiEvents) / totalAiEvents : 0;
  const costPerPlayerHuman = totalHumanEvents > 0 ? (humanCostPerMinute * (totalHumanEvents * timeToleranceMs / 60000)) / totalHumanEvents : 0;
  return {
    success: true,
    comparison: {
      totalAiEvents,
      totalHumanEvents,
      matchRate,
      matchedEvents,
      unmatchedAi,
      unmatchedHuman,
      estimatedTimeSavedMs,
      costPerPlayerAi,
      costPerPlayerHuman
    }
  };
}
module.exports = { compareScoutData };
