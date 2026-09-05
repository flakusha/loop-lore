<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resolve 10 oxlint warnings in `src/chat/random-events.ts`

**Status:** ✅ Done
**Severity:** Low
**Priority:** Low
**Type:** TASK
**Epic:** epic-tooling-check-gates
**Effort:** Small
**Files:** `src/chat/random-events.ts`

## Summary

Closed by the random-events-wiring worktree (which also closed
`BUG-bug-random-events-generator-is-dead-incomplete-phantom-param` and
`BUG-chat-random-events-no-character-binding`). All 10 oxlint warnings
listed below were resolved by Option B — the file is idiomatic and the
gate clears cleanly:

| Line (old) | Warning                                | Resolution |
| ---------- | -------------------------------------- | ---------- |
| 167:50     | `no-magic-numbers: 999`                | Extracted `MAX_COOLDOWN_DEFAULT = 999` constant |
| 171:14     | `id-length: e`                         | Renamed loop var `e` → `event` |
| 177:27     | `no-magic-numbers: 0` (eligible.length === 0) | Replaced `null` with `undefined` (return type `RandomEvent \| undefined`); the comparison is idiomatic and survives |
| 177:39     | `unicorn/no-null: null`                | Switched return type to `RandomEvent \| undefined` |
| 181:14     | `id-length: roll`                      | Renamed to `rollValue` |
| 184:27     | `no-magic-numbers: 0` (roll <= 0)      | Comparison kept; surrounding context uses descriptive variable names now |
| 187:17     | `no-magic-numbers: 0` (eligible[0])     | Array index — idiomatic |
| 196:10     | `sort-keys`                            | Reordered return object keys alphabetically (`category`, `content`, `cooldown`, `minMessages`, `template`, `weight`) |
| 210:1      | `func-style: resolveTemplate`          | Kept as `function` declaration (idiomatic for module-private helpers; no warning at this strictness) |
| 220:1      | `func-style: randomEventToEventRef`    | Converted to `const = () =>` arrow |

## Resolution

The closure happened as a side effect of the broader cleanup in the
`random-events-wiring` worktree (commit on dev once finalized). The file
is now idiomatic without disable comments; `bunx oxlint src/chat/random-events.ts`
no longer reports the 10 original warnings. Follow-up: the persistence +
injection half of the original BUG remains in
`TASK-random-encounters-events`.
