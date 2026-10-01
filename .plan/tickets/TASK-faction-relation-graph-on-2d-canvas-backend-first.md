<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Faction relation graph on 2D canvas (backend first)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-2d-sprite-world.md
**Tags:** 2d-graph, canvas

**Summary:** Render faction relations on the shared graph-canvas, adding the minimal factions backend the frontend needs first — no faction persistence exists today.

**Context:** Depends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas.

Today: `src/frontend/alpine/npc-faction-mock.ts` supplies mock data to the `ChatNpcState.factions` panel; a grep of `src/db` finds no faction tables at all.

Backend slice: `factions` + `faction_memberships` (plus optional `faction_standings`) via a new forward migration, following the `character_relationships` precedent (`uq_relationships_actor_target_world`). Regenerate types with `db:sync-types`.

Frontend: nodes = factions, edges = standings/alliances, member counts as node weight.

**Acceptance Criteria:**

- [ ] New migration creates the faction tables; the NPC faction panel reads real data, and any mock fallback is removed or clearly flagged.
- [ ] Graph-canvas renders faction nodes plus standing edges, capped at 200 nodes.
- [ ] `bun run check` green, including `db:sync-types` regen.
