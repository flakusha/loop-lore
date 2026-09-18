<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Schema CRUD Routes And Migration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, schema, crud

**Summary:**
Persist parties and their members (mixed player + NPC + retinue).

**Context:**
No party abstraction exists today - only group chat. The world-RPG epic batch wants a first-class party entity that can travel together, share loot, take patrol routes, and bind NPCs.

**Acceptance Criteria:**
- Migration: `parties(id, world_id, type enum, leader_id, schedule_json, route_json, state_json, economy_json, created_at)`, `party_members(party_id, actor_id, joined_at, role enum(leader|member|invited|kicked))` with PK `(party_id, actor_id)`.
- CRUD routes `src/routes/parties.ts` mounted: `GET /api/worlds/:worldId/parties`, `POST /api/parties`, `POST /api/parties/:id/members` (invite), `DELETE /api/parties/:id/members/:actorId` (leave/kick), `POST /api/parties/:id/disband`.
- Type enum covers caravan / patrol / raid / trade / escort / hunting / mixed.
- Reuses `assertMigrationsNotStale`. Generated types regenerated.
- 401/403/422 tests.
