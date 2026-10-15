'use strict';

// Measures a branch against the merge budget of 400 changed lines (additions + deletions) and, when the
// branch is over, proposes a split into per-file groups that each fit. Reading `git diff --numstat` is the
// whole input: the planner never looks at file contents, so it is pure and testable.
//
//   node tools/pr-size.js                      # working tree (incl. untracked) against master
//   node tools/pr-size.js --committed          # only what is committed on this branch
//   node tools/pr-size.js --base origin/master --budget 400
//   git diff --numstat master...HEAD | node tools/pr-size.js --stdin

const DEFAULT_BUDGET = 400;
const DEFAULT_BASE = 'master';

// `git diff --numstat` writes a rename as `old => new`, and shortens a shared prefix/suffix into braces:
// `test/{old => new}.js`. Both forms name the file after the change, which is the name a split plan needs.
function renameTarget(spec) {
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(spec);
  if (braced) return (braced[1] + braced[3] + braced[4]).replace(/\/\//g, '/');
  const plain = /^(.*) => (.*)$/.exec(spec);
  return plain ? plain[2] : spec;
}

// One entry per `<added>\t<deleted>\t<path>` line. A binary file is `-\t-\t<path>`: git cannot count its
// lines, so it contributes 0 to the total and is flagged instead of silently weighing nothing.
function parseNumstat(text) {
  const out = [];
  const lines = String(text == null ? '' : text).split('\n');
  for (const line of lines) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.replace(/\r$/, ''));
    if (!m) continue;
    const binary = m[1] === '-' || m[2] === '-';
    const added = binary ? 0 : Number(m[1]);
    const deleted = binary ? 0 : Number(m[2]);
    out.push({ path: renameTarget(m[3].trim()), added, deleted, changed: added + deleted, binary });
  }
  return out;
}

function totalChanged(files) {
  return (files || []).reduce(function (sum, f) { return sum + (Number(f && f.changed) || 0); }, 0);
}

function normaliseBudget(budget) {
  const n = Math.floor(Number(budget));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET;
}

// First-fit-decreasing: the largest files are placed first, so a group only stays half-empty when nothing
// left fits in it. Ties break on path so the same diff always yields the same plan.
function planSplit(files, budget) {
  const limit = normaliseBudget(budget);
  const all = (files || []).filter(function (f) { return f && f.path; });
  const oversize = [];
  const packable = [];
  for (const f of all) {
    if ((Number(f.changed) || 0) > limit) oversize.push(f);
    else packable.push(f);
  }

  const sorted = packable.slice().sort(function (a, b) {
    return (b.changed - a.changed) || String(a.path).localeCompare(String(b.path));
  });

  const groups = [];
  for (const f of sorted) {
    let target = groups.find(function (g) { return g.changed + f.changed <= limit; });
    if (!target) {
      target = { files: [], changed: 0 };
      groups.push(target);
    }
    target.files.push(f);
    target.changed += f.changed;
  }
  for (const g of groups) {
    g.files.sort(function (a, b) { return String(a.path).localeCompare(String(b.path)); });
  }

  const total = totalChanged(all);
  return {
    budget: limit,
    total,
    withinBudget: total <= limit,
    groups,
    // A single file bigger than the budget cannot be split by moving files around; it needs its commits or
    // hunks separated by hand. Naming it is the useful answer, not hiding it inside an over-budget group.
    oversize,
    splittable: oversize.length === 0
  };
}

