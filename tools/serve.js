#!/usr/bin/env node
// Zero-dependency static server for local runs: `npm start`, then open http://localhost:8080/.
// The lab fetches data/*.json with a relative URL, which browsers block from file://.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
// Only the shipped product is served: no .git, no attic, no tooling.
const BLOCKED = /^(\.|attic(\/|$)|node_modules(\/|$)|tools(\/|$)|test(\/|$))/;

function resolveRequest(rawUrl, root) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
  } catch (err) {
    return null;
  }
  if (pathname.includes('\0')) return null;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, '.' + pathname);
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || BLOCKED.test(rel)) return null;
  return file;
}

function createServer(root) {
  const base = path.resolve(root || ROOT);
  return http.createServer(function (req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    const file = resolveRequest(req.url, base);
    fs.stat(file || '', function (err, stat) {
      if (!file || err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
}

module.exports = { createServer, resolveRequest };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer(ROOT).listen(port, '127.0.0.1', function () {
    console.log('ScoutAI: http://localhost:' + port + '/');
  });
}
