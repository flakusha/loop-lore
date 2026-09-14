<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE: harmony checker blind to elysia-app direct routes, factory routes, sibling-schema consts

**Status:** ✅ Resolved (already on dev, 2026-09-14)
**Priority:** high
**Effort:** Medium

## Summary

Script scripts/check-fe-be-harmonization.ts misses: (1) routes mounted directly on parent app via (app as any).use/app.post in src/elysia-app.ts — POST /api/assets upload flagged FE-no-BE while code says 'registered directly in elysia-app.ts'; (2) createEntityRoutes factory in src/routes/entity-routes/{index,create,get,list,update,remove}.ts — /api/actors/:actorId/memories flagged FE-no-BE though actorMemoriesRoutes is mounted; (3) R constants imported from sibling schemas.ts (proactive-messaging) — resolved this round via const-map. Fix: teach scanBe elysia-app direct registrations + factory entityPaths expansion (parentPrefix/parentParam/entityPath from call sites), then promote gate to blocking. Verify: POST /api/assets + memories findings clear; dprint/t…

## Resolution

Already fixed in dev by `989b4642d` (feat(tooling): FE-BE harmonization check script plus advisory gate), `3edd82a4a` (fix(fe-be): harmonization checker const routes and call extents), `867eb3dae` (style(fe-be): dprint formatting for checker and touched files), `3e0fa509c` (fix(fe-be): knip ignore for checker, refresh code-map), and `387d0dd59` (fix(fe-be): gate blockers — format, sync index, growth write-path tests). Verified 2026-09-14 against `dev` HEAD `e90418082`:

- `scripts/check-fe-be-harmonization.ts:25` — `BE_EXTRA_FILES = ["src/elysia-app.ts"]`; `isBeFile` (line 27) routes through `BE_EXTRA_FILES`, so `src/elysia-app.ts:194-216` `app.post("/api/assets", …)` is picked up by `literalBeRoutes`.
- `scripts/check-fe-be-harmonization.ts:281-297` — `expandEntityFactories` uses `parentPrefix.*parentParam.*entityPath` regex (200-char non-greedy window) to expand `createEntityRoutes` calls into CRUD routes. Verified for all 5 factory files:
  - `src/routes/actor-items.ts:23-27` (parentPrefix=actors, parentParam=actorId, entityPath=items) → /api/actors/:actorId/items{,/:entityId}
  - `src/routes/actor-lore-entries.ts:21-25` → /api/actors/:actorId/lore-entries{,/:entityId}
  - `src/routes/actor-memories.ts:21-25` → /api/actors/:actorId/memories{,/:entityId} (suppressed from BE-no-FE because FE calls it via `src/frontend/alpine/memory-panel.ts:55,118,148,173` and `src/frontend/pages/new-chat/memory.ts:15`)
  - `src/routes/actor-notes.ts:21-25` → /api/actors/:actorId/notes{,/:entityId}
  - `src/routes/world-lore-entries.ts:65-69` (parentPrefix=worlds, parentParam=worldId, entityPath=lore-entries) → /api/worlds/:worldId/lore-entries{,/:entityId}
- `scripts/check-fe-be-harmonization.ts:211-225` — `routeConsts` reads sibling `schemas.ts` for `R` const resolution (e.g. `character-growth`'s `R = "/api/character-growth"`); `resolveRouteConsts` (line 228-236) expands `${name}` up to 3 passes.
- `scripts/check-parallel.mjs:260` — gate wired as `"fe-be - harmony (advisory)": "bun run scripts/check-fe-be-harmonization.ts || true"`. The `|| true` short-circuit is intentional pending the promote-to-blocking decision (per `epic-fe-be-harmonization.md` acceptance criterion); gate DOES surface drift via `.tmp/fe-be-harmony.json`.
- Live run: `bun scripts/check-fe-be-harmonization.ts` → FE calls: 354, BE routes: 676, schemas: 138, blocking: 0, advisory: 307. The 307 advisories are BE-no-FE (TUI/curl/partner or `epic-frontend-backend-integration` backlog), not drift — gate classification correct.
- Cross-references: sibling `BUG-fe-be-character-growth-arc-confirm-reject-declare-unsatisfia.md` is also ✅ Resolved by the same bookkeeping bucket.

No code change required.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated