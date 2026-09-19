<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal Locations Invariants Tests

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** tests, invariants, migration, tree, transport

**Summary:** Comprehensive invariant test suite — 10 invariants covering self-parent, cycle, cross-world, depth, path materialization, path rewrite, world-path unique, scheduler no-op, physical propagation, connections regression. Real bun:sqlite + Kysely harness.
**Context:** The fractal-locations migration introduces triggers and computed columns. Each invariant must fail if the underlying guarantee breaks; this suite is the regression net.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Comprehensive invariant test suite covering every fractal-locations
guarantee. One test file per concern; each test fails when the invariant
breaks. Lives under `src/db/fractal-locations-invariants.test.ts` for
DB-level invariants and `src/rpg/location-tree/invariants.test.ts` for
service-level invariants.

## Invariants to cover

1. **Self-parent reject** — inserting `A.parent = A.id` fails (DB trigger).
2. **Cycle reject** — `A.parent = B, B.parent = A` fails on the second
   write.
3. **Cross-world reject** — `A.parent = B` where `A.world != B.world`
   fails.
4. **Depth ≤ 12** — chain of 13 levels fails on the 13th insert.
5. **Path materialization** — every row's `path` matches
   `getPath(row.id)` from the recursive CTE.
6. **Path rewrite on parent change** — reparenting a subtree rewrites every
   descendant's path; the rewrite is idempotent.
7. **World-path unique** — inserting two rows with the same `(world_id,
   path)` fails.
8. **Transport with NULL `current_route_id` does not advance** — scheduler
   no-op.
9. **Actor `physical_location_id` propagation** — when a transport moves,
   every actor whose `spatial_location_id` is in the transport's subtree
   gets their `physical_location_id` updated.
10. **`connections` JSON unchanged** — the existing column is not touched
    by this migration (regression guard).

## Acceptance Criteria

- [ ] One assertion per invariant.
- [ ] Tests run inside a real `bun:sqlite` + Kysely harness (mirroring
      `src/db/migrations.test.ts`).
- [ ] Test fixtures in `.tmp/` only (not committed).
- [ ] All tests pass with `bun test src/db/fractal-locations-invariants.test.ts`.
- [ ] Coverage gate `bun run scripts/check/coverage.mjs --floor=80` met on
      the new modules.

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-locations-tree-integrity-service.md`
- `TASK-travel-scheduler-tick.md`
- `TASK-actor-position-physical-spatial-split.md`
