<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Notification and telemetry service nits

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Caveats:** observability — a notification whose data cannot be serialized is still stored with data null and the failure is logged with its userId and type, so a dropped payload is never silent; partial failure — the byte cap now compares UTF-8 bytes rather than UTF-16 code units, so a CJK payload that previously passed the character limit is dropped whole and the dropped event is not retried; stale state — TELEMETRY_ENABLED=0 now gates the per-sink flags, so a deployment that relied on a per-sink flag alone to enable telemetry stops emitting until the master switch is on

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

**Resolved:** 2026-10-22 registry-driven close: git issue 2942731 (registry tip: 405a2b305 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-NOTIFICATION-AND-TELEMETRY-)
