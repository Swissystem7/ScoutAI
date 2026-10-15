#!/usr/bin/env node
'use strict';

// Builds data/wc2018_heights.json: height (cm) and birth month of WC2018
// players, from Wikidata (CC0), matched to the StatsBomb player ids in
// data/wc2018_gems_matches.json. Used only to TEST the owner's premise that
// conventional stats favour tall / physical players, and the relative age
// effect. No photo, no face, no body scan: one public number per player.
//
// Data minimisation: only height and birth MONTH are stored (not the date).
//
// Matching is deliberately strict: a Wikidata player is accepted only if one of
// his names (label, alias or birth name, 2+ tokens) is fully contained in the
// StatsBomb full name, he played for the same national team, and no other
// candidate scores the same. Unmatched players are left out, not guessed.
//
// Usage: node tools/build-heights.js [wikidataJsonCache]

const fs = require('node:fs');
const path = require('node:path');

const SPARQL = 'https://query.wikidata.org/sparql';
const QUERY = [
  'SELECT ?p ?label ?h ?unit (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)',
  ' (GROUP_CONCAT(DISTINCT ?bn; separator="|") AS ?bns) (GROUP_CONCAT(DISTINCT ?cty; separator="|") AS ?ctys)',
  ' (GROUP_CONCAT(DISTINCT ?teamLabel; separator="|") AS ?teams) ?dob WHERE {',
  ' ?p wdt:P1344 wd:Q170645 .',
  ' ?p p:P2048/psv:P2048 ?hv . ?hv wikibase:quantityAmount ?h ; wikibase:quantityUnit ?unit .',
  ' ?p rdfs:label ?label FILTER(lang(?label)="en")',
  ' OPTIONAL { ?p skos:altLabel ?alt FILTER(lang(?alt) IN ("en","es","pt","fr","de")) }',
  ' OPTIONAL { ?p wdt:P1477 ?bn }',
  ' OPTIONAL { ?p wdt:P1532 ?c . ?c rdfs:label ?cty FILTER(lang(?cty)="en") }',
  ' OPTIONAL { ?p wdt:P54 ?t . ?t wdt:P31 wd:Q6979593 . ?t rdfs:label ?teamLabel FILTER(lang(?teamLabel)="en") }',
  ' OPTIONAL { ?p wdt:P569 ?dob }',
  '} GROUP BY ?p ?label ?h ?unit ?dob'
].join('\n');

const UNIT_CM = {
  'http://www.wikidata.org/entity/Q174728': 1, // centimetre
  'http://www.wikidata.org/entity/Q11573': 100, // metre
  'http://www.wikidata.org/entity/Q3710': 30.48 // foot
};
const STOP = new Set(['de', 'da', 'dos', 'do', 'del', 'la', 'van', 'von', 'der', 'el', 'al', 'di', 'y', 'e', 'bin']);
const TEAM_ALIAS = { 'south korea': ['korea'], england: ['england', 'united kingdom'] };

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ð/g, 'd')
    .replace(/þ/g, 'th').replace(/ł/g, 'l').replace(/ı/g, 'i')
    .toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ');
}
function tokens(s) { return norm(s).split(/\s+/).filter(function (t) { return t.length > 1 && !STOP.has(t); }); }

function candidatesFrom(bindings) {
  const byQ = new Map();
  bindings.forEach(function (b) {
    const unit = UNIT_CM[b.unit && b.unit.value];
    if (!unit) return;
    const q = b.p.value.split('/').pop();
    const names = [b.label.value]
      .concat((b.alts && b.alts.value || '').split('|'), (b.bns && b.bns.value || '').split('|'))
      .filter(Boolean).map(tokens).filter(function (t) { return t.length; });
    const where = norm((b.ctys && b.ctys.value || '') + ' ' + (b.teams && b.teams.value || ''));
    const h = Math.round(Number(b.h.value) * unit);
    if (!byQ.has(q)) {
      byQ.set(q, { q: q, label: b.label.value, labelTokens: tokens(b.label.value), names: [], toks: new Set(), heights: [], where: '', dob: b.dob && b.dob.value });
    }
    const c = byQ.get(q);
    c.names = c.names.concat(names);
    names.forEach(function (n) { n.forEach(function (t) { c.toks.add(t); }); });
    c.heights.push(h);
    c.where += ' ' + where;
  });
  return Array.from(byQ.values()).map(function (c) {
    c.heights.sort(function (a, b) { return a - b; });
    c.heightCm = c.heights[Math.floor(c.heights.length / 2)];
    return c;
  });
}

