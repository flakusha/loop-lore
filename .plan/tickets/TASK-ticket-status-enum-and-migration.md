<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Ticket **Status:** enum + migration of 302 distinct values

**Status:** open
**Priority:** high
**Effort:** Large
**Type:** Task

## Summary

`.plan/tickets/*.md` carries **302 distinct `**Status:**` strings** today (measured fresh in this worktree, `2026-09-26`); the `index.json` itself carries 60 distinct variants plus the literal `undefined` (scratchpad §7 row 15). Every downstream consumer (`giwt sync`, `plan:validate`, `find-work`, the receipt bridge, the cross-ticket cross-references) re-derives state semantics from prose, so the same intent appears under half a dozen labels (`open` / `Open` / `⬜ Open` / `🟡 Open`; `done` / `Done` / `✅ Done` / `✅ Resolved`; `not-yet-implemented`; `fixed-in-worktree`; etc.). This ticket introduces a closed enum, migrates every file idempotently, and adds a blocking `status-vocab` gate so the regression cannot recur.

## Repro / Current state

Fresh count, this worktree:

```
grep -h '^\*\*Status:\*\*' .plan/tickets/*.md | sort -u | wc -l
# → 302
```

Top variants by frequency (`grep -h '^\*\*Status:\*\*' .plan/tickets/*.md | sort | uniq -c | sort -rn | head -30`):

| Count | Variant |
|---:|---|
| 1233 | `**Status:** open` |
| 209  | `**Status:** ⬜ Not Started` |
| 206  | `**Status:** done` |
| 138  | `**Status:** ✅ Done` |
| 42   | `**Status:** ✅ Done (duplicate, verified 2026-09-19)` |
| 41   | `**Status:** ✅ Resolved` |
| 33   | `**Status:** Open` |
| 33   | `**Status:** Not Started → closed (duplicate)` |
| 30   | `**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)` |
| 26   | `**Status:** ✅ Resolved (already on dev, 2026-09-19)` |
| 26   | `**Status:** Done` |
| 21   | `**Status:** 📝 Draft` |
| 20   | `**Status:** ⬜ Open` |
| 14   | `**Status:** 🟡 In Progress` |
| 14   | `**Status:** ✅ Complete` |
| 13   | `**Status:** ✅ Done (closed via git issue)` |
| 13   | `**Status:** fixed-in-worktree` |
| 12   | `**Status:** ✅ Resolved (already on dev, 2026-09-21)` |
| 11   | `**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)` |
| 11   | `**Status:** ✅ Resolved (fixed 2026-09-05)` |
| 11   | `**Status:** ✅ Resolved (batch 2)` |
| 10   | `**Status:** not-yet-implemented` |
| 10   | `**Status:** Not Started` |
| 9    | `**Status:** ✅ Complete (2026-08-12)` |
| 9    | `**Status:** closed` |
| 9    | `**Status:** Draft` |
| 8    | `**Status:** ✅ Implemented` |
| 8    | `**Status:** ✅ Done (merged to dev 2026-09-15)` |
| 7    | `**Status:** ✅ Resolved (already on dev, 2026-09-05)` |
| 6    | `**Status:** 🟡 Open` |

The brief's "60 distinct" figure is the count inside `.plan/tickets/index.json` (revision 2 §7 row 15: "exact count is **60** distinct status values" for the index; the `.md`-file count is the 302 above). Both numbers are reported here without fudging.

Cross-reference: `plan:validate` already reports 1069–1108 tickets "not bound to an epic" (advisory), 55 "foreign issues without TYPE-extid", 3 dangling `.md` issue refs, and **16 `.md` statuses stale vs index** — a direct symptom of no state machine.

## Canonical enum

Proposed closed set:

```
open | in-progress | blocked | resolved | done | closed | not-yet-implemented | wontfix
```

Justification by mapping today's top variants:

| Today (existing) | Maps to |
|---|---|
| `open`, `Open`, `⬜ Open`, `🟡 Open` | `open` |
| `🟡 In Progress` | `in-progress` |
| `📝 Draft`, `Draft` | `open` (drafts are open work) |
| `done`, `Done`, `✅ Done`, `✅ Complete`, `✅ Implemented`, `✅ Done (…verified)`, `✅ Done (merged to dev …)`, `✅ Done (closed via git issue)` | `done` |
| `✅ Resolved` (and all date-/context-suffixed variants), `closed`, `✅ Resolved — verified stale`, `✅ Resolved (already on dev, …)` | `resolved` (the operator-completed terminal state) |
| `not-yet-implemented` | `not-yet-implemented` |
| `fixed-in-worktree` | `in-progress` (work landed locally; awaits merge) |
| `Not Started → closed (duplicate)`, `Done` duplicate markers | `closed` (administrative terminal) |

Reject emojis at write-time; reject prose suffixes after the canonical token (parenthetical notes belong under a separate `## Notes` section, not in the Status field). The `✅ Done (closed via git issue)` variant collapses to `done`; the migration preserves the original parenthetical line by promoting it to a `## Notes` entry (see migration design below).

## Acceptance Criteria

1. **Migration script**: `scripts/plan-ticket-status-migrate.ts` reads every `.plan/tickets/*.md`, rewrites the `**Status:**` line to the canonical enum per the mapping table, writes back. **Idempotent**: re-running on already-migrated files is a no-op (verify by hashing before/after).
2. **Closed-enum gate**: `giwt plan validate` (the existing `plan:validate` npm script = `giwt plan validate` per `package.json:99`) gains a new gate `status-vocab` that fails on any `**Status:**` value outside the 8-token enum. **Mark it blocking** — first failing run after this ticket lands must report the migration count as 0 because the migration ran first.
3. **Migration preserves context**: parenthetical notes (`(verified 2026-09-19)`, `(closed via git issue)`, etc.) are NOT lost — they are moved to a new `## Notes` section appended to the ticket body (only created if the parenthetical existed; never overwrites an existing `## Notes` block).
4. **Index sync**: `giwt sync` after migration reports zero drift between `.md` `**Status:**` and `index.json` `status` (today: 16 stale).
5. **Verified acceptance run**: after migration + gate on this worktree, `grep -h '^\*\*Status:\*\*' .plan/tickets/*.md | sort -u | wc -l` returns **8** (the closed enum count); the gate passes.

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §2 P-08 (status vocabulary drift) and §4.3 L-6 (canonical proposition)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.1 G-8 (`giwt plan validate` status-vocab gate + `--fix` normalizer — paired in giwt)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.2 O-4 (`/ticket` writes validate against enum — stop creating variants at source)

git issue: 5af9ef9
