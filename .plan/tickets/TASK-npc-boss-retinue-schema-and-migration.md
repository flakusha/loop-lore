<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: NPC Boss Retinue Schema And Migration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-npcs
**Tags:** npc, retinue, boss

**Summary:**
Persist boss-NPC retinue (mini-archetype) - one boss with N subordinate NPCs (guards, lieutenants, champions) with their own lore, relationships, and stats.

**Context:**
A boss NPC currently has no formal subordinate attachment. Players expect to encounter a named boss + 4-8 guards with their own characters/lore rather than anonymous mob. This ticket adds the retinue linkage so a guard can be bound to its boss.

**Acceptance Criteria:**
- `npc_retinue_boss(boss_id PK, retinue_lead_id nullable, defend_on_attack bool, scatter_on_death enum(flee|surrender|rage), min_chat_act enum(send_message|react_emote|join_battle))`.
- `npc_retinue_member(retinue_id FK, member_actor_id, role enum(guard|champion|lieutenant), loyalty enum(loyal|hired|coerced|cultist))`.
- FKs to `actors`; deletion cascades on boss/member delete.
- Migration applied; generated types regenerated; `schemas:check` green.
- Tests: insert retinue, query members, delete boss cascades.