function formatPlan(plan) {
  const lines = [];
  lines.push('תקציב מיזוג: ' + plan.budget + ' שורות שונות (תוספות + מחיקות)');
  lines.push('בפועל: ' + plan.total + ' שורות');
  if (plan.withinBudget) {
    lines.push('תקין — ה-PR נכנס לתקציב, אין צורך בפיצול.');
    return lines.join('\n');
  }

  const over = plan.total - plan.budget;
  const count = plan.groups.length;
  const proposal = count === 0
    ? 'אין פיצול אוטומטי אפשרי:'
    : 'הצעת פיצול ל' + (count === 1 ? '-PR אחד:' : '-' + count + ' PR-ים:');
  lines.push('חריגה של ' + over + ' שורות. ' + proposal);
  plan.groups.forEach(function (group, i) {
    lines.push('');
    lines.push('  PR ' + (i + 1) + ' — ' + group.changed + '/' + plan.budget + ' שורות:');
    for (const f of group.files) {
      lines.push('    ' + f.path + ' (+' + f.added + ' / -' + f.deleted + ')');
    }
  });

  if (plan.oversize.length) {
    lines.push('');
    lines.push('  דורש פיצול ידני (קובץ בודד חורג מהתקציב):');
    for (const f of plan.oversize) {
      lines.push('    ' + f.path + ' — ' + f.changed + ' שורות (+' + f.added + ' / -' + f.deleted + ')');
    }
  }

  const binary = plan.groups
    .reduce(function (acc, g) { return acc.concat(g.files); }, plan.oversize)
    .filter(function (f) { return f.binary; });
  if (binary.length) {
    lines.push('');
    lines.push('  קבצים בינאריים (git לא מונה שורות, נספרו כ-0):');
    for (const f of binary) lines.push('    ' + f.path);
  }

  return lines.join('\n');
}

// A brand-new test file is untracked until the factory commits, so `git diff` cannot see it. Counting it as
// pure additions is what makes the pre-commit reading match the PR the merger will eventually weigh.
function numstatForNewFiles(entries) {
  return (entries || [])
    .map(function (e) {
      const added = e.binary ? '-' : String(Math.max(0, Math.floor(Number(e.lines)) || 0));
      const deleted = e.binary ? '-' : '0';
      return added + '\t' + deleted + '\t' + e.path;
    })
    .join('\n');
}

// git counts a final line without a trailing newline, and counts nothing for an empty file.
function countLines(text) {
  if (!text) return 0;
  const newlines = (text.match(/\n/g) || []).length;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

function parseArgs(argv) {
  const opts = { base: DEFAULT_BASE, budget: DEFAULT_BUDGET, stdin: false, committed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stdin') opts.stdin = true;
    else if (arg === '--committed') opts.committed = true;
    else if (arg === '--base') opts.base = argv[i += 1];
    else if (arg === '--budget') opts.budget = normaliseBudget(argv[i += 1]);
    else if (arg.startsWith('--base=')) opts.base = arg.slice('--base='.length);
    else if (arg.startsWith('--budget=')) opts.budget = normaliseBudget(arg.slice('--budget='.length));
  }
  if (!opts.base) opts.base = DEFAULT_BASE;
  return opts;
}

module.exports = {
  DEFAULT_BUDGET,
  DEFAULT_BASE,
  parseNumstat,
  totalChanged,
  planSplit,
  formatPlan,
  parseArgs,
  renameTarget,
  numstatForNewFiles,
  countLines
};

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));

  const collect = function () {
    const fs = require('node:fs');
    if (opts.stdin) return fs.readFileSync(0, 'utf8');

    const git = function (args) {
      return require('node:child_process').execFileSync('git', args, { encoding: 'utf8' });
    };
    // `--committed` weighs base...HEAD; the default weighs the working tree, which is what the factory has
    // in hand before it commits.
    if (opts.committed) return git(['diff', '--numstat', opts.base + '...HEAD']);

    const tracked = git(['diff', '--numstat', opts.base]);
    const untracked = git(['ls-files', '--others', '--exclude-standard'])
      .split('\n')
      .map(function (p) { return p.trim(); })
      .filter(Boolean)
      .map(function (p) {
        const buf = fs.readFileSync(p);
        // A NUL byte means git would call it binary and refuse to count its lines.
        const binary = buf.includes(0);
        return { path: p, binary, lines: binary ? 0 : countLines(buf.toString('utf8')) };
      });
    return [tracked.replace(/\n$/, ''), numstatForNewFiles(untracked)].filter(Boolean).join('\n');
  };

  const plan = planSplit(parseNumstat(collect()), opts.budget);
  process.stdout.write(formatPlan(plan) + '\n');
  // Non-zero so the factory can gate on it before opening a PR the merger would refuse anyway.
  process.exitCode = plan.withinBudget ? 0 : 1;
}
