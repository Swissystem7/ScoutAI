# Splitting PR #103 (`copilot/reland-byod-stack`) into mergeable slices

`auto_merger` merges a PR of at most 400 changed lines (additions + deletions).
PR #103 relands the whole BYOD CSV stack in one branch, so it can never be
merged as it stands. Issue #106 quotes 782 changed lines; with slice 1 already
on `master`, `git diff --shortstat master origin/copilot/reland-byod-stack`
still measures 772 additions and 193 deletions as of 2026-10-15 — either way,
far over the limit.

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

Slice 1 landed on `master` as PR #101 — the `demo.js` and `test/byod.test.js`
code of `1c5c9cf..f6ac64d`, byte for byte. Its help text stopped half way: the
thousands-mark and `-` / `N/A` sentences landed, the minutes sentences did not,
so `master` audited minutes without saying anywhere that it does. This PR
closes that gap (the `README.md` bullet and the `index.html` BYOD paragraph) and
adds this file, which #101 also left out.

Slices 2–4 are opened from the ranges above, one at a time, each cut from
`master` after the previous one merges; PR #103 is then closed in favour of
them. PR #109 was slice 1 re-opened from the pre-#101 `master`, so #101 made
its code a duplicate and GitHub reported it as conflicting with every file #101
had already changed; what was left of its intent is what this PR carries, and
#109 can be closed.

## Update (2026-10-15, after merging `master` into this branch)

All four slices are on `master`: #101 (slice 1), #102 (slice 2), #103 (slice 3)
and #104 (slice 4), branches `factory/laptop-claude-98-split-1` to `-4`, each cut
from `master` after the previous one merged. The branch that relanded the whole
stack in one PR was #98 (`copilot/reland-byod-stack`), now closed; the 782 changed
lines that issue #106 measured on #103 were slice 3 stacked on top of slice 2
before #102 reached `master`, not a separate whole-stack PR. PR #109 is closed.

The `README.md` bullet and the `index.html` BYOD paragraph are taken from
`master`, which already carries the minutes sentences this PR set out to add
(followed by the slice 2-4 sentences). What this PR still adds is this file and
the two `test/byod.test.js` assertions that pin those sentences to the help text.
