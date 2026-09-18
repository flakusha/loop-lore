<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-032: User Seeding & Role Expansion

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Seed Command provisions demo accounts; role enum + capability matrix enforced in middleware.
**Context:** User bootstrap + RBAC expansion.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort**: Medium
**Labels**: user, seeding, roles, onboarding
**Assignee**:
**Epic**: epic-auth-access
**Related**:

## Summary

Seed default user accounts for development and demo, and expand the role taxonomy beyond admin/user to cover moderator, contributor, and guest with appropriate capability grants.

## Context

Affects user bootstrap and RBAC. IN: seed data, role enum expansion, capability matrix, admin UI for role assignment. OUT: SSO/SAML integration, paid tier gating, audit log retention policy.

## Acceptance Criteria

- A `bun run seed:users` script provisions admin, moderator, contributor, and guest demo accounts with deterministic credentials
- Role enum includes `admin`, `moderator`, `contributor`, `guest` with documented capabilities
- Capability matrix is enforced in middleware and unit-tested per role
- Admin UI lists users and supports role change with audit event
- Existing user/admin paths do not regress

## Related Files

- scripts/seed-users.ts (to be created)
- src/user/roles.ts
- src/user/capabilities.ts (to be created)
- src/views/admin/UserListView.vue

## Notes

- Coordinate with epic-auth-access for capability gating
- See epic-user-stories for the user journey context these roles enable

Git issue: `f51cf0f`
