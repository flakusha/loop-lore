# TASK: Finalize notification bell header wiring

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Frontend notification system review (loop-lore, 2026-08-25): all backend + most frontend wiring is complete EXCEPT the header bell.

Wired (verified):
- Backend notificationsRoutes (list, unread-count, PATCH :id, read-all, DELETE :id, preferences GET/PATCH, SSE /api/notifications/stream) registered via registerPlugins under /api.
- activityRoutes (/api/chats/activity) + activityStreamRoutes (/api/activity/stream) registered; NotificationsManager (notifications.ts) auto-starts at alpine:init.
- chatsRoutes PUT /api/v1/chats/:id/mark-read.
- Bundle (src/frontend/alpine/index.ts) imports ./notifications, ./user-notifications, ./notification-center.
- notificationCenter() mounted in src/views/notifications.html (nav link present in layout.html sidebar; view auto-discovered into ALLOWED_VIEWS).
- notificationPrefs() mounted in src/views/settings.html (line 301).
- globalThis.showToast defined in src/frontend/ui.ts:239, imported via app.ts/alpine-init.ts.

GAP (this ticket):
- notificationsBell() is implemented + bundled but mounted in ZERO of the 16 view headers (each view defines its own <header id="header-slot"> via htmx OOB swap; none references notificationsBell()). So the live header bell, dropdown list, and SSE-driven toasts never render.

Finalize steps (in this worktree):
1. Decide mount strategy: shared header partial (recommended) included by every view header, vs duplicating x-data="notificationsBell()" + bell button/dropdown markup in all 16 views.
2. Add the bell Alpine scope + bell button + dropdown template (items, unreadCount badge, markRead/markAllRead/dismiss/goTo) to the header. Reuse existing TYPE_ICONS/TYPE_LABELS + showToast.
3. Confirm connect() opens /api/notifications/stream (event "notifications") and refresh() hits /api/notifications?unread=true — both already match backend.
4. Verify build (bun run check) + a smoke test that the bell renders and an SSE notification produces a toast.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
