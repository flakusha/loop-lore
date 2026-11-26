<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal Locations Invariants Tests

**Status:** In Progress
**Status Note:** 2026-11-18 reconciliation: the test file is `src/db/locations-fractal-invariants.test.ts` (18 tests) and this lane adds migration 106's UPDATE/depth trigger coverage. Six of the original ten invariants are asserted; four are carried work, not claimed done. Service-level invariants live in `src/locations/tree.test.ts`, not the ticket's old `src/rpg/location-tree/invariants.test.ts`.
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** tests, invariants, migration, tree, transport

**Summary:** Real DB+service invariant suite at `src/db/locations-fractal-invariants.test.ts:86-303` using `createTestDb()` (`src/test-utils/create-test-db.ts`), plus `src/locations/tree.test.ts:48-336`. This lane adds `src/db/migrations/106_locations_integrity.ts:18-72` (UPDATE twins + depth guards) and its up/down assertion at `locations-fractal-invariants.test.ts:237-273, 290-303`.
**Context:** The fractal schema lives in `001_init.ts:4004-4195` (four INSERT-time triggers); raw UPDATEs bypassed the guards until migration 106. Each invariant below has a failing-case assertion so a regression in a trigger or service surfaces immediately.
**Acceptance Criteria:** See acceptance checklist below.

## Summary (shipped evidence)

| Area | Shipped at |
| ---- | ---------- |
| Corrected test path — `src/db/locations-fractal-invariants.test.ts`, 18 tests | `locations-fractal-invariants.test.ts:86-303` |
| Real `bun:sqlite` + Kysely harness (no committed fixtures) | `locations-fractal-invariants.test.ts:17, 70-78`; `src/test-utils/create-test-db.ts` |
| INSERT-time guards (self-parent, cross-world, path set/rewrite) | `001_init.ts:4121-4184`; asserted `locations-fractal-invariants.test.ts:86-132` |
| UPDATE twins + depth triggers (this lane) | `src/db/migrations/106_locations_integrity.ts:18-72`; asserted `locations-fractal-invariants.test.ts:237-273, 290-303` |
| Service-level depth / cycle / path | `src/locations/tree.ts:109-142, 270-299`; `src/locations/tree.test.ts:100-176, 287-336` |
| Route, attach, position invariants | `locations-fractal-invariants.test.ts:152-235` |

## Invariant coverage (original ten)

1. **Self-parent reject** — [x] INSERT `:86-96`, UPDATE `:237-243` (migration 106 `trg_locations_no_self_parent_on_update`, `106_locations_integrity.ts:19-27`).
2. **Cycle reject** — [x] `locations-fractal-invariants.test.ts:134-141` (service `moveSubtree`); deliberately app-layer, not a DB trigger (`src/locations/tree.ts:19-21`).
3. **Cross-world reject** — [x] INSERT `:98-109`, UPDATE `:245-253` (migration 106 `:29-39`).
4. **Depth ≤ 12** — [x] INSERT/UPDATE `:255-273` against migration 106's depth triggers (`:41-64`); service ceiling also at `src/locations/tree.test.ts:161-176` (`LOCATION_DEPTH_LIMIT` imported `src/locations/tree.ts:32`).
5. **Path materialization** — [x] `:111-122` (trigger `trg_locations_set_path_on_insert`, `001_init.ts:4146-4157`).
6. **Path rewrite on parent change** — [x] `:124-132` and subtree-walk `:275-288` (`trg_locations_set_path_on_update`, `001_init.ts:4159-4184`).
7. **World-path unique** — [ ] carried: unique index `uq_locations_world_path` shipped (`001_init.ts:4065-4071`) but no assertion in this file.
8. **Transport with NULL `current_route_id` does not advance** — [ ] carried: the tick filters `current_route_id IS NOT NULL` (`src/locations/travel-engine.ts:74`) and a non-moving case exists at `src/locations/travel-engine.test.ts:133-160`, but there is no explicit invariant assertion here.
9. **Actor `physical_location_id` propagation** — [ ] carried as written: shipped propagation is `propagateTransportArrival` moving riders' **spatial** only (`src/locations/positions.ts:130-140`, tested `positions.test.ts:114-131` and `travel-engine.test.ts:210-271`), the inverse of this invariant. See `TASK-actor-position-physical-spatial-split.md` Caveats.
10. **`connections` JSON unchanged** — [ ] carried: raw inserts write `'[]'` (`locations-fractal-invariants.test.ts:32-35`) but no explicit regression assertion.

## Acceptance Criteria

- [ ] One assertion per original invariant — 6 of 10 covered (table above); 4 carried.
- [x] Real `bun:sqlite` + Kysely harness — `locations-fractal-invariants.test.ts:17, 70-78`.
- [x] No committed fixtures — the in-memory `createTestDb()` harness supersedes the `.tmp/` fixture convention.
- [x] Valid test command with corrected path — `bun test src/db/locations-fractal-invariants.test.ts` (gate execution belongs to the orchestrator; this lane does not run tests).
- [ ] Coverage gate `bun run scripts/check/coverage.mjs --floor=80` on new modules — not verified in this lane; orchestrator verifies.

## Carried (not claimed done)

- Assertions for invariants 7–10 above (world-path unique, NULL-route no-op, physical propagation under the original semantics, `connections` regression).
- Coverage-gate verification for the new modules.
- Note: cycle and depth are service/migration-enforced by design (`src/locations/tree.ts:19-21`, `106_locations_integrity.ts:41-64`), so a DB-trigger-only cycle test is intentionally absent.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-locations-tree-integrity-service.md`
- `TASK-travel-scheduler-tick.md`
- `TASK-actor-position-physical-spatial-split.md`
