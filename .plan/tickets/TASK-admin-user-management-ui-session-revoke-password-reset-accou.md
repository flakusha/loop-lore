<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin user management UI: session revoke, password reset, account disable

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

**Summary:**

epic-frontend-admin references settings one-way and never login, but admin user management revokes sessions, resets passwords, and disables accounts — the auth surface epic-frontend-login owns. src/frontend/alpine/admin-users.ts ships loadUsers/startEditRole/saveRole/cancelEditRole/deleteUser/searchUsers but no revokeSession/resetPassword/disableUser; src/routes/admin/users.ts exposes only PATCH /role and DELETE. TASK-sessions-api-routes covers the sessions API generically, not the admin UI surface. Define the admin auth-actions UI and wire it to the session lifecycle. See matrix-frontend-backend-integration.md FB10.

**Context:**

`epic-frontend-admin.md` references settings one-way and never login, but admin user management revokes sessions, resets passwords, and disables accounts — the auth surface `epic-frontend-login.md` owns. `src/frontend/alpine/admin-users.ts` ships `loadUsers`/`startEditRole`/`saveRole`/`cancelEditRole`/`deleteUser`/`searchUsers` but no `revokeSession`/`resetPassword`/`disableUser`; `src/routes/admin/users.ts` exposes only `PATCH /role` and `DELETE`. `TASK-sessions-api-routes.md` covers the sessions API generically, not the admin UI surface. No ticket tracks the admin auth-actions UI.

**Acceptance Criteria:**

- [ ] `src/frontend/alpine/admin-users.ts` exposes session-revoke, password-reset, and account-disable actions.
- [ ] `src/routes/admin/users.ts` (or a sibling admin route) implements the matching endpoints, gated by `can(userRole, "admin.users")`.
- [ ] Each action emits an audit-log entry and surfaces a success/error toast via the shared UI store.
- [ ] `bun run plan:validate` passes; `epic-frontend-admin.md` and `epic-frontend-login.md` cross-reference the admin auth-actions surface.
