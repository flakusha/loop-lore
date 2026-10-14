<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Notification and telemetry service nits

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Five small defects, one file family each.

Notifications

- src/notifications/service/crud.ts:52,72,88,128 — four hard-coded "unread" strings instead of NotificationStatus.Unread, which is already imported from ../../db/enums-core.
- src/notifications/service/crud.ts:52-53 — createNotification collapses a safeJsonStringify failure to data: null with no warn.
- src/notifications/service/service.ts:72-76 — emit's catch logs error.message only; input.userId and input.type are dropped, so a log line cannot be correlated back to the notification that failed.

Telemetry

- src/telemetry/service.ts:78 — the cap compares payload.length, a UTF-16 character count, against TELEMETRY_EVENT_DATA_MAX_BYTES. A CJK payload passes the check while exceeding the byte budget it is meant to bound.
- src/telemetry/config.ts:40,44 — per-sink flags are OR-ed with the master switch (resolveFlag(...) || master), so TELEMETRY_ENABLED=0 with EVENTS=1 still enables the events sink.

Source: .tmp/longcat/review-misc-services.md n3, n5, n6, t1, t2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
