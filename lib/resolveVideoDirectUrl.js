const http = require('http');
const https = require('https');
const url = require('url');

function resolveVideoDirectUrl(shareLink) {
  return new Promise((resolve) => {
    if (!shareLink || typeof shareLink !== 'string') {
      resolve({ url: null, platform: 'unknown', error: 'Invalid URL format' });
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(shareLink);
    } catch {
      resolve({ url: null, platform: 'unknown', error: 'Invalid URL format' });
      return;
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname.includes('drive.google.com') || hostname.includes('docs.google.com')) {
      handleGoogleDrive(shareLink, parsedUrl, resolve);
    } else if (hostname.includes('dropbox.com')) {
      handleDropbox(shareLink, parsedUrl, resolve);
    } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      resolve({ url: null, platform: 'youtube', error: null });
    } else if (hostname.includes('vimeo.com')) {
      resolve({ url: null, platform: 'vimeo', error: null });
    } else {
      resolve({ url: null, platform: 'unknown', error: 'Unsupported link' });
    }
  });
}

function handleGoogleDrive(shareLink, parsedUrl, resolve) {
  const pathParts = parsedUrl.pathname.split('/');
  const fileIdIndex = pathParts.indexOf('d');
  let fileId = null;

  if (fileIdIndex !== -1 && pathParts[fileIdIndex + 1]) {
    fileId = pathParts[fileIdIndex + 1];
  } else {
    const idParam = parsedUrl.searchParams.get('id');
    if (idParam) {
      fileId = idParam;
    }
  }

  if (!fileId) {
    resolve({ url: null, platform: 'googledrive', error: 'Could not extract file ID' });
    return;
  }

  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  const options = {
    hostname: 'drive.google.com',
    path: `/uc?export=download&id=${fileId}`,
    method: 'HEAD',
    timeout: 10000
  };

  const req = https.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      resolve({ url: directUrl, platform: 'googledrive', error: null });
    } else if (res.statusCode === 404) {
      resolve({ url: null, platform: 'googledrive', error: 'File not found or link expired' });
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      resolve({ url: null, platform: 'googledrive', error: 'Private or requires authentication' });
    } else {
      resolve({ url: null, platform: 'googledrive', error: `HTTP error ${res.statusCode}` });
    }
  });

  req.on('error', (err) => {
    resolve({ url: null, platform: 'googledrive', error: `Network error: ${err.message}` });
  });

  req.on('timeout', () => {
    req.destroy();
    resolve({ url: null, platform: 'googledrive', error: 'Request timeout' });
  });

  req.end();
}

function handleDropbox(shareLink, parsedUrl, resolve) {
  let directUrl = shareLink.replace('?dl=0', '?dl=1');
  if (!directUrl.includes('?dl=')) {
    directUrl += (directUrl.includes('?') ? '&' : '?') + 'dl=1';
  }

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + (parsedUrl.search ? parsedUrl.search.replace('?dl=0', '?dl=1') : '?dl=1'),
    method: 'HEAD',
    timeout: 10000
  };

  const req = https.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      resolve({ url: directUrl, platform: 'dropbox', error: null });
    } else if (res.statusCode === 404) {
      resolve({ url: null, platform: 'dropbox', error: 'Link expired or file not found' });
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      resolve({ url: null, platform: 'dropbox', error: 'Private or requires authentication' });
    } else {
      resolve({ url: null, platform: 'dropbox', error: `HTTP error ${res.statusCode}` });
    }
  });

  req.on('error', (err) => {
    resolve({ url: null, platform: 'dropbox', error: `Network error: ${err.message}` });
  });

  req.on('timeout', () => {
    req.destroy();
    resolve({ url: null, platform: 'dropbox', error: 'Request timeout' });
  });

  req.end();
}

module.exports = { resolveVideoDirectUrl };