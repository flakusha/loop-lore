<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Users, Roles & Sessions Lifecycle

**Status:** ✅ Done (duplicate — remainder extracted, 2026-09-19)
**Priority:** high
**Effort:** Large
**Summary:** Users, Roles & Sessions Lifecycle
**Context:** Epic epic-auth-access; tags users, sessions.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-auth-access
**Tags:** users, sessions

## Summary

Implement session lifecycle (create/refresh/revoke), role hierarchy (user/admin/owner), 2FA/TOTP mechanics, consent schema per docs/spec/users-sessions.md.

## Resolution

Core scope tracked by src/auth/ + epic-two-factor-auth.md + epic-shared-schemas.md. Unplanned remainder extracted 2026-09-19 → E9 session refresh/revoke lifecycle (epic-auth-access.md) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
