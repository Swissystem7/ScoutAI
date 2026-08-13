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

The recorded commands above are the checks that exist in this repository:
`node --check` on `demo.js` / `test/demo.test.js`, and `node --test test/demo.test.js`.
The tests cover deterministic byte-equivalent fixture output, explicit
provenance, unavailable verified analysis, and absence of external network,
API, or form-submission paths in the browser runtime (relative static JSON
fetch is allowed).
