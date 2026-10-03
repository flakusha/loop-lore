<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Wire current-message keywords into memory injection context or remove dead relevance boost

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The relevance grader isContextRelevant (src/memory/injection/relevance.ts) is dead in the live path: memories.ts passes currentKeywords as an empty array, so relevance boosting never fires. Either thread current-message keywords into the InjectionContext built by memorySection or delete the dead grader. Small task that unblocks relevance-gated injection.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
