'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const PAGES = ['index.html', 'offer.html', 'licence.html', path.join('trap', 'index.html')];

function read(page) {
  return fs.readFileSync(path.join(root, page), 'utf8');
}

// href/src values in markup; template literals inside <script> are skipped by requiring a plain quoted value.
function refs(html) {
  const out = [];
  const re = /\s(?:href|src)="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function ids(html) {
  const out = new Set();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return out;
}

function isExternal(ref) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref);
}

test('every page in the link check exists', () => {
  for (const page of PAGES) assert.ok(fs.existsSync(path.join(root, page)), page);
});

test('every relative href/src on every page points to a file in the repo', () => {
  const broken = [];
  for (const page of PAGES) {
    for (const ref of refs(read(page))) {
      if (!ref || ref.startsWith('#') || isExternal(ref) || ref.includes('${')) continue;
      const target = decodeURIComponent(ref.split(/[?#]/)[0]);
      let resolved = path.resolve(root, path.dirname(page), target);
      if (target.endsWith('/') || (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory())) {
        resolved = path.join(resolved, 'index.html');
      }
      if (!fs.existsSync(resolved)) broken.push(`${page} -> ${ref}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every same-page #anchor names an id on that page', () => {
  const broken = [];
  for (const page of PAGES) {
    const html = read(page);
    const known = ids(html);
    for (const ref of refs(html)) {
      if (ref.length > 1 && ref.startsWith('#') && !known.has(decodeURIComponent(ref.slice(1)))) {
        broken.push(`${page} -> ${ref}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('cross-page #anchors name an id on the target page', () => {
  const broken = [];
  for (const page of PAGES) {
    for (const ref of refs(read(page))) {
      if (isExternal(ref) || !/\.html#./.test(ref)) continue;
      const [file, hash] = ref.split('#');
      const target = path.relative(root, path.resolve(root, path.dirname(page), file));
      if (!PAGES.includes(target)) continue;
      if (!ids(read(target)).has(decodeURIComponent(hash))) broken.push(`${page} -> ${ref}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every page links back to the lab and to the licence page', () => {
  for (const page of PAGES) {
    const local = refs(read(page)).filter((ref) => !isExternal(ref)).map((ref) => ref.split('#')[0]);
    const resolved = local.map((ref) => path.relative(root, path.resolve(root, path.dirname(page), ref || page)));
    if (page !== 'index.html') {
      assert.ok(resolved.includes('index.html') || resolved.includes(''), `${page} has no link to the lab`);
    }
    if (page !== 'licence.html') assert.ok(resolved.includes('licence.html'), `${page} has no link to licence.html`);
  }
});
