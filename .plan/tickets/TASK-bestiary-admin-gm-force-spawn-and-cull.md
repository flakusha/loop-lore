<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary Admin GM Force Spawn And Cull

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, admin, gm


Bestiary: Bestiary Admin GM Force Spawn And Cull


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Admin/GM endpoints to force a population count up or down; used for plot events, debugging, and player quests.

**Context:**
GMs need to spawn a specific species at a location to enable a quest, or cull an overpowered monster after a complaint. Both endpoints are admin-gated, idempotent, audited.

**Acceptance Criteria:**
- `POST /api/admin/bestiary/:speciesId/force-spawn` body `{ locationId, count, reason }` increments `LocationPopulation.count` up to `cap`, records `generation++`, writes audit row.
- `POST /api/admin/bestiary/:speciesId/force-cull` body `{ locationId, count, reason }` decrements count (floor 0), updates `lastDeathTick`, writes audit row.
- 404 if species/location missing; 403 if not admin; 422 on negative or excessive counts.
- Audit table populated (`bestiary_admin_log(species_id, location_id, action, count_delta, reason, actor_user_id, created_at)`).
- Smoke-tested in dev-server with logged-in GM.


git issue: bad551e
