<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Per-World Character Setup & Overlay

**Status:** 🟡 In Progress (schema + service + seed hook shipped; resolution integration pending)
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** characters, worlds, setup, inventory, lore, backstory, overlay, world-scoping

## Overview

A character has one base **setup** (personality, description, scenario, system
prompt, welcome message — the "Layer 0" core on `actors`). When that character
is placed into a **world**, the world may supply **custom additional setup** —
starting inventory, world-scoped lore entries, backstory-in-world-context, and
per-world scenario/system-prompt overrides. This epic introduces the formal
`(character, world)` setup bundle and the resolution rule that merges it over
the base setup.

## Core Problem

Character configuration today mixes two concerns:

- **Persistent setup** (`actors.description`, `personality`, `scenario`,
  `system_prompt`, `welcome_message`, `mes_example`, `alternate_greetings`,
  `post_history_instructions`) — set at creation, world-independent.
- **World-specific setup** (starting gear, world lore, world backstory,
  prompt overrides) — must vary per world without corrupting the base.

Currently world-scoping is **fragmented** across unrelated tables (see
matrix below). There is no single authoritative "how does this character
start in this world" record, and no resolution rule. A character dropped
into a new world either inherits a bare `npc_states` row (health, knowledge,
schedule) or nothing at all — no starting inventory, no world-context lore,
no backstory reframing.

## Data Model

### `character_world_setup` (new, Layer 2)

One row per `(actor_id, world_id)` pair. Captures the world-specific setup
bundle that overlays the base `actors` setup.

```typescript
interface CharacterWorldSetup {
  id: string;
  actor_id: string;                 // → actors.id
  world_id: string;                 // → worlds.id
  starting_inventory: string;       // JSON: WorldSetupInventoryItem[]
  lore_entries: string;             // JSON: WorldSetupLoreEntry[] (character lore, world-scoped)
  backstory: string | null;         // world-context backstory reframing
  scenario_override: string | null; // per-world scenario
  system_prompt_override: string | null; // per-world system prompt
  initial_state: string;            // JSON: misc world-scoped params (standing, buffs, health, ...)
  created_at: string;
  updated_at: string;
}
```

- `starting_inventory` — items the character begins with in *this* world. Does
  **not** replace current inventory; current inventory remains authoritative in
  `world_items.owner_actor_id` (see `TASK-link-npc-inventory`). Resolution
  seeds current inventory from starting inventory on first join when
  `world_items` is empty.
- `lore_entries` — world-scoped character lorebook entries (keys + content).
  Complement (not replace) `actor_lore_entries` (global) and
  `world_lore_entries` (world, not character-scoped). Kept denormalized JSON
  for the setup snapshot; a relational `actor_lore_entries.world_id` is a
  follow-on (see Tasks).
- `backstory` — how the character's history reframes for this world's context.
- `scenario_override` / `system_prompt_override` — per-world prompt overrides
  applied over the base setup at prompt assembly.
- `initial_state` — catch-all JSON for world-scoped parameters identified in
  the scoping research below (standing, buffs, health floor, etc.).

### Resolution Order

When assembling a character in a world, merge in order:

1. **Base setup** (`actors` core fields)
2. **World setup** (`character_world_setup` overrides + starting inventory)
3. **Current state** (`npc_states` dynamic, `world_items` current inventory)
4. **Story overlay** (per-session — see `TASK-character-world-data-separation` Layer 3)

Later layers override earlier. World setup overrides base prompt fields only
when non-null; starting inventory seeds (does not override) current inventory.

```typescript
function resolveCharacterWorldSetup(
  actor: Actors,
  setup: CharacterWorldSetup | null,
  current: { npc: NpcStates; inventory: ItemInstance[] },
): ResolvedCharacterWorldSetup;
```

## World-Scoping Research Matrix

Audit of every character/NPC state table for whether it is world-scoped today,
and whether it *should* be. Result: several character systems are
**global-only** and are candidates for world scoping; the setup table + matrix
below is the roadmap.

