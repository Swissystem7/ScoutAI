function createAiPredictionAudit(apiKey, scoutId, playerId, rawVideoFrames, aiOutput, lastAuditHash) {
  const validApiKey = "valid-api-key-12345";
  if (apiKey !== validApiKey) {
    throw new Error("Invalid API key");
  }
  if (typeof aiOutput !== "object" || aiOutput === null || Array.isArray(aiOutput)) {
    throw new Error("aiOutput must be a JSON-serializable object");
  }
  let serializedOutput;
  try {
    serializedOutput = JSON.stringify(aiOutput);
  } catch {
    throw new Error("aiOutput is not JSON-serializable");
  }
  if (serializedOutput === undefined) {
    throw new Error("aiOutput is not JSON-serializable");
  }
  if (!Array.isArray(rawVideoFrames) || !rawVideoFrames.every(Buffer.isBuffer)) {
    throw new TypeError("rawVideoFrames must be an array of Buffers");
  }
  const crypto = require("crypto");
  const framesHash = rawVideoFrames.length === 0
    ? crypto.createHash("sha256").update("empty").digest("hex")
    : crypto.createHash("sha256").update(Buffer.concat(rawVideoFrames)).digest("hex");
  const timestamp = Date.now();
  const chainInput = framesHash + serializedOutput + timestamp + (lastAuditHash ?? "null");
  const chainHash = crypto.createHash("sha256").update(chainInput).digest("hex");
  const auditId = crypto.randomUUID();
  const record = { auditId, scoutId, playerId, framesHash, aiOutput, timestamp, lastAuditHash: lastAuditHash ?? null, chainHash };
  if (!globalThis.auditStore) {
    globalThis.auditStore = [];
  }
  globalThis.auditStore.push(record);
  return { auditId, chainHash, timestamp };
}
module.exports = { createAiPredictionAudit };
