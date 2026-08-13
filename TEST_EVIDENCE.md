# Test evidence

Implementation evidence for issue SA-001.

Commands to run from the repository root:

```text
node --check demo.js
node --check test/demo.test.js
node --test test/demo.test.js
```

Recorded on 2026-07-24:

```text
node --check demo.js
PASS (exit 0)

node --check test/demo.test.js
PASS (exit 0)

node --test test/demo.test.js
tests 4
pass 4
fail 0
```

Re-recorded on 2026-08-13 after merging the a11y/tests WIP and adding the
guided exercise, raw-component radar, export, and glossary:

```text
node --check demo.js
PASS (exit 0)

node --check test/demo.test.js
PASS (exit 0)

node --test test/demo.test.js
tests 22
pass 22
fail 0
```

The recorded commands above are the checks that exist in this repository:
`node --check` on `demo.js` / `test/demo.test.js`, and `node --test test/demo.test.js`.
The tests cover deterministic byte-equivalent fixture output, explicit
provenance, unavailable verified analysis, absence of external network,
API, or form-submission paths in the browser runtime (relative static JSON
fetch is allowed), slider/hash metric state, the defender self-check,
radar values from the same raw caps as the score, and a local non-commercial
export/glossary with no `http(s)` URLs in the product runtime.