| Table | Current scope | Should be world-scoped? | Notes |
| --- | --- | --- | --- |
| `actors` (base setup) | global | ❌ base | world-independent core |
| `characters` (canonical) | global | ❌ base | canonical record |
| `character_permanent_traits` | global | ❌ immutable | identity/personality core |
| `character_world_traits` | ✅ world | ✅ | speech/behavior/emotional/social |
| `character_location_traits` | ✅ location→world | ✅ | per-location effects |
| `character_mood` | ✅ world (nullable) | ✅ | |
| `mood_events` | ✅ world (nullable) | ✅ | |
| `character_relationships` | ✅ world (nullable) | ✅ | |
| `character_intimacy` | ✅ world (nullable) | ✅ | |
| `character_arousal` | ✅ world (nullable) | ✅ | |
| `nsfw_encounters` | ✅ world (nullable) | ✅ | |
| `actor_memories` | ✅ world (nullable) | ✅ | |
| `npc_states` | ✅ world | ✅ | dynamic state |
| `world_items.owner_actor_id` | ✅ world | ✅ | current inventory |
| `world_avatar_config` | ✅ world | ✅ | avatar override |
| `actor_lore_entries` | ❌ global | ⚠️ **yes** | follow-on: add `world_id` |
| `character_desire_profile` | ❌ global | ⚠️ maybe | NSFW per-world desires |
| `character_body_profile` | ❌ global | ⚠️ maybe | body/stamina per-world |
| `character_heat_cycle` | ❌ global | ⚠️ maybe | species cycles per-world |
| `character_fantasies` | ❌ global | ⚠️ maybe | |
| `character_seduction_skills` | ❌ global | ⚠️ maybe | per-world skill levels |
| `character_emotions` | ❌ global | ⚠️ maybe | |
| `character_availability` | ❌ global | ❌ legal | creator prerogative, global |
| `character_licensing` | ❌ global | ❌ legal | license is world-independent |
| `admin_character_overrides` | ❌ global | ❌ admin | moderation, global |
| `actor_notes` | ❌ global | ⚠️ maybe | GM notes per-world? |

**Immediate candidates** (first follow-on): `actor_lore_entries.world_id`,
`character_desire_profile`, `character_seduction_skills`. Captured in Tasks
phase 2.

## Tasks

### Phase 1 — Setup bundle (this epic)

- [x] `character_world_setup` migration + schema
- [x] `CharacterWorldSetupService` — upsert/get/update/delete dispatchers
- [x] Resolution helper — merge base setup + world setup
- [x] Seed hook — create empty setup row on character join (world-state init)
- [x] Unit tests — CRUD + resolution + seed idempotency

### Phase 2 — World-scope relational follow-ons

- [x] `actor_lore_entries.world_id` (nullable) — world-scoped character lore
- [x] World-scope `character_desire_profile` / `character_seduction_skills`
- [x] Prompt assembly consumes `scenario_override` / `system_prompt_override`
- [x] Starting inventory seeds `world_items` on first join
- [x] Import/export carries `character_world_setup` rows

## Files

- `src/db/migrations/060_character_world_setup.ts` — schema migration
- `src/db/schema-character.ts` — generated `CharacterWorldSetup` interface
- `src/characters/world-setup/types.ts` — row + input + resolution types
- `src/characters/world-setup/crud.ts` — CRUD dispatchers
- `src/characters/world-setup/resolve.ts` — base + world merge
- `src/characters/world-setup/index.ts` — `CharacterWorldSetupService`
- `src/story/world-state/init.ts` — seed hook
- `src/test-utils/insert-helpers.ts` — generated insert helper

## Related

- `TASK-character-world-data-separation.md` — parent 4-layer separation (this is Layer 2 focused)
- `TASK-link-npc-inventory.md` — current inventory via `world_items.owner_actor_id`
- `epic-worlds-extension.md` — world shareability/placement
- `epic-character-core-system.md` — base setup (Layer 0)
- `TASK-world-item-instance-npc.md` — item placement onto NPCs
