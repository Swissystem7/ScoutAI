const https = require('https');
const url = require('url');
const crypto = require('crypto');

const dedupCache = new Set();

function generateCacheKey(matchId, platform) {
  return crypto.createHash('md5').update(`${platform}:${matchId}`).digest('hex');
}

function isDuplicate(matchId, platform) {
  return dedupCache.has(generateCacheKey(matchId, platform));
}

function addToCache(matchId, platform) {
  dedupCache.add(generateCacheKey(matchId, platform));
}

function validateApiConfig(apiConfig) {
  if (!apiConfig || typeof apiConfig !== 'object') return false;
  if (!['hudl', 'veo', 'youtube'].includes(apiConfig.platform)) return false;
  if (!apiConfig.apiKey || typeof apiConfig.apiKey !== 'string') return false;
  if (apiConfig.platform === 'hudl' && !apiConfig.teamId) return false;
  if (apiConfig.platform === 'youtube' && !apiConfig.channelId) return false;
  return true;
}

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', (e) => reject(new Error('NETWORK_ERROR')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fetchWithRetry(urlStr, options, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await makeRequest({ ...options, hostname: new URL(urlStr).hostname, path: new URL(urlStr).pathname + new URL(urlStr).search });
      if (response.statusCode === 429) {
        if (attempt === retries - 1) return { error: 'RATE_LIMITED' };
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (response.statusCode === 401 || response.statusCode === 403) return { error: 'AUTH_FAILED' };
      return response;
    } catch (e) {
      if (attempt === retries - 1) return { error: 'NETWORK_ERROR' };
      await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
    }
  }
  return { error: 'NETWORK_ERROR' };
}

async function fetchHudlVideos(apiConfig, lastSyncTimestamp) {
  const matches = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const urlStr = `https://api.hudl.com/v1/teams/${apiConfig.teamId}/videos?page=${page}&per_page=50`;
    const result = await fetchWithRetry(urlStr, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiConfig.apiKey}`, 'Content-Type': 'application/json' }
    });
    if (result.error) return result;
    const data = result.body;
    if (!data || !data.videos) break;
    for (const video of data.videos) {
      const matchId = video.id;
      if (isDuplicate(matchId, 'hudl')) continue;
      const videoDate = new Date(video.date);
      if (lastSyncTimestamp && videoDate <= lastSyncTimestamp) continue;
      matches.push({
        matchId: matchId,
        title: video.title || 'Untitled',
        videoUrl: video.url,
        date: new Date(videoDate.toISOString())
      });
      addToCache(matchId, 'hudl');
    }
    hasMore = data.pagination && data.pagination.next_page;
    page++;
  }
  return { success: true, matches };
}

async function fetchVeoVideos(apiConfig, lastSyncTimestamp) {
  const matches = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const urlStr = `https://api.veo.co/v1/matches?page=${page}&per_page=50`;
    const result = await fetchWithRetry(urlStr, {
      method: 'GET',
      headers: { 'x-api-key': apiConfig.apiKey, 'Content-Type': 'application/json' }
    });
    if (result.error) return result;
    const data = result.body;
    if (!data || !data.matches) break;
    for (const match of data.matches) {
      const matchId = match.id;
      if (isDuplicate(matchId, 'veo')) continue;
      const matchDate = new Date(match.date);
      if (lastSyncTimestamp && matchDate <= lastSyncTimestamp) continue;
      matches.push({
        matchId: matchId,
        title: match.title || 'Untitled',
        videoUrl: match.video_url,
        date: new Date(matchDate.toISOString())
      });
      addToCache(matchId, 'veo');
    }
    hasMore = data.pagination && data.pagination.next_page;
    page++;
  }
  return { success: true, matches };
}

async function fetchYoutubeVideos(apiConfig, lastSyncTimestamp) {
  const matches = [];
  let pageToken = '';
  let hasMore = true;
  while (hasMore) {
    let urlStr = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${apiConfig.channelId}&maxResults=50&type=video&key=${apiConfig.apiKey}`;
    if (pageToken) urlStr += `&pageToken=${pageToken}`;
    const result = await fetchWithRetry(urlStr, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (result.error) return result;
    const data = result.body;
    if (!data || !data.items) break;
    for (const item of data.items) {
      const matchId = item.id.videoId;
      if (isDuplicate(matchId, 'youtube')) continue;
      const videoDate = new Date(item.snippet.publishedAt);
      if (lastSyncTimestamp && videoDate <= lastSyncTimestamp) continue;
      matches.push({
        matchId: matchId,
        title: item.snippet.title || 'Untitled',
        videoUrl: `https://www.youtube.com/watch?v=${matchId}`,
        date: new Date(videoDate.toISOString())
      });
      addToCache(matchId, 'youtube');
    }
    hasMore = data.nextPageToken ? true : false;
    pageToken = data.nextPageToken || '';
  }
  return { success: true, matches };
}

async function syncClubVideos(apiConfig, lastSyncTimestamp) {
  if (!validateApiConfig(apiConfig)) {
    return { success: false, error: 'INVALID_PLATFORM' };
  }
  if (lastSyncTimestamp !== null &&
      (!(lastSyncTimestamp instanceof Date) || Number.isNaN(lastSyncTimestamp.getTime()))) {
    return { success: false, error: 'INVALID_TIMESTAMP' };
  }
  try {
    let result;
    switch (apiConfig.platform) {
      case 'hudl':
        result = await fetchHudlVideos(apiConfig, lastSyncTimestamp);
        break;
      case 'veo':
        result = await fetchVeoVideos(apiConfig, lastSyncTimestamp);
        break;
      case 'youtube':
        result = await fetchYoutubeVideos(apiConfig, lastSyncTimestamp);
        break;
      default:
        return { success: false, error: 'INVALID_PLATFORM' };
    }
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, matches: result.matches };
  } catch (e) {
    return { success: false, error: 'NETWORK_ERROR' };
  }
}

module.exports = { syncClubVideos };
