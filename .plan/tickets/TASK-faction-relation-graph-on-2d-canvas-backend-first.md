<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Faction relation graph on 2D canvas (backend first)

**Status:** Not Started
**Priority:** medium
**Effort:** Large

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryFaction relations graph on the shared graph-canvas. Prerequisite: no factions table exists today (grep confirms zero faction tables in src/db; npc.ts renders MOCK_FACTIONS only), so this ticket pairs a minimal factions backend slice with the graph frontend.<a name="context"></a>## ContextDepends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas. Today: src/frontend/alpine/npc-faction-mock.ts mock data, ChatNpcState.factions panel, no persistence. Backend slice: factions + faction_memberships (+ optional faction_standings) via new forward migration, following character_relationships precedent (uq actor/target/world). Frontend: nodes = factions, edges = standings/alliances, member counts as node weight.<a name="acceptance"></a>## Acceptance Criteria- [ ] New migration creates factions/membership tables; NPC faction panel reads real data with mock fallback removed or flagged.- [ ] Graph-canvas renders faction nodes + standing edges, capped at 200 nodes.- [ ] bun run check green (incl. db:sync-types regen).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
