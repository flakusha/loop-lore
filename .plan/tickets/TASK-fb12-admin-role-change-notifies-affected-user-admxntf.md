<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: FB12 admin role-change notifies affected user (ADMxNTF)

**Status:** Not Started
**Priority:** high
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** high
**Effort:** S (role-change call-site plus notify trigger)
**Summary:** Admin role-change in users.ts writes an in-app notification to the target user via the notifications trigger layer; today only the audit row exists and the user sees nothing.
**Context:** Source row matrix-frontend-backend-integration.md FB12 (ADMxNTF: admin actions notify affected users). Filed from 02-extract-features.md candidate 5, R02 BLOCKING-1 scoped to role-change-only, 05-prioritization.md section 4 Now. Files: src/routes/admin/users.ts and src/notifications/service/triggers.ts. Scope note: ban paths live elsewhere (src/chat/moderation.ts, src/routes/chats/moderation.ts, src/routes/nsfw-moderation/actions.ts) and session-revoke in src/routes/auth/session.ts; full ban plus revoke coverage is a separate M-effort follow-up, NOT this ticket. Dedup: grepped index.json for role notif and admin notif; only the admin user-management UI shell ticket, no notify ticket.
**Acceptance Criteria:**
- Role-change writes an in-app notification to the affected user reusing notifySystem or a new notifyAdminAction trigger.
- Notification fires only on successful role-change, not on validation failures.
- Tests cover role-change notify path and no-notify on failure.
- bun run check green.
**Related:** 02-extract-features.md row 5, R02 candidate 5 and BLOCKING-1, 05-prioritization.md Now, TASK-admin-user-management-ui.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
