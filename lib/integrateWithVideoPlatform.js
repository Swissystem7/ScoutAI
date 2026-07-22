const { randomUUID } = require('crypto');
const supportedPlatforms = new Set(['veo', 'hudl']);
const analyzedUrls = new Map();

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function integrateWithVideoPlatform(webhookPayload) {

  if (!webhookPayload || typeof webhookPayload !== 'object') {
    throw new ValidationError('Invalid payload');
  }

  const { platform, videoUrl, matchId, metadata } = webhookPayload;

  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new ValidationError('missing videoUrl');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(videoUrl);
  } catch {
    return { status: 'failed', analysisId: '', error: 'Invalid URL format' };
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    return { status: 'failed', analysisId: '', error: 'Invalid URL format' };
  }

  if (typeof platform !== 'string' || !supportedPlatforms.has(platform.toLowerCase())) {
    return { status: 'failed', analysisId: '', error: `Unsupported platform: ${platform}` };
  }

  if (analyzedUrls.has(videoUrl)) {
    return { status: 'completed', analysisId: analyzedUrls.get(videoUrl), error: undefined };
  }

  let resolvedMatchId = matchId;
  if (!resolvedMatchId) {
    resolvedMatchId = metadata?.matchId || metadata?.gameId || `auto-${randomUUID()}`;
  }

  const analysisId = `analysis-${randomUUID()}`;
  analyzedUrls.set(videoUrl, analysisId);

  return { status: 'processing', analysisId, error: undefined };
}

module.exports = { integrateWithVideoPlatform };