// Pure: players [{playerId, name, team}] + candidates -> {playerId: match}.
function matchPlayers(players, cands) {
  const out = {};
  players.forEach(function (p) {
    const pt = tokens(p.name);
    const ptSet = new Set(pt);
    const team = norm(p.team).trim();
    const keys = TEAM_ALIAS[team] || [team];
    function covered(c) {
      return c.names.some(function (n) {
        return (n.length >= 2 || pt.length === 1) && n.every(function (t) { return ptSet.has(t); });
      });
    }
    function score(c) {
      let s = 0;
      pt.forEach(function (t) { if (c.toks.has(t)) s += 1; });
      const last = c.labelTokens[c.labelTokens.length - 1];
      if (last && ptSet.has(last)) s += 0.5;
      return s;
    }
    function pick(pool, min) {
      const ranked = pool.filter(covered).map(function (c) { return { c: c, s: score(c) }; })
        .sort(function (a, b) { return b.s - a.s; });
      if (!ranked.length || ranked[0].s < min) return null;
      if (ranked[1] && ranked[1].s === ranked[0].s) return null;
      return ranked[0].c;
    }
    const teamPool = cands.filter(function (c) { return keys.some(function (k) { return c.where.indexOf(k) >= 0; }); });
    const best = pick(teamPool, 1.5) || pick(cands, 2);
    if (best) out[p.playerId] = best;
  });
  return out;
}

async function fetchBindings(cacheFile) {
  if (cacheFile && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8')).results.bindings;
  const url = SPARQL + '?query=' + encodeURIComponent(QUERY);
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'ScoutAI-research/0.1 (github.com/Swissystem7/ScoutAI)' } });
  if (!res.ok) throw new Error('wikidata ' + res.status);
  const text = await res.text();
  if (cacheFile) fs.writeFileSync(cacheFile, text);
  return JSON.parse(text).results.bindings;
}

async function main() {
  const root = path.join(__dirname, '..');
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wc2018_gems_matches.json'), 'utf8')).rows;
  const seen = new Map();
  rows.forEach(function (r) { if (!seen.has(r.playerId)) seen.set(r.playerId, { playerId: r.playerId, name: r.name, team: r.team }); });
  const players = Array.from(seen.values());
  const cands = candidatesFrom(await fetchBindings(process.argv[2]));
  const matched = matchPlayers(players, cands);
  const out = {};
  Object.keys(matched).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (id) {
    const c = matched[id];
    const month = c.dob ? Number(String(c.dob).slice(5, 7)) : null;
    out[id] = { heightCm: c.heightCm, birthMonth: month || null, wikidata: c.q };
  });
  const payload = {
    source: 'Wikidata (CC0), property P2048 height and P569 date of birth (month only), players with P1344 = 2018 FIFA World Cup (Q170645)',
    retrieved: new Date().toISOString().slice(0, 10),
    builtBy: 'tools/build-heights.js',
    statsbombPlayers: players.length,
    matched: Object.keys(out).length,
    note: 'Strict name + national-team match; unmatched players are omitted, never guessed. Height is self-reported by clubs / federations and can be off by a few cm.',
    players: out
  };
  fs.writeFileSync(path.join(root, 'data', 'wc2018_heights.json'), JSON.stringify(payload));
  process.stderr.write('matched ' + payload.matched + ' / ' + players.length + '\n');
}

module.exports = { tokens: tokens, candidatesFrom: candidatesFrom, matchPlayers: matchPlayers };

if (require.main === module) {
  main().catch(function (err) { console.error(err); process.exit(1); });
}
