<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Guest context: synthetic derive branch + auth.guestAccess flag

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access.md

**Summary:**


## Problem

Unauthenticated requests get 401 (auth.required=true) or the solo user with ["*"] perms (auth.required=false). No read-mostly tier exists for visitors.

## Change

- New `auth.guestAccess` config flag (default false).
- Auth derive (src/middleware/auth/authenticate.ts): no valid token + guestAccess on -> context { userId: null, userRole: UserRole.Guest, sessionId: null }, mutually exclusive with the solo fallback.
- No users/sessions row; context re-derived per request.
- Read-mostly routes gain a guard accepting guest via can(role, perm); mutation routes keep requireUserId.
- Unit tests: guest branch, flag-off unchanged, solo-fallback guard.

## Acceptance

- Flag on: unauthenticated request derives userRole=guest and reaches read-mostly public routes.
- Flag off: behavior unchanged.
- Solo mode still yields solo user with ["*"] perms.
- No user/session persistence for guests.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
