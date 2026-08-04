const https = require('https');
const http = require('http');
const crypto = require('crypto');
const storedVideoIds = new Set();

function synchronizeMatchVideos(providerConfig, clubId) {
  return new Promise((resolve) => {
    if (!providerConfig || !['endpoint','accessKey','secretKey','bucket'].every(k => typeof providerConfig[k] === 'string' && providerConfig[k]) || typeof clubId !== 'string' || !clubId) {
      resolve({ videos: [], errors: [{ code: 'AUTH_FAILED', message: 'Invalid provider configuration' }] });
      return;
    }
    const { endpoint, accessKey, secretKey, bucket } = providerConfig;
    const errors = [];
    const videos = [];

    let url;
    try { url = new URL(endpoint); } catch { resolve({videos:[],errors:[{code:'NETWORK_ERROR',message:'Invalid endpoint'}]}); return; }
    if (!['http:','https:'].includes(url.protocol)) { resolve({videos:[],errors:[{code:'NETWORK_ERROR',message:'Invalid endpoint protocol'}]}); return; }
    const protocol = url.protocol === 'https:' ? https : http;

    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const service = 's3';
    const region = 'us-east-1';
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const canonicalUri = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(bucket)}/${encodeURIComponent(clubId)}/videos`.replace(/\/+/g, '/');
    const canonicalQuerystring = '';
    const canonicalHeaders = `host:${url.hostname}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const kSecret = crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
    const kDate = crypto.createHmac('sha256', kSecret).update(region).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kRegion).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: canonicalUri,
      method: 'GET',
      headers: {
        'Host': url.hostname,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorizationHeader
      },
      timeout: 10000
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 403 || res.statusCode === 401) {
          errors.push({ code: 'AUTH_FAILED', message: 'Invalid credentials' });
          finish({ videos: [], errors });
          return;
        }
        if (res.statusCode !== 200) {
          errors.push({ code: 'UNKNOWN', message: `HTTP ${res.statusCode}` });
          finish({ videos: [], errors });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (!parsed || !Array.isArray(parsed)) {
            finish({ videos: [], errors });
            return;
          }
          for (const item of parsed) {
            if (item && typeof item.videoId === 'string' && typeof item.url === 'string' && typeof item.createdAt === 'string' && !storedVideoIds.has(item.videoId)) {
              storedVideoIds.add(item.videoId);
              videos.push({
                videoId: item.videoId,
                url: item.url,
                createdAt: item.createdAt
              });
            }
          }
          finish({ videos, errors });
        } catch (e) {
          errors.push({ code: 'PARSE_ERROR', message: 'Invalid response format' });
          finish({ videos: [], errors });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      errors.push({ code: 'TIMEOUT', message: 'Network timeout exceeded 10s' });
      finish({ videos: [], errors });
    });

    req.on('error', (e) => {
      if (e.code === 'ECONNRESET' || e.message.includes('timeout')) {
        errors.push({ code: 'TIMEOUT', message: 'Network timeout exceeded 10s' });
      } else {
        errors.push({ code: 'NETWORK_ERROR', message: e.message });
      }
      finish({ videos: [], errors });
    });

    req.end();
  });
}

module.exports = { synchronizeMatchVideos };
