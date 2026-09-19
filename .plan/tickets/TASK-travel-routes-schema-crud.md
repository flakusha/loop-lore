<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Travel routes schema + CRUD

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** routes, travel, transport, crud, validation

**Summary:** Service layer for travel_routes + travel_route_stops with stop CRUD, world-scoping, and validation (minStops=2, endpoint kinds, loop match). Full details in TASK-travel-routes-schema-and-crud.md.
**Context:** Travel routes are the new mechanism for mobile transport movement (e.g. a ship sailing between ports).
**Acceptance Criteria:** See TASK-travel-routes-schema-and-crud.md.

## Summary

Service layer for travel_routes + travel_route_stops: create/list/update/delete + ordered stop list with dwell. Validates minStops=2, endpoint kinds, loop match. Result-typed errors. See .plan/tickets/TASK-travel-routes-schema-and-crud.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
