<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: giwt: ledger --export

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Belongs to the **giwt** tool, not loop-lore. Tracked here as planning only; implement upstream.

**Problem.** Agent handoff needs two things — recent ledger lines and recent run records — and `readLedger` and `listRuns` are separate, separately-parsed calls that every agent hand-rolls. There is no single normalized export, so each handoff re-implements the same two parses.

**Evidence.** Design and evidence: `docs/research/04-giwt-extension-candidates.md` §E3 (`:302-321`), ranked `#1` in the Value/Effort table at `:368` — **High value, Trivial effort**: "`ledger.ts` is 50 lines; `readLedger` and `listRuns` already exist and are exported (`index.ts:42-55,75-84`). Every agent handoff hand-rolls two parses. No new seam touched." This is the highest-ranked item in the whole shortlist.

**Design (from research §E3).**
- Extends `src/commands/ledger.ts` — 50 lines today, well under budget.
- Surface: `giwt ledger [--last N] [--json] [--export <path>] [--with-runs] [--branch <name>]`.
- **Reads:** `readLedger(config.treeDir, last)` (`ledger.ts:38`); with `--with-runs`, `listRuns` (exported at `index.ts:81`).
- **Writes:** one JSON document via plain `Bun.write`, matching `writeScopedMeta` (`src/commands/scoped-worktree.ts:53`). **No new format.**

**Scope note — this is a handoff command, not a memory command.** Per research `:242` and `:383`: session-handoff *prose* and semantic memory capture are explicitly out of scope for giwt (conversational, not repo state). giwt already has the right primitive for that — `--say` on every command, extracted by `extractSayArgs` (`src/utils/ledger.ts:88-110`) and appended to the ledger as `<base> :: <said>` (`src/utils/ledger.ts:141`). Do not add a new command for it; feed it from this export instead. The legitimate part of (b) here is exactly the combined machine-readable ledger+runs export, because handoff needs two parses today.

**Verification** (research `:316-321`): (1) `--json --last 3` round-trips to 3 records (existing style, `runs.test.ts:52-73`); (2) `--with-runs` merges ledger + run records keyed by timestamp and parses back; (3) `--export <path>` writes the same bytes `--json` prints — byte-equality, not field-equality; (4) `--export` to an unwritable path exits 1 with a `"<path>: <problem>"`-shaped message, matching the convention `log("error", ...)` callers already use; (5) an empty ledger exports `[]` and exits 0 — do not regress `ledger.ts:43-46`.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
