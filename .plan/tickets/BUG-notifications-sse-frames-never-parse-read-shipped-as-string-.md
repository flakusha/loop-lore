<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Notifications SSE frames never parse: read shipped as string, schema expects number

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** notifications sse frames never parse read shipped as string
**Context:** Context: pre-existing (schema from cd17af3fc), worsened this week when e0ba5f698 fixed only the REST twin (routes/notifications/index.ts:35-38 maps read->1/0).
**Acceptance Criteria:** map read to 1/0 in stream.ts send path (mirror index.ts) or widen schema to accept the enum strings.

## Summary

Context: pre-existing (schema from cd17af3fc), worsened this week when e0ba5f698 fixed only the REST twin (routes/notifications/index.ts:35-38 maps read->1/0). Severity: high. stream.ts:117,132 sends NotificationService.list() rows whose read is a raw 'unread'/'read' string (notifications/service/crud.ts:21,51,70,103,120); NotificationListItem.read is Type.Number() (validation/schemas/responses.ts:173) and the Alpine consumer parseOr falls back to {items:[],unreadCount:0} then early-returns (user-notifications.ts:71-75) — live SSE toasts/badge/list updates never apply + console.warn spam per tick. Repro: connect SSE stream, create a notification, observe no client update. Fix: map read to 1/0 in stream.ts send path (mirror index.ts) or widen schema to accept the enum strings.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
