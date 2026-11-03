'use strict';

// CT-010 health pass: local static server, 44px tap targets, keyboard-reachable scroll regions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createServer, resolveRequest } = require('../tools/serve.js');

const root = path.join(__dirname, '..');
const PAGES = ['index.html', 'trap/index.html', 'licence.html', 'offer.html'];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function get(port, urlPath) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: urlPath }, function (res) {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () { resolve({ status: res.statusCode, type: res.headers['content-type'], body: body }); });
    }).on('error', reject);
  });
}

test('npm start serves the lab and the dataset it fetches', async function () {
  const server = createServer(root);
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  try {
    const page = await get(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.type, /^text\/html/);
    assert.ok(page.body.includes('demo.js'));
    const data = await get(port, '/data/wc2018_event_aggregates.json');
    assert.equal(data.status, 200);
    assert.ok(Array.isArray(JSON.parse(data.body).players));
    const trap = await get(port, '/trap/');
    assert.equal(trap.status, 200);
    assert.equal((await get(port, '/nope.html')).status, 404);
  } finally {
    server.close();
  }
});

test('the local server never serves files outside the shipped product', function () {
  assert.equal(resolveRequest('/../package.json', root), path.join(root, 'package.json'), 'URL normalisation keeps ".." inside the root');
  ['/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc%2fpasswd', '/..\\..\\etc\\passwd'].forEach(function (url) {
    const file = resolveRequest(url, root);
    assert.ok(file === null || file.startsWith(root + path.sep), url + ' must stay inside the repository');
  });
  assert.equal(resolveRequest('/.git/config', root), null);
  assert.equal(resolveRequest('/attic/proof-demo.js', root), null);
  assert.equal(resolveRequest('/tools/serve.js', root), null);
  assert.equal(resolveRequest('/index.html%00.json', root), null);
  assert.equal(resolveRequest('/index.html', root), path.join(root, 'index.html'));
});

test('package.json has one-command start and test', function () {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.scripts.start, 'node tools/serve.js');
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [], 'no runtime dependencies');
});

for (const page of PAGES) {
  test(page + ': tap targets are at least 44px and checkbox/radio labels carry the target', function () {
    const html = read(page);
    assert.match(html, /\.skip\{[^}]*min-height:44px/, 'skip links');
    assert.match(html, /input\[type=range\]\{min-height:44px\}/, 'sliders');
    assert.match(html, /label:has\(> input\[type=checkbox\]\),label:has\(> input\[type=radio\]\)\{[^}]*min-height:44px/, 'checkbox and radio labels');
    assert.match(html, /footer a,\.nav a\{[^}]*min-height:44px;min-width:44px/, 'footer and nav links');
  });
}

test('every scrollable box can be reached and scrolled from the keyboard (WCAG 2.1.1)', function () {
  const expectations = {
    'index.html': ['explorerTable', 'methodText', 'exportJson'],
    'trap/index.html': ['atticRank', 'archiveDump']
  };
  Object.keys(expectations).forEach(function (page) {
    const html = read(page);
    expectations[page].forEach(function (id) {
      const tag = html.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>'));
      assert.ok(tag, page + ' #' + id + ' exists');
      assert.match(tag[0], /tabindex="0"/, page + ' #' + id + ' is focusable');
      assert.match(tag[0], /role="region"/, page + ' #' + id + ' is a named region');
      assert.match(tag[0], /aria-label="[^"]+"/, page + ' #' + id + ' has a name');
    });
  });
});
