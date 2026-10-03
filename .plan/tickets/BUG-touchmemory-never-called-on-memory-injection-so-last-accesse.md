<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: touchMemory never called on memory injection so last_accessed_at stays stale

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

memories.ts injects memories via memorySection but never calls touchMemory (src/memory/purge.ts:196), which has zero production callers. Injected memories keep last_accessed_at unchanged, so decay and stale-purge (purge.ts:52,114) treat actively-injected memories as never-accessed and can purge or decay them incorrectly. Wire touchMemory for every memory included in the injected context.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
