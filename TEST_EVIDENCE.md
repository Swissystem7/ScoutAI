# TEST_EVIDENCE

## Environment discovery
1. Command:
   - `cd /home/runner/work/ScoutAI/ScoutAI && if [ -f package.json ]; then npm test; else echo 'No package.json; no existing test/lint/build commands found.'; fi`
2. Result:
   - `No package.json; no existing test/lint/build commands found.`

## Deterministic/local demo tests
1. Command:
   - `cd /home/runner/work/ScoutAI/ScoutAI && node --test /home/runner/work/ScoutAI/ScoutAI/tests/*.test.js`
2. Result:
   - `6 passed, 0 failed`
   - Covers determinism, provenance labels, no network/form submission paths, no fabricated external-success claims, and runtime/README/legal consistency.

## Manual deterministic fixture verification
1. Command:
   - `cd /home/runner/work/ScoutAI/ScoutAI && node -e "const f=require('./demo-fixtures.js'); const a=JSON.stringify(f.createDemoFixture('demo-seed')); const b=JSON.stringify(f.createDemoFixture('demo-seed')); console.log('deterministic_equal=', a===b); console.log('seed=', f.createDemoFixture('demo-seed').seed);"`
2. Result:
   - `deterministic_equal= true`
   - `seed= demo-seed`
