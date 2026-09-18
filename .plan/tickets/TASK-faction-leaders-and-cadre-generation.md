<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Faction Leaders And Cadre Generation

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-faction-reputation
**Tags:** factions, leaders, npcs

**Summary:**
Auto-generate faction leaders and key cadres (NPCs) bound to each faction, with their own characters and lore.

**Context:**
A faction is currently a name + standing + reputation. World-RPG wants each faction to have a leader NPC (with lore, character card, relationships), plus 3-5 cadres, plus N bodyguards. NPC generation reuses the auxiliary LLM pipeline so generated characters have trait/background blocks.

**Acceptance Criteria:**
- Schema: `faction_roster(faction_id, actor_id, role, joined_at, retired_at)` with roles `leader | cadre | guard | founder`.
- Leader generation: AUX prompt produces name, traits, scenario; persisted as character via `src/characters` API; faction_id FK injected into character card metadata.
- Cadre (3-5) and guards (N) generated similarly with role-specific prompt blocks.
- Tied to `epic-enemies-monsters` retinue ticket for boss+guards archetype reused as faction leaders + their bodyguards.
- Tests: generation idempotent per faction; leader death triggers `tickFactionPolitics`.
