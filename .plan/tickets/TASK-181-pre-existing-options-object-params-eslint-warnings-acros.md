<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 181 pre-existing options-object-params eslint warnings across ~95 files

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The repo's own ESLint rule `local/options-object-params` (implementation: `src/eslint-rules/options-object-params.mjs`) flags every function with 3+ positional parameters. As of 2026-10-25 that rule reports **181 warnings across ~96 files** in `src/`. The full finding list is preserved at `.tmp/lint-codemod/findings-all.txt` (181 lines, one per finding, `file:line:col | source`).

Heaviest directories: `src/routes/worlds` (14), `src/nsfw/moderation-service` (12), `src/story/items` (12), `src/frontend/alpine` (7), `src/routes/quests` (7), `src/routes/story-items` (7), `src/services/trade` (6), `src/cron/dag` (5).

**This is NOT a gate blocker.** `bun run lint:eslint` PASSES on dev: the rule is configured as `"warn"` (`eslint.config.mjs:205`) and the lint gate has no `--max-warnings`, so eslint exits 0 on warnings. The "20 findings" printed by `doctor check` was a display cap (`CHECK_MAX_FINDINGS = 20`), not the real total. The real backlog is 181 warnings across ~96 files — pre-existing, warning-level, non-blocking.

**A compiler-API codemod was prototyped and produced corrupted output.** The script is preserved at `.tmp/lint-codemod/codemod.ts` (with `.tmp/lint-codemod/findings-all.txt` and its run log `.tmp/lint-codemod/codemod.log`). It reported `findings: 181 / targets converted: 181 / call sites rewritten: 1130 / files changed: 382 / skipped: 0`. Its output is **not** correct: on overlapping edits it rewrote call sites and signatures inconsistently, e.g. it turned `new SafeBufferError(message, operation)` into `new SafeBufferError({ message, operation })` while `super(message)` became `super({ message })` (which breaks `Error`), and it rewrote `String.prototype.replaceAll` callbacks (`(_match, prefix, filename, suffix) => ...`) into options-object callbacks that the runtime does not call that way. The codemod also rewrote 382 files, far beyond the 96 files that actually contain findings.

**Decision: do NOT land a mass codemod.** 1130 rewritten call sites across 382 files is an unreviewable diff for a warning class that does not block any gate. The correct shape of this work, if it is done at all, is incremental and hand-checked — see `TASK-redo-options-object-params-refactor-incrementally` for the abandoned 541-file attempt and its required one-directory-at-a-time method.

**Recommended approach** (if the debt is ever paid down):

1. One directory at a time, smallest first (`src/cron/dag`, `src/utils/safe-buffer`, ...).
2. Run `bun run typecheck` and `bun test` after each directory.
3. Commit after each directory, so no single failure destroys more than one directory's work.
4. Never leave a multi-directory mechanical refactor uncommitted.
5. Prefer suppressing a warning with a targeted `// eslint-disable-next-line local/options-object-params -- <reason>` over a mechanical rewrite when the positional shape is intentional (the rule already exempts typed slots).

**Context:** The debt is real but non-blocking, and the previous two attempts at bulk-fixing it both produced large broken diffs (the 541-file `chore-warning-cleanup` attempt was abandoned and backed out; the compiler-API codemod on `fix-lint-options-object` produced corrupted text on overlapping edits). Filing this so the backlog and the prototype are not lost when the worktree is removed. The codemod prototype itself is preserved at `.tmp/lint-codemod/` precisely so a future attempt can reuse the finding list without re-running ESLint.

**Acceptance Criteria:**

- [ ] 181 pre-existing `local/options-object-params` warnings are either converted incrementally (one directory at a time, typecheck + tests green after each, committed per directory) or individually justified with a targeted `eslint-disable-next-line` comment.
- [ ] No single commit converts more than one directory's worth of call sites.
- [ ] `bun run lint:eslint` still exits 0 and `bun run typecheck` stays clean.
- [ ] The `.tmp/lint-codemod/` prototype is either promoted into a checked-in tool or explicitly retired once the backlog is closed.
