<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Notification prefs silently succeed for unknown users and lose concurrent updates

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-notifications

**Summary:**

setPrefs reads users.settings, merges in application code, and writes back with no transaction and no row-count check.

1. Silent success. src/notifications/service/prefs.ts:93-97 runs the UPDATE and never inspects the result; a request for a user id that does not exist updates zero rows and returns success.

2. Lost update. src/notifications/service/prefs.ts:72-73 reads the current prefs, :84-97 merges and writes, all outside a transaction. Two concurrent setPrefs calls both read the same blob and the later write discards the earlier one's keys.

Evidence read on dev: both sites as cited; mergePrefs itself is correct and enumerates every NotificationType default.

Source: .tmp/longcat/review-misc-services.md n1 and n2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue f8a923a (registry tip: c3b8d2892 Konstantin Fedotov Close issue)
