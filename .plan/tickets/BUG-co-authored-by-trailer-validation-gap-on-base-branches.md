<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Co-Authored-By trailer validation gap on base branches

**Status:** Not Started
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
