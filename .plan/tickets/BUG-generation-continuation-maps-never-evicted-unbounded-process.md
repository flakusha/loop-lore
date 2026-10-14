<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation continuation Maps never evicted, unbounded process growth

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The two module-level Maps in src/generation/continuation.ts are written on every cancel/fail generation and are never evicted, so a long-running server grows monotonically for the life of the process. There is no TTL, no size cap, and no delete path.

Evidence read on dev:

- src/generation/continuation.ts:15 — const partialContentStore = new Map<string, string>();
- src/generation/continuation.ts:18 — const messageToAttempt = new Map<string, string>();

getPartialContent falls back to the DB when a key is absent, so eviction degrades correctness gracefully.

Source: .tmp/longcat/review-consolidated.md nit 12; .tmp/longcat/review-assets-db-frontend.md N29 sibling (same unbounded-growth family).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
