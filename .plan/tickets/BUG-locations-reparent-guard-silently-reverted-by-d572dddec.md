<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Locations reparent guard silently reverted by d572dddec

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

Evidence (approved finding 1, P0; .tmp/concern-dev-2026-10-07.md, .tmp/concern-locations.md): src/routes/worlds/locations.ts:211 does a raw updates.parent_location_id = body.parentLocationId write with no self-parent/cycle/cross-world/existence validation; src/routes/worlds/locations-reparent.ts deleted (was 53 lines); src/locations/index.ts:13-14 dropped the LocationMoveError/LocationMoveReason exports; src/routes/worlds/locations-crud.test.ts lost the 188-line reparent test block added by 927a17a3c. Commit d572dddec is a stale-base redo of 388dcc991 that undid 927a17a3c. DB triggers guard INSERTs only (trg_locations_no_self_parent + trg_locations_cross_world_parent, src/db/migrations/001_init.ts:4124-4144 are BEFORE INSERT); the only UPDATE-side trigger trg_locations_set_path_on_update (001_init.ts:4161-4183) rewrites subtree paths with a recursive UNION ALL CTE. parentLocationId = a descendant of locId loops cycle members forever -> SQLite hangs -> bun:sqlite single connection wedges the whole app (repro .tmp/review/repro-locations-trigger.ts cycle: rc=124). Also unguarded on UPDATE: cross-world parent accepted (path /X/A/ corruption), self-parent grows path /A/ -> /A/A/ on every call, nonexistent id surfaces as an unhandled 500. The route has no body validation schema (src/routes/worlds/locations-routes.ts:106-132 passes ctx.body through raw); reachable by any world owner via PUT /api/worlds/:worldId/locations/:locId. Service-level moveSubtree (src/locations/tree.ts:237-268) still has all four checks — only the route wiring, typed errors, and route tests were lost. Fix: re-apply 927a17a3c on top of current dev (git cherry-pick 927a17a3c should apply nearly clean) — re-create src/routes/worlds/locations-reparent.ts, re-export LocationMoveError/LocationMoveReason from src/locations, replace locations.ts:211 with the reparentLocation(database, worldId, locId, parentId) call behind a typed typeof-body.parentLocationId-is-string guard, and restore the 188-line reparent block in locations-crud.test.ts. Do NOT replay d572dddec's locations.ts/index.ts hunks.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-09 registry-driven close: git issue 6e37975 (registry tip: 8443b4d2e Konstantin Fedotov Auto-closed: appended .md marker marks BUG-LOCATIONS-REPARENT-GUARD-SIL)
