<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Co-Authored-By trailer validation gap on base branches

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue d05f21f): scripts/check/co-author-trailers.mjs:218-221 audits HEAD~1..HEAD on dev/main/master; wired into .githooks/pre-commit:50 and prepare-commit-msg:19; unit-tested (co-author-trailers.test.mjs:11).
**Priority:** high
**Effort:** Medium
**Epic:** epic-cicd-pipeline

**Summary:**

scripts/check/co-author-trailers.mjs:211 — defaultRange() skips the current branch as a base candidate. On dev (the base branch), it falls through to master whose merge-base is ancient, so the range spans dev's entire history. Every past contributor enters the identity population, and any fabricated Co-Authored-By trailer naming any past dev author passes validation. This happens during giwt finalize: the squash commit on dev is audited against dev's full commit history, not the feature branch's actual authors. Fix: When the current branch IS a base branch (dev/main/master), return HEAD~1..HEAD immediately — audit only the commit being made, not the entire history.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue d05f21f (registry tip: 937fb2250 Konstantin Fedotov Close issue)
