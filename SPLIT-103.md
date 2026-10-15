# Splitting PR #103 (`copilot/reland-byod-stack`) into mergeable slices

`auto_merger` merges a PR of at most 400 changed lines (additions + deletions).
PR #103 relands the whole BYOD CSV stack in one branch, so it can never be
merged as it stands. Issue #106 quotes 782 changed lines; `git diff --shortstat
master origin/copilot/reland-byod-stack` measures 993 additions and 35
deletions against `master` as of 2026-10-15 — either way, far over the limit.

The branch is nine commits that each ship one readable BYOD behaviour, so it
splits along commit boundaries with no code rewritten. Four slices, each under
400 changed lines, each a behaviour a reviewer can judge on its own:

| Slice | Commit range on `origin/copilot/reland-byod-stack` | Changed lines | What lands |
| --- | --- | --- | --- |
| 1 | `master..f6ac64d` (`1c5c9cf`, `f6ac64d`) | 254 | Numeric cells read honestly: thousands marks (`1,234`, `1 234`, `1'234`), the Unicode minus, and `-` / `N/A` / `null` counted once per column instead of scored as 0. Minutes and counts audited: a file with no readable minutes says so, negative values are dropped and reported per player. |
| 2 | `f6ac64d..7625e29` (`349c386`, `7625e29`) | 276 | Rows that are not players: `Squad Total` / `Opponent Total` / `סה"כ` / `ממוצע` dropped and reported, and FBref table exports read as exported — the group-header line above the header and the header repeated every 25 rows skipped. |
| 3 | `7625e29..89bc187` (`76bcd8e`, `89bc187`) | 262 | Minutes from the FBref `90s` column when a table has no `Min`, and a repeated player name reported instead of ranked twice in silence. |
| 4 | `89bc187..284ecf6` (`5a1d1cf`, `6a98a3e`, `284ecf6`) | 264 | Players whose minutes cell is blank named at load time, a valid file that ranks nobody reported with the slider value that would admit them, and Wyscout side-specific position codes (`RCMF`, `LDMF`, `RWF`, `RCB3`) read instead of parked in `OT`. |

Line counts are `git diff --shortstat <range>`; they sum to more than #103's own
diff because later slices revise lines earlier slices add.

## Order

The slices are sequential, not parallel: all four edit the same four files —
`demo.js`, `test/byod.test.js`, the BYOD paragraph in `index.html` and the BYOD
bullet in `README.md` — and the later ones revise lines the earlier ones add, so
slice *N* is cut from `master` once slice *N-1* is merged. Cutting them in
parallel would only move the one big review into four conflict resolutions.
Each slice is still useful on its own — stopping after any of them leaves the
lab correct, just reading fewer kinds of messy file.

## Status

Slice 1 is this PR: the 254 code lines above plus this file, so the PR itself is
under 300 changed lines. Slices 2–4 are opened from the ranges above, one at a
time, each cut from `master` after the previous one merges; PR #103 is then
closed in favour of them.
