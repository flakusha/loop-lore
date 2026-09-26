<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: giwt show/state resolve .plan/tickets filename slugs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# giwt show/state resolve .plan/tickets filename slugs

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Have `giwt show <ID>` and `giwt state <ID>` resolve the lowercase `.plan/tickets/<slug>.md` filename form, not just uppercase extids / hex hashes.
**Context:** Substring-match resolver in `giwt/src/commands/show.ts:18` (via `resolveExtid`) drops the `.md` suffix and is fragile to ambiguous substring overlap (e.g. `TASK-tui` -> `TASK-TUI-DEDUPE-API-BASE`).
**Acceptance Criteria:** [see body — accept bare/`.md`/extid/hex forms, prefer exact slug, fall back to substring]

## Summary

`giwt show <ID>` and `giwt state <ID> <open|closed>` resolve only the uppercase
extid (e.g. `BUG-EXPORT-PROGRESS-STREAM-TEST-STATUS-ASSERTION-IS-FLAKY`) or the
hex hash. They do **not** resolve the lowercase filename slug that the agent
sees in `.plan/tickets/` (e.g. `BUG-export-progress-stream-test-status-assertion-is-flaky.md`)
or the kebab-case forms agents quote from `.plan/tickets/index.json` keys.
This is a DX trap: every agent thinks "I will just paste the slug I see in the
plan directory" and gets a false-negative `issue not found`, then concludes
the ticket does not exist.

## Repro / Current state

Probe of 10 real (non-done) tickets, run from this worktree
(`/home/flak/git-ai/loop-lore/tree/ticket-filing-batch-2026-09-26/`) on
2026-09-26, with the canonical `.plan/tickets/<slug>.md` filename form:

| # | Slug (input) | Result | Exit |
|---|---|---|---|
| 1 | `BUG-activitypub-federation-does-not-leverage-the-blog-system-lem.md` | `error: error: issue 'BUG-activitypub-federation-does-not-leverage-the-blog-system-lem.md' not found` | 1 |
| 2 | `BUG-db-guard-triggers-bypassed-on-update-003-005.md` | `error: error: issue 'BUG-db-guard-triggers-bypassed-on-update-003-005.md' not found` | 1 |
| 3 | `BUG-export-progress-stream-test-status-assertion-is-flaky.md` | `error: error: issue 'BUG-export-progress-stream-test-status-assertion-is-flaky.md' not found` | 1 |
| 4 | `TASK-tui.md` | `error: error: issue 'TASK-tui.md' not found` | 1 |
| 5 | `TASK-typescript-mjs-reconciliation.md` | `error: error: issue 'TASK-typescript-mjs-reconciliation.md' not found` | 1 |
| 6 | `TASK-update-terminal-ui-spec-to-actual-file-layout.md` | `error: error: issue 'TASK-update-terminal-ui-spec-to-actual-file-layout.md' not found` | 1 |
| 7 | `TASK-unit-tests-untested-batch.md` | `error: error: issue 'TASK-unit-tests-untested-batch.md' not found` | 1 |
| 8 | `TASK-transport-expansion.md` | `error: error: issue 'TASK-transport-expansion.md' not found` | 1 |
| 9 | `TASK-transport-layer-expansion.md` | `error: error: issue 'TASK-transport-layer-expansion.md' not found` | 1 |
| 10 | `TASK-testing-benchmarking.md` | `error: error: issue 'TASK-testing-benchmarking.md' not found` | 1 |

Control: the uppercase extid resolves correctly:

- `giwt show BUG-EXPORT-PROGRESS-STREAM-TEST-STATUS-ASSERTION-IS-FLAKY`
  returns `Issue 2b8da26 [open]` (exit 0).
- `giwt show TASK-transport-layer-expansion`
  returns `Issue 44c50ab [open]` (exit 0; bare kebab slug happens to work today
  because the resolver substring-matches `git issue ls`, but this is fragile -
  see Edge cases below).

### Why it fails (root cause)

