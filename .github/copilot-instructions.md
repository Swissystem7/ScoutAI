# Copilot instructions for ScoutAI

This repository is one of nine small Node.js apps built by a one-person software factory. Every change is judged by
tests and by a human who merges by hand. Optimise for a small, verifiable pull request, not for cleverness.

## Commands

- Run the whole suite: `node --test test/demo.test.js test/trap.test.js test/byod.test.js`
- Run one test file: `node --test <path>` (Node's built-in runner; no other test framework)
- There is no build step and there are no runtime dependencies to install.

## Where code lives

- Implementation modules: the module named in the task
- Tests: `test/`; a test file is `<name>.test.js`

## How to work on a task (issue or review request)

1. Read the task's spec table. It names the implementation file, the function, a NEW test file and verbatim
   acceptance values. Those are binding.
2. Test first: write the new test file so that it FAILS on the current code by an assertion (not by a missing
   function), then change the implementation until it passes.
3. Run the whole suite; it must stay green.
4. Touch only the named implementation file and the new test file. No other files, no new dependency, no build
   tooling, no renames, no refactor of neighbouring code, no change to exports that the task does not name.
5. Keep the pull request small (aim: under 80 changed lines, two files). Open it as a DRAFT against `master`.
   Summarise in Hebrew: what changed, how it was verified (commands and results), what was deliberately left out.
6. Never merge, never push to `master`, never force-push, never weaken or delete existing tests.

## Non-goals, always

- No API surface changes unless the task says so.
- No persistence, network, randomness or clock use in modules that do not already have it.
- No comments or docs beyond what the change needs.

## Review requests

When asked to review a pull request, check in this order: (1) does the new test fail on the base commit and pass
after the change, (2) does the whole suite pass, (3) were only the named files touched, (4) is any exported
behaviour changed beyond the task, (5) is the PR summary accurate. Report findings as a short list; say "no
blocking finding" when there is none.
