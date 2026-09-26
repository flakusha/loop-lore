<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel routes schema + CRUD

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** routes, travel, transport, crud, validation

**Summary:** Service layer for travel_routes + travel_route_stops with stop CRUD, world-scoping, and validation (minStops=2, endpoint kinds, loop match). Full details in TASK-travel-routes-schema-and-crud.md.
**Context:** Travel routes are the new mechanism for mobile transport movement (e.g. a ship sailing between ports).
**Summary:** Stub ticket — superseded by `TASK-travel-routes-schema-and-crud.md` (the authoritative ticket). This file is kept as a redirect only; do not assign work to this slug. Travel routes service layer (`travel_routes` + `travel_route_stops`) covers create/list/update/delete with ordered stop list + dwell, validates minStops=2, endpoint kinds, and loop match, and emits result-typed errors.
**Context:** Travel routes are the new mechanism for mobile transport movement (e.g. a ship sailing between ports). `TASK-travel-routes-schema-and-crud.md` carries the full schema + service contract + tests; this stub exists only to satisfy an old index.json entry that referenced this slug. Reference both: index.json entry for `TASK-TRAVEL-ROUTES-SCHEMA-CRUD` should be retired after a final `plan:sync:fix` run.

## Summary

Service layer for travel_routes + travel_route_stops: create/list/update/delete + ordered stop list with dwell. Validates minStops=2, endpoint kinds, loop match. Result-typed errors. See .plan/tickets/TASK-travel-routes-schema-and-crud.md.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
