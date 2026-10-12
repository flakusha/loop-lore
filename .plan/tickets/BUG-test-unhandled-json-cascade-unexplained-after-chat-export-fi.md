<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: test - unhandled JSON cascade unexplained after chat-export fix

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Artifact: .tmp/run-803973-mv4q9jdu/check-fail-coverage-per-module-line.log (run summary: 16244 pass, 94 skip, 262 fail, 260 errors, Ran 16600 tests across 1538 files).

Block shape: ~260 '# Unhandled error between tests' blocks, each 'SyntaxError: JSON Parse error: Unrecognized token /'. They begin at log line 186, immediately after src/async/offload-daemon.test.ts logs '[ERROR] [async-offload] offload spill failed', and from there recur under nearly every subsequent test-file header.

Proved and fixed: exactly ONE block carries a source frame (log lines 1034-1044) -> src/routes/chat-export.test.ts:7, require('./chat-export'), where the target is a DIRECTORY and Bun's CJS resolver fell through to its JSON loader. Fixed by static import; the class is now blocked by the local/no-extensionless-require ESLint rule (docs/meta/tooling/log-problem-inventory.md P9).

OPEN: the remaining ~260 blocks are NOT reproduced and NOT explained. A comparable coverage run of the same tree exits 0 fail with zero unhandled blocks. NOTE the runs are not comparable: the reproduction ran 19022 tests / 1537 files vs the failing run's 16600 tests / 1538 files.

Hypothesis (unconfirmed): a single unhandled rejection escaping a leaked repeating timer in one --parallel worker, re-reported under each file that worker subsequently runs.

Ruled out by direct experiment: (1) bunfig.toml preload - tests/setup-globals.ts was read in full and performs no JSON.parse; (2) config/env loading - findConfigFile returns null for every candidate at both repo roots and loadConfig throws on a missing NSFW_FLAG_REPORTER_HASH_SECRET before reaching any parse; (3) JS-global JSON.parse - a trap logging a stack on any string starting with '/' fired ZERO times across the full 1537-file run, which also proves Bun's native loader parses bypass the JS global (so a preload trap is structurally blind to this error class).

What a reproducer needs: the dev checkout environment. The failing run executed in /home/flak/git-ai/loop-lore, which has a populated tree/ (multiple worktrees) and real configs/*.toml; the clean reproduction ran in a worktree with neither. Re-run the coverage gate in the dev checkout, and/or re-run the failing run's exact file set. Note bunfig.toml sets pathIgnorePatterns = ['tree/**'], inert in both locations but worth ruling out explicitly.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
