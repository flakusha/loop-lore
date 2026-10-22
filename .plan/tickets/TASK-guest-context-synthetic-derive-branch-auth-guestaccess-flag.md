<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest context: synthetic derive branch + auth.guestAccess flag

**Status:** Done
**Scope:** Guest Access epic Phase 1: synthetic guest auth context + auth.guestAccess flag
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access

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

The synthetic guest tier landed as specified:

- `auth.guestAccess` (default false): `src/config/sections/auth.ts` carries the default, the section field and the `authMeta` property; `AUTH_GUEST_ACCESS` is the env alias (`src/config/schema-class/env-map.ts`); the generated config schemas were regenerated.
- Derive branch (`src/middleware/auth/authenticate.ts`): no token + `required` + `guestAccess` derives `{ userId: null, userRole: "guest", sessionId: null }`. No users/sessions row is written and the context is re-derived per request. The solo fallback still wins when `required` is false, and a presented-but-invalid token still returns 401 — never a guest downgrade.
- Spoof fix (`src/elysia-app.ts`): an account-less caller (anonymous or guest) has a client-supplied `x-user-id` dropped, so the access log and the async lifecycle row cannot be attributed to another user. The 401 path already dropped it; the guest path did not.
- Read surface: `requireWorldAccess` takes an `allowGuest` option (`src/routes/worlds/access.ts`) and the world detail handler passes it (`src/routes/worlds/worlds.ts`), so a guest reads a PUBLIC world through `GET /api/worlds/:worldId`. Mutation routes keep `requireUserId`, which denies a null user id — the tier is read-mostly by construction.
- The tier reuses the existing `guest` role of the RBAC matrix (`src/users/permissions.ts`: `chat.join`, `character.view`, `world.view` — no write permission), so no permission was widened and the routes that guard by role alone deny the guest too.

Alternative considered: widening `requireWorldAccess` for every caller. Rejected — several world routes (anomalies, karma, storage, encounters) authorize through `requireWorldAccess` alone and are POST/PUT/DELETE, so a global grant would have opened writes to guests. The option is opt-in per read route instead.

Tests: `src/middleware/auth/guest-access.test.ts` (guest context shape, nothing persisted, flag-off 401, solo wins, invalid token 401, valid token wins, `x-user-id` spoof dropped) and `src/routes/worlds/worlds-routes.test.ts` (guest reads a public world, private world invisible, flag-off still invisible, guest cannot create).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue f790146 (registry tip: 8ace39b44 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GUEST-CONTEXT-SYNTHETIC-DER)
