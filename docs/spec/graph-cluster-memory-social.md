<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Graph Cluster: Memory / Friends / Context Bindings

> Substrate: FEAT-generic-2d-graph-canvas-renderer
> (`graph-canvas/{types,draw,index}.ts`: nodes `id/label/kind/color`,
> edges `from/to/label`, static layout, no force-physics v1).

## 1. Sub-clusters

- **Social graph** (`epic-social-graph`, Not Started): actor↔actor and
  actor↔character edges (friends, favorites, block/avoid, RPG invites)
  with visibility gates (blog tiers); block rule is RPG-safety.
- **Memory knowledge** (`epic-memory-knowledge-systems`, In Progress):
  three-tier nodes (episodic/semantic/procedural) with emotion-impact,
  character integration, timescape; `timeline_id` contract.
- **Memory propagation** (`epic-memory-propagation`, Not Started): scope
  enum (character-private/party/timeline/GM-only), cross-timeline
  isolation, cross-chat event ordering/conflict detection.
- **Context bindings:** memory → owning entity via `source_chat_id`,
  scope, timeline; story entities scoped by `world_id`.

Read path: `listActorMemories` (`src/actors/actor-memories.ts`);
sources `actor_memories` + `memory_embeddings`.

## 2. Node/edge mapping

- **Social:** actor/character nodes; edges typed friend/favorite/block/
  invite, gated by visibility; blocked edges render dimmed/excluded.
- **Memory:** memory nodes (`id`, `memory_type`, `importance`, snippet);
  edges = shared `source_chat_id`, shared keyword, embedding proximity
  (heuristic until TASK-rag-knowledge-graph lands real storage).
- **Story entities:** actor nodes; `character_relationships` edges weighted
  by standing/trust, scoped by `world_id`.

## 3. Ticket overlap verdict

- `TASK-memory-relation-graph-on-2d-canvas` (memory frontend, heuristic
  edges) vs `FEAT-memory-visualizer-knowledge-graph-over-asset-links`
  (Done, duplicate-resolved to epic-analytics-observability FEA-2026-058):
  **link, not merge** — visualizer is done analytics scope; canvas ticket
  is the interactive frontend.
- `TASK-memory-relation-graph` vs `TASK-story-entity-relation-graph`:
  **link, not merge** — distinct node/edge sources (memories vs actors)
  sharing only the canvas substrate.
- `TASK-rag-knowledge-graph` (Not Started, backend entity/relationship
  storage) feeds both canvas tickets once landed: **dependency, not rival**.

## 4. Implementation phases

1. **Memory canvas:** GET endpoint (200-node cap + paging), nodes
   color-coded by `memory_type`, click shows content snippet.
2. **Story entity canvas:** GET endpoint scoped by `world_id`, edges
   color/width-coded by `relationship_type` + standing, click shows detail.
3. **Social edges:** friends/favorites/blocks overlay once
   `epic-social-graph` tables land; visibility gates enforced server-side.

## 5. Bindings

- Epics: `epic-social-graph`, `epic-memory-knowledge-systems`,
  `epic-memory-propagation`.
- Tasks: `TASK-memory-relation-graph-on-2d-canvas`,
  `TASK-story-entity-relation-graph-on-2d-canvas`,
  `TASK-rag-knowledge-graph` (backend feed),
  `FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas` (substrate).
