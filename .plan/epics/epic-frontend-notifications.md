<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Notification System UI

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Notification System UI. See `docs/frontend/notifications.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/notifications.md`

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Frontend Components | Overlay stack + UI store | Toasts/overlays (see `matrix-frontend-backend-integration.md` FB7) |
| Auth Channel Provisioning | Channel fan-out | In-app channel (per `matrix-authentication-channels.md` AC9) |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Headless / Alternative Frontends | Notification channel | Non-htmx clients |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| UI store (`src/frontend/stores/ui-store.ts`) | Components | Overlay/toast state |
| Notification service (`src/notifications/service/`) | Routes/views | Notification records |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| Notification SSE stream | subscribes | Live notification delivery |

