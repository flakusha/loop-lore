<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Relevance-aware decay and purge signals in memory purge

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:**

purge.ts decay and stale-purge rely solely on last_accessed_at and importance. After the touchMemory fix lands, feed relevance-grade or rerank score into decay weighting so consistently-irrelevant memories decay faster. Depends on the touchMemory bug fix.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-03 registry-driven close: git issue 660fcca (registry tip: a41d120d7 Konstantin Fedotov Close issue)
