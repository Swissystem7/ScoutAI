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

HTML structural closure check
PASS
```

The tests cover deterministic byte-equivalent output, explicit provenance,
unavailable verified analysis, absence of network/API/form submission paths in
the browser runtime, and absence of fabricated account/trial/email/report
success.
