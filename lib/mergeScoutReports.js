function mergeScoutReports(aiReport, humanReport) {
  if (aiReport === null || aiReport === undefined || humanReport === null || humanReport === undefined) {
    throw new TypeError("Input reports must not be null or undefined");
  }
  if (aiReport.playerId !== humanReport.playerId) {
    throw new Error("PlayerId mismatch between reports");
  }
  const aiAttrs = Array.isArray(aiReport.attributes) ? aiReport.attributes : [];
  const humanAttrs = Array.isArray(humanReport.attributes) ? humanReport.attributes : [];
  const mergedAttrs = [];
  const allAttributes = new Set();
  const aiMap = new Map();
  const humanMap = new Map();
  for (const attr of aiAttrs) {
    if (!attr || !Number.isFinite(attr.confidence) || attr.confidence < 0 || attr.confidence > 1) {
      throw new TypeError("Non-numeric confidence value in aiReport");
    }
    allAttributes.add(attr.attribute);
    aiMap.set(attr.attribute, attr);
  }
  for (const attr of humanAttrs) {
    allAttributes.add(attr.attribute);
    humanMap.set(attr.attribute, attr);
  }
  for (const attribute of allAttributes) {
    const aiAttr = aiMap.get(attribute);
    const humanAttr = humanMap.get(attribute);
    const aiValue = aiAttr ? aiAttr.value : null;
    const humanValue = humanAttr ? humanAttr.value : null;
    let consensus = false;
    let conflictFlag = false;
    let confidenceDelta = null;
    if (aiAttr && humanAttr) {
      if (typeof aiValue !== typeof humanValue) {
        conflictFlag = true;
        consensus = false;
      } else {
        consensus = aiValue === humanValue;
        conflictFlag = !consensus;
      }
      confidenceDelta = aiAttr.confidence - (humanAttr.note ? 0.5 : 0.5);
    } else if (aiAttr && !humanAttr) {
      confidenceDelta = null;
    } else if (!aiAttr && humanAttr) {
      confidenceDelta = null;
    }
    mergedAttrs.push({
      attribute,
      aiValue,
      humanValue,
      consensus,
      conflictFlag,
      confidenceDelta
    });
  }
  return {
    playerId: aiReport.playerId,
    attributes: mergedAttrs
  };
}

module.exports = { mergeScoutReports };
