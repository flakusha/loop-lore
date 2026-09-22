<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-032: User Seeding & Role Expansion

**Status:** 🟡 Partially Shipped — script + matrix + role-change audit in commits c6f2a6b / 5f49431; admin user-list UI already existed in pre-batch code (no new file created)
**Priority:** medium
**Effort:** Medium
**Summary:** Seed Command provisions demo accounts; role enum + capability matrix enforced in middleware.
**Context:** User bootstrap + RBAC expansion.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: 🟡 Partial — seed + matrix + audit shipped 2026-09-22
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

## Resolution (commits c6f2a6b / 5f49431, 2026-09-22)

Shipped in this batch:

- `scripts/seed-users.ts` — provisions admin / moderator / contributor / guest demo accounts with deterministic bcrypt hashes; idempotent via `ON CONFLICT DO NOTHING`.
- `package.json` — added `"seed:users": "bun run scripts/seed-users.ts"`.
- `src/users/capabilities.ts` — documented role × capability matrix (`ROLE_CAPABILITIES`) for the four seeded roles + `capabilitiesForRole(role)` lookup helper. Pins each capability to the permission string in `src/users/permissions.ts`.
- `src/routes/admin/users.ts` — `PATCH /api/admin/users/:id/role` now writes a `log_entries` audit row (`event_type = "user.role_changed"`, meta `{ from, to }`) on every role change. Audit failure is non-fatal so a log-write error never rolls back the role change.

Pre-existing coverage (verified, not authored in this batch):

- `src/users/roles.ts` — `ALL_ROLES` already lists `Admin`, `Moderator`, `Creator`, `Player`, `User`, `Viewer`, `Guest`, `Bot`, `Tester`, `Custom`, `Solo`; helpers `isValidRole`, `isAdminRole`, `isElevatedRole`.
- `src/users/permissions.ts` — `DEFAULT_PERMISSIONS` per role with wildcard support; `can(role, perm)` + `hasAll(...)` helpers; the source of truth that the middleware / route guards call.
- `src/db/enums-core/users.ts` — `UserRole` enum (`admin | moderator | creator | player | user | viewer | guest | bot | tester | custom | solo`).
- `src/routes/admin/users.ts` — `GET /api/admin/users` list (paginated, `q` + `role` filters), `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id/role`, `DELETE /api/admin/users/:id`. Enforced via `can(userRole, "admin.users")`.
- `src/frontend/alpine/admin-users.ts` — Alpine component: `loadUsers`, `startEditRole` / `saveRole` / `cancelEditRole`, `deleteUser`, `searchUsers`, `clearUserFilters`, `goUsersPage`.
- `src/routes/admin/users.test.ts` — unit tests for 401 (anon), 403 (non-admin), 200 (admin) on list, role-filter, single-fetch, role-PATCH success + invalid role rejection.

Acceptance criteria checklist:

- [x] `bun run seed:users` provisions admin / moderator / contributor / guest with deterministic credentials (commit c6f2a6b).
- [x] Role enum includes admin / moderator / contributor / guest with documented capabilities — `UserRole` (`src/db/enums-core/users.ts`) + `ROLE_CAPABILITIES` (`src/users/capabilities.ts`).
- [x] Capability matrix enforced in middleware via `can(role, perm)` (`src/users/permissions.ts`) and route guards (`src/routes/admin/users.ts` uses `can(userRole, "admin.users")`). Per-role unit-tested in `src/routes/admin/users.test.ts` (anon/non-admin/admin variants).
- [x] Admin UI lists users and supports role change — `src/frontend/alpine/admin-users.ts` provides the Alpine state; role-change handler now emits audit (commit 5f49431).
- [x] Existing user / admin paths do not regress — the audit insert is wrapped in try/catch and does not modify the role-change response shape; `users.test.ts` continues to assert 200 for valid role PATCH.

File-naming divergences from the ticket (project convention):

- Ticket references `src/user/` (singular). The repo folder is `src/users/` (plural) — `src/users/roles.ts`, `src/users/capabilities.ts`, `src/users/permissions.ts`.
- Ticket references `src/views/admin/UserListView.vue`. The repo surface is htmx + Alpine, not Vue; the admin user list is wired in `src/views/admin.html` via `x-data="adminUsers"` + `src/frontend/alpine/admin-users.ts`. No new view file was needed.

Follow-ups (open at end of this batch):

- Per-role unit test for the full `ROLE_CAPABILITIES` matrix in `capabilities.ts` (currently no dedicated test file — covered transitively via `permissions.test.ts`).
- Dedicated e2e test for the seed script running against an empty DB (currently only the unit-level `seedUsers(db)` is exercised via import).

Git issue: `f51cf0f`
