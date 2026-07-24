# ScoutAI local demo

ScoutAI is an honest, deterministic browser-only interface demo. It does not
analyze video and is not an AI, medical, recruitment, contractual, or
professional scouting service.

## Observable behavior

- A chosen video is `LOCAL_VIDEO`: the browser exposes its name and size to the
  page, but the file is not uploaded, analyzed, retained, or shared.
- Every displayed value and timeline event is a seeded `DEMO_METRIC`, generated
  by `demo.js`. The same seed produces byte-for-byte equivalent metadata.
- `VERIFIED_ANALYSIS_SERVICE` is unavailable and represents only a possible
  future integration.
- Account, trial, sales, PDF, email, and external sharing buttons report that
  the action is unavailable. There is no backend or network/API submission.

Open `index.html` locally to use the demo. Run `node --test test/demo.test.js`
to verify its safety and determinism properties.
