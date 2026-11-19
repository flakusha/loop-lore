<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Enforce RBAC tranche-1 capability gates on the create/import/export/chat surface

**Status:** In Progress
**Scope:** Required permission gating on create/import routes
**Priority:** high
**Effort:** Medium
**Epic:** epic-auth-access
**Tags:** rbac, permissions, multi-user

**Caveats:** TOCTOU: permission is checked per request at the route gate; concurrent role changes apply to the next request, not in-flight ones. Security: deny-closed — unknown roles and null roles fail the gate. Authorization: this ticket ADDS the missing gates; the broad `admin.character`/`admin.world` cross-user bypasses stay for tranche 2. Parallelism: route-layer guards are stateless; no shared state. Partial failure: each route fails independently with 403; no cross-route transaction. Rollback: removing a guard restores prior behavior; matrix lines are additive. Observability: denials flow through the existing 403 + audit-log path in the guard helpers.

**Summary:**

A mechanical scan of the tracked tree (`git ls-files 'src/**/*.ts'`, 5469 files) for `can(`, `requirePermission(`, `withPermissionAuth(`, `requirePermissionUserId(` with string-literal capabilities plus a manual sweep for non-literal lookups shows: 33 declared capabilities in `src/users/permissions.ts:21-54`, 13 enforced, 20 decorative. Full report: `.tmp/intercom/scripts/spike-rbac-enforcement.md` (dev checkout).

The 13 enforced are the eight `admin.*` caps plus `chat.join`, `character.view`, `world.view`, `moderation.review`, `moderation.action`. The 20 never checked in tracked production code are `chat.create`, `chat.delete`, `character.create`, `character.edit_own`, `character.edit_any`, `character.delete_own`, `character.delete_any`, `world.create`, `world.edit_own`, `world.edit_any`, `world.delete_own`, `world.delete_any`, `user.view`, `user.edit`, `user.delete`, `user.ban`, `export.own`, `export.any`, `import.own`, `import.any`. (An earlier ticket states 30 caps / 25 decorative; both numbers are superseded by this scan: 33 declared, 20 decorative. In the working tree `src/routes/auth/verify.ts:48` gates on `user.view`, so `user.view` must NOT be pruned — a concurrent MFA lane depends on it.)

Tranche 1 wires the 5 load-bearing authoring caps at the ROUTE layer only:

1. `character.create` — `src/routes/characters/create.ts:28-116` (`POST /api/actors`), via `requirePermissionUserId(ctx, "character.create")`.
2. `world.create` — `src/routes/worlds/worlds-routes.ts:65-83` (`POST /api/worlds`), same helper.
3. `import.own` — `src/routes/import/index.ts:34-38` (`POST /api/actors/import`); the route re-authenticates locally (`:36`), so take the role from the app-level derive (`src/elysia-app.ts:161`), not one source alone.
4. `export.own` + `export.any` — `src/routes/characters/export.ts:40,57-63`; the own-branch requires `export.own`, the cross-user branch becomes `export.any` instead of the broad `admin.character` bypass.
5. `chat.create` — `src/routes/chats/create.ts:169-172` (`POST /api/chats`), same helper.

Matrix change in `DEFAULT_PERMISSIONS` (`src/users/permissions.ts:56-88`, the only role mapping `can()` consults — `overrides` has no production caller): `user` and `player` MUST gain `import.own` (`register.ts:158` makes `user` the role of every registration, and it already holds `character.create`/`export.own`; without this line character import dies for every new account). Whether `moderator` gains `character.create`/`world.create`/`export.own`/`import.own` is an OPERATOR DECISION — record it as an open question; `viewer`/`guest`/`bot`/`custom` stay denied (that is the point for read-only roles).

Denial message: `auth-narrowing.ts:41` and `middleware/permissions.ts:118` hardcode `admin.adminAccessRequired`; change both to `errors.forbidden` (both keys exist: `src/public/locales/en.json:441` and `:678` — no locale edit). Update the exhaustive contract test `permissions.test.ts:218-292` for the new `import.own` rows (and moderator rows if granted).

Enforcement is ROUTE layer only by design: integration tokens (`llri_`, `src/middleware/auth/integration-token.ts:175-187`, `userRole: null`) and MCP/ACP inbound principals (`src/integrations/inbound/principal.ts:62`, `userRole: null`) are confined to `/integrations/*` with their own facade scope ladder (`FacadeScope`, `src/integrations/loop-lore-facade/types.ts:20`, `authz.ts:103`); service-layer checks would break the facade. Assistant slash commands and the LLM `create_character` tool call services directly with no role context — residual gaps, not this ticket.

**Context:**

Why tranche-1 instead of prune-or-blanket-enforce: the 1.0.0 tracker lists multi-user permission gating as Required, so the capability vocabulary must stay; blanket-enforcing all 20 duplicates owner checks that already exist and wires cross-user semantics that ride the coarse bypass today. These five are the behavior-visible surface: today any authenticated role (viewer, guest tier, bot, custom) can create/import/export characters because those routes call only `requireUserId`.

Alternatives considered: pruning the 20 decorative caps (rejected — deletes Required-scope vocabulary and breaks the MFA lane's `user.view` gate); service-layer enforcement (rejected — breaks integration-token and MCP/ACP principals by design).

**Acceptance Criteria:**

- [ ] `viewer` and `custom` roles get 403 on all five gates (`POST /api/actors`, `POST /api/worlds`, `POST /api/actors/import`, both export branches, `POST /api/chats`) with row counts unchanged.
- [ ] `user` role still creates/imports/exports characters and creates chats and worlds.
- [ ] Solo mode unaffected (`solo` holds `*`).
- [ ] Facade/integration-token and MCP/ACP inbound flows still work (no service-layer checks added).
- [ ] `src/users/permissions.test.ts` contract passes with the new `import.own` rows.
- [ ] Open question recorded: operator decision on the `moderator` matrix lines.

**Open Questions:**

- Operator decision pending: should `moderator` gain `character.create`, `world.create`, `export.own` and `import.own` in `DEFAULT_PERMISSIONS`? Tranche 1 leaves those lines absent; the matrix stays deny-closed for read-only roles.

**Related:** TASK-rbac-capability-matrix-not-enforced-25-of-30-caps-decorative.md, epic-auth-access.md
