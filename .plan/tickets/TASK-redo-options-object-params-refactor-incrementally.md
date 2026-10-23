<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Redo options-object-params refactor incrementally

**Status:** Not Started
**Type:** Task
**Priority:** medium
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)

**Summary:**

## Abandoned refactor: options-object-params

Converts functions with 3+ positional parameters to a single destructured
options object, across roughly 541 files in `src/`, per
`.agents/references/recommendations.md`.

### What happened

Attempted on branch `chore-warning-cleanup` and ABANDONED. A scripted edit
crashed partway through, and the recovery over-reverted, destroying
approximately 56% of the change irreversibly. The half-migrated tree produced
442 arity typecheck errors and 579 test failures, which could not be patched
back into consistency, so it was deliberately backed out. The branch was
finalized containing only the lint/config work, not this refactor.

### The backlog

Repo-wide `local/options-object-params` currently reports **1013 warnings**.
That number is the exact backlog to work through.

### Required method next time

The method must be different from the failed attempt:

- Convert **ONE directory at a time**.
- Run `bun run typecheck` and `bun test` after **each** directory.
- **COMMIT after each** directory, so no single failure can destroy more than
  one directory's work.

- Never leave a multi-directory mechanical refactor uncommitted.

### Recovery artifacts (gitignored scratch — will not survive)

- `/home/flak/git-ai/loop-lore/.tmp/abandoned-refactor/README.md`
- `pre-revert-status.txt` — lists all 541 pre-revert paths
- `missing-from-pad2.txt` — names the 304 unrecoverable files
- `sources-pad2.json` — recovered source text for 237 files

These are gitignored scratch files. If a future session needs the recovered
source text, read them **before** they are cleaned up.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
