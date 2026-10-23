<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: fetchSkipCooldowns issues one query per cooling actor

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive

**Summary:**

fetchSkipCooldowns runs one query for up to SCAN_LIMIT turn_skip rows (src/turning/skip-cooldown.ts:64-71), then issues an individual SELECT per cooling actor at :80-89 to see whether that actor has posted a non-skip message since. With N cooling actors that is 1 + N round-trips on a hot path.

Fix: one correlated EXISTS or LEFT JOIN over the cooling set instead of the per-actor loop. The '>=' on same-millisecond ties at :91-93 must be preserved.

Source: .tmp/longcat/review-consolidated.md nit 35; .tmp/longcat/review-chat.md finding 8.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