`giwt/src/commands/show.ts:18` calls `resolveExtid(repoRoot, id)` which
performs a literal substring match against `git issue ls` output. The
substring search does not strip a trailing `.md`, and the matched extid in
`git issue ls` is uppercase (`BUG-EXPORT-...`) while the input may be
lowercase (filename form) or lowercase-with-dashes (index.json key). Two
real failure modes:

1. **Filename form `<slug>.md`**: substring search tries to find the literal
   `.md` suffix in the `git issue ls` line. The line contains the title
   text and the slug without `.md`, so the match fails. (All 10 probes above.)
2. **Ambiguous substring match**: `giwt show TASK-tui` matched
   `TASK-TUI-DEDUPE-API-BASE` instead of `TASK-TUI: Terminal UI` - both have
   "tui" in their slug substring. Confirmed via probe at
   `/home/flak/git-ai/loop-lore/tree/ticket-filing-batch-2026-09-26/`,
   `giwt show TASK-tui` returns `Issue 5d61bcc [open] Title: TASK-TUI-DEDUPE-API-BASE`
   (which is the wrong ticket).

The correct mapping **already exists** at `.plan/tickets/index.json` under the
`source` field (slug -> extid/hex). The fix should consult that map before
falling back to substring search.

### Historical evidence

`/home/flak/git-ai/loop-lore/.tmp/scratchpad-audit/ticket-states.txt` already
recorded the 10 failed probes (10 real + 1 bogus = 11 attempts, all
`error: issue not found`). Reproduced fresh on 2026-09-26 with the table
above; the historical list mixes done/real (most were already resolved) so
this probe re-runs against confirmed-open tickets.

## Acceptance Criteria

1. `giwt show BUG-export-progress-stream-test-status-assertion-is-flaky.md`
   and `giwt show BUG-export-progress-stream-test-status-assertion-is-flaky`
   both resolve to issue `2b8da26`. Same for the 10 slugs above (`.md`
   form and bare form).
2. `giwt state TASK-typescript-mjs-reconciliation.md open` resolves
   correctly (does **not** error with `issue not found`).
3. When the slug maps to multiple extids in `index.json`, prefer the one
   whose filename matches the input exactly; otherwise return the unique
   match. No silent misselection like `TASK-tui` -> `TASK-TUI-DEDUPE-API-BASE`.
4. Hex input still works (no regression).
5. Filename form `.md` literal is stripped (defense-in-depth even if the
   lookup table also handles it).
6. Unit test: 10 real slugs from the table above all resolve; the
   historical `BUG-scratch` (bogus) still errors.

## Fix shape

In `/home/flak/git-ai/giwt/src/commands/show.ts` and
`/home/flak/git-ai/giwt/src/commands/state.ts`, accept any of:

- `(a)` the bare kebab-case slug from `index.json` (`bug-foo-bar`)
- `(b)` the filename slug with `.md` (`bug-foo-bar.md`)
- `(c)` the existing uppercase extid (`BUG-FOO-BAR`)
- `(d)` the hex (`1234abcd`)

Resolve via:

1. Strip trailing `.md` if present.
2. Look up the slug in `.plan/tickets/index.json`'s `source` field
   (`source` already maps `<TYPE>-<kebab-case>` to `{extid, hash}`).
   Confirm the index shape before implementing; if it does not carry the
   mapping yet, fall back to: `git issue ls` with a per-line slug match
   on the lowercase kebab form, then a `--format oneline` plus slug
   column.
3. Return `{ hash, raw }` matching the existing `ResolvedIssue` shape so
   the rest of `show.ts`/`state.ts` is untouched.

`resolveExtid` (in `/home/flak/git-ai/giwt/src/commands/resolver.ts`) is the
shared helper both commands already use - extend it rather than duplicating
the lookup. Keep its current substring-match behavior as a final fallback
for back-compat with users who quote lowercase forms directly.

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` 4.1 G-7 (D-05 cited)
- `.tmp/scratchpad-audit/ticket-states.txt` (historical probe output)
- `giwt/src/commands/show.ts:1-26` (current shape)
- `giwt/src/commands/state.ts:1-32` (current shape)
- `giwt/src/commands/resolver.ts:11-32` (shared resolver to extend)
- `.plan/tickets/index.json` (canonical slug to extid map under `source`)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

git issue: 9966e2a
