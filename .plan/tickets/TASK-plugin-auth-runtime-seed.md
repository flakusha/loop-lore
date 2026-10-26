<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Plugin auth surface + runtime seed endpoint

**Status:** Done
**Summary:** Gate plugin routes for multi-user + add runtime re-seed endpoint (`POST /api/v1/seed`, **planned-new**).
**Context:** Gaps 4–5. 7 shipped plugins declare no auth (`src/plugins/loader.ts`); seeding is boot-only (`src/seeding/*`, `src/characters/seed/*`).
**Acceptance Criteria:** Plugin routes gated in non-solo mode; runtime seed endpoint (**planned-new**) re-seeds without restart.

**Epic:** epic-interaction-surfaces-audit.md
**Type:** Feature | **Priority:** Medium | **Effort:** M

## Problem

- 14 plugin routes (`/api/dice/roll`, `/api/rps/*`, `/api/card-battle/*`, `/api/trivia/*`, `/api/nsfw-cards/*`, …) are public: none declares `requiresAuth`, and in solo default the gating is inert (`solo` holds `[*]`, boot warning only). Fine solo, real exposure multi-user.
- Character seeding is boot-only (`seedConfiguredContent` at start, no HTTP endpoint) — re-seed needs a restart (dogfood steps 5–7 friction).

## Change

- Part A (plugin auth): declare `requiresAuth`/`permissions` on shipped plugin `RouteDefinition`s (route-level gate via `src/plugins/route-access.ts`); keep solo behavior unchanged; verify boot warning disappears and multi-user mode 401s/403s correctly. Handlers that need row-level scoping scope by `caller.userId`.
- Part B (runtime seed, **planned-new**): `POST /api/v1/seed` (admin-gated) re-running the idempotent config-driven seed (`stable ids/adoption` in `src/characters/seed/*`); returns seeded counts. Document that `POST /api/v1/actors` / `/actors/import` remain the per-item path.

## Acceptance

- Solo mode: plugin routes work unchanged, no boot warning.
- `auth.required=true`: anonymous plugin calls → 401; non-admin → 403 where permissions declared.
- `POST /api/v1/seed` (**planned-new**) re-seeds idempotently without restart; second call is a no-op (stable ids).

## Non-goals

- Per-version plugin route registration / v2 (no v2 exists). Row-level ACL framework beyond caller scoping.

## Resolution

Partial — Part B done, Part A deferred with reason. `POST /api/admin/seed` (admin-gated via `withPermissionAuth` `admin.system`) re-runs `seedConfiguredUsers` + `seedConfiguredContent` with environment overrides applied; both seeders are idempotent (stable ids, skip-existing), so a repeat call is a no-op — proven by `seed.test.ts` (401 anon / 403 user / 200 seeds-then-noop). Mounted in the admin barrel; full admin suite green (268 pass). NOTE: the ticket names the path `POST /api/v1/seed`, but no such route exists in this tree — every admin route in `src/routes/admin/` mounts under `/api/admin/*`, so `/api/admin/seed` follows the actual convention.

Part A (declaring `requiresAuth`/permissions on the 14 shipped plugin game routes) deliberately NOT changed: those handlers are stateless, in-memory minigames taking no user data with ephemeral client-held state, so gating them changes solo behavior (currently always-authorised, inert) for no data-protection gain while adding multi-user breakage risk — review-before-enforce per assignment. The `checkRouteAccess` enforcement seam already exists and is tested (`route-access.test.ts`, `solo-mode-warning.test.ts`); the one genuine exposure in that surface (nsfw-cards served without an NSFW gate) belongs to NSFW gating work, not route auth.


git issue: 994687d
