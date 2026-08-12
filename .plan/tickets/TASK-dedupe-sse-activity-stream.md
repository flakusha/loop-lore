# TASK: Deduplicate SSE activity stream (two connections to /api/activity/stream)

**Status:** 🟡 Open
**Priority:** Medium
**Effort:** Small
**Type:** Task
**Tags:** frontend, sse, activity, notifications, dedupe
**Epic:** epic-frontend-backend-integration.md

## Description

Two independent `EventSource` connections are opened to the **same** endpoint
`/api/activity/stream`:

- `src/frontend/alpine/chat-activity.ts:17` — `connectActivitySSE()` (chat activity
  unseen counts), wired from `chat/index.ts` + `chat/lifecycle.ts:65,87`.
- `src/frontend/alpine/notifications.ts:85` — `NotificationsManager.openStream()`,
  wired from `notifications.ts:41` (start → openStream).

Both parse the same `ActivitySnapshot` body and apply unseen-counts. This doubles
server load/connections and can cause double-apply of snapshots. (Note
`user-notifications.ts:66` opens a _different_ `/api/notifications/stream` — that one
is fine and out of scope.)

## Fix

Collapse to a single `/api/activity/stream` connection. Recommend: make
`NotificationsManager` accept/own the single `EventSource` and have
`chat-activity.ts` consume the same stream via a shared store, or drive both from
one manager. Preserve the disconnect/reconnect lifecycle in
`chat/lifecycle.ts:65,87`.

## Acceptance Criteria

- [ ] Exactly one `EventSource("/api/activity/stream")` in the browser at a time
- [ ] Unseen-count toasts + activity apply still work after dedupe
- [ ] No duplicate snapshot application (chat sidebar counts correct)
- [ ] Browser e2e activity/notification flow green
