<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-036: Crafting, Memory & Chat Systems

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** crafting DB layer (12 tables in `src/db/schema-crafting.ts`), Recipes/Stations/Process/Orders services, and the crafting HTTP surface (`src/routes/crafting/`, `src/routes/rpg/crafting-*.ts`) are shipped; memory injection + chat infrastructure merged; ProfessionsService/QualityService/GatheringService/DiscoveryService and all crafting UI are still pending (verified 2026-10-09)
**Priority:** High
**Effort:** Very High
**Issue:** `328843b`
**Type:** Feature Epic
**Tags:** crafting, professions, memory, context, chat, moderation

## Overview

Multi-system epic combining:

1. **Crafting & Professions** — full RPG crafting system with disciplines, recipes, gathering, stations, profession progression
2. **Memory Systems** — decay, promotion pipeline, provision wiring, trust-augmented sharing
3. **Chat Infrastructure** — context window management, event injection, route extraction
4. **Content Quality** — repetition/hallucination guards
5. **Moderation** — flagging, NSFW gating, user management (postponed)

---

## 1. Crafting & Professions

### Crafting Disciplines

**Core:**

| Discipline      | Description                     | Key Stats | Products                          |
| --------------- | ------------------------------- | --------- | --------------------------------- |
| **Alchemy**     | Potion brewing, poison crafting | INT, WIS  | Potions, poisons, elixirs         |
| **Smithing**    | Weapon & armor forging          | STR, CON  | Weapons, armor, tools             |
| **Enchanting**  | Magical item enhancement        | INT, CHA  | Enchanted items, scrolls          |
| **Cooking**     | Meal preparation, buff food     | WIS, DEX  | Meals, snacks, drinks             |
| **Tailoring**   | Cloth & leather armor           | DEX, INT  | Cloth armor, bags, cloaks         |
| **Woodworking** | Bows, staves, furniture         | DEX, STR  | Ranged weapons, staves, furniture |
| **Jewelry**     | Rings, amulets, gems            | DEX, INT  | Accessories, gem cutting          |
| **Engineering** | Gadgets, mechanisms, traps      | INT, DEX  | Gadgets, traps, mechanical items  |

**Gathering:**

| Discipline    | Description                      | Products                  |
| ------------- | -------------------------------- | ------------------------- |
| **Farming**   | Crop growing, animal husbandry   | Food, materials, reagents |
| **Fishing**   | Fish catching, aquatic resources | Fish, pearls, treasure    |
| **Mining**    | Ore extraction, gem finding      | Ores, gems, stone         |
| **Herbalism** | Herb gathering, plant knowledge  | Herbs, reagents, dyes     |
| **Skinning**  | Animal hide harvesting           | Leather, fur, bones       |
| **Logging**   | Wood harvesting                  | Lumber, branches, sap     |

### Crafting System

- **Recipes** — tiered recipe definitions with materials, station requirements, quality ranges
- **Stations** — world-placed crafting stations with tier bonuses (speed, quality, success, material saving)
- **Process** — crafting attempt with success/failure/critical outcomes, experience gain, skill increase
- **Quality** — 6-tier quality system (Poor → Legendary) with stat bonuses

### Profession Progression

| Level | Title       | Bonuses                                  |
| ----- | ----------- | ---------------------------------------- |
| 1-25  | Apprentice  | Basic recipes                            |
| 26-50 | Journeyman  | +5% success, tier 2 recipes              |
| 51-75 | Expert      | +10% quality, tier 3 recipes             |
| 76-99 | Master      | +15% speed, tier 4 recipes               |
| 100   | Grandmaster | +20% all, tier 5 recipes, unique recipes |

### Recipe Discovery

| Method                  | Description                | Success Rate       |
| ----------------------- | -------------------------- | ------------------ |
| **Experimentation**     | Combine materials randomly | Skill-based        |
| **Recipe Books**        | Learn from written sources | 100%               |
| **NPC Teaching**        | Learn from crafters        | Relationship-based |
| **Quest Rewards**       | Unlock through story       | Guaranteed         |
| **World Discovery**     | Find hidden recipes        | Random             |
| **Reverse Engineering** | Deconstruct existing items | Skill-based        |

---

## 2. Memory Systems

### Memory Decay (TASK-memory-decay-logic)

- **Problem:** `decay_rate`, `strength`, `last_accessed_at` columns exist but no logic uses them
- **Solution:** Implement time-based decay: `strength -= decay_rate × elapsed_days`, clamped to [0,1]
- **Files:** `src/memory/purge.ts` (extend)

### Memory Promotion Pipeline (TASK-memory-promotion-pipeline)

- **Problem:** `ContextWindow.promotedToMemory` always empty; `selectMessagesForPromotion()` finds candidates but nothing extracts memories from them
- **Solution:** Wire message → memory extraction pipeline: detect important messages, extract key facts, store as memories
- **Files:** `src/memory/extraction.ts` (extend), `src/chat/context-window.ts` (modify)

### Memory Provision Wiring (TASK-memory-provision-wiring)

- **Problem:** `buildProvisionContext()` builds context but doesn't pass all needed parameters
- **Solution:** Wire full provision context including trust, mood, and relationship data
- **Files:** `src/assistant/prompt/sections/memories.ts` (modify)

### Trust Modifier (TASK-memory-trust-modifier-wiring)

- **Problem:** `ProvisionContext.trustModifier` exists but is never set
- **Solution:** Query `RelationshipsService` for trust between actor and participants, normalize -100..+100 → -1..+1
- **Files:** `src/assistant/prompt/sections/memories.ts` (modify)

### Context Cut & Memory Promotion (TASK-context-cut-memory-promotion)

- **Problem:** When context window fills, old messages are trimmed without promoting important context
- **Solution:** Auto-promote key decisions, character moments, and high-importance content to memory before trimming
- **Files:** `src/chat/context-window.ts` (modify), `src/chat/pruning.ts` (modify)

### Character Memory Injection (TASK-character-memory-injection)

- **Problem:** No probability-based injection with privacy levels
- **Solution:** Configurable injection probability, privacy levels (absolute/isolated, localized), comfort system, secret sharing
- **Files:** `src/memory/provision.ts` (extend), new privacy model

### Related Memory & Event Injection Hooks (TASK-related-memory-event-injection-hooks)

- **Problem:** No pipeline for injecting related memories and active world events into chat context
- **Solution:** Create injection hooks for character/world/assistant memories + active world events
- **Files:** `src/assistant/prompt/sections/memories.ts` (modify), `src/assistant/prompt/sections/events.ts` (new)

---

## 3. Chat Infrastructure

### Route Extraction (TASK-chat-route-extraction)

- **Problem:** `src/routes/chats.ts` (785 lines) and `src/routes/messages.ts` (910 lines) contain business logic
- **Solution:** Move business logic to service layer; routes become thin HTTP adapters
- **Files:** `src/chat/service.ts` (modify), `src/routes/chats.ts` (modify), `src/routes/messages.ts` (modify)

### Context-Based Feature Permissions (TASK-chat-context-feature-permissions)

- **Problem:** No UI-level feature gating based on context
- **Solution:** Feature registry with permission model; UI elements enabled/disabled based on chat/world/location context
- **Files:** `src/chat/feature-permissions.ts` (new), `src/db/schema-permissions.ts` (new), `src/frontend/alpine/feature-gate.ts` (new)

### Repetition & Hallucination Guards (TASK-repetition-hallucination-guards)

- **Problem:** LLMs can get stuck in repetition loops or hallucinate entities
- **Solution:** Extend n-gram detection + new hallucination guard that checks entity existence against world state
- **Files:** `src/generation/repetition-detector.ts` (extend), `src/chat/hallucination-guard.ts` (new)

### Local Random Event Generator (TASK-local-random-event-generator)

- **Problem:** Chats feel static without ambient activity
- **Solution:** Stochastic event injection for ambient life (weather changes, NPC activity, environmental sounds)
- **Files:** `src/chat/random-events.ts` (new), `src/chat/context-window.ts` (modify)

---

## 4. Moderation (Postponed)

- **TASK-internal-external-flagging** — mod queue + user reports
- **TASK-nsfw-gate-moderation-events** — NSFW toggle + audit
- **TASK-user-block-ban-shadow** — block/ban/shadow primitives

---

## Integration Points

### Systems This Epic Depends On

| System                  | What It Provides                              | How Used                                                 |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------- |
| RPG Mechanics           | Stats (INT, DEX, STR, WIS), skill checks      | Crafting success rates, quality bonuses, speed modifiers |
| World & Locations       | Gathering nodes, terrain, climate             | Resource availability, seasonal herbs, node spawning     |
| Weather & Environmental | Seasonal effects, weather-dependent resources | Seasonal recipe ingredients, weather-gated gathering     |
| Magic & Spell Systems   | Enchantment recipes, magical materials        | Enchanting as cross-crafting-magic discipline            |
| Plugin System           | Extensibility framework                       | Custom disciplines, community recipes                    |
| Memory System           | Decay, promotion, trust                       | Memory injection for crafting context                    |
| Prompt Assembly         | Context window assembly                       | Memory/event injection into crafting prompts             |

### Systems That Depend On This Epic

| System                  | What It Consumes                   | How Used                                     |
| ----------------------- | ---------------------------------- | -------------------------------------------- |
| Battle & Action Systems | Equipment, consumables             | Crafted weapons/armor/potions used in combat |
| Inventory System        | Crafted items, materials           | Items flow from crafting to inventory        |
| Economy System          | Crafted goods, material market     | Crafted items enter economy as trade goods   |
| Housing & Base Building | Crafting stations, furniture       | Home crafting stations, furniture crafting   |
| Companion, Pet & Mount  | Pet equipment, mount gear          | Crafted pet/mount equipment                  |
| Disease & Poison        | Antidotes, poison crafting         | Alchemy produces antidotes and poisons       |
| NSFW Game Mechanics     | Aphrodisiacs, toys, contraceptives | Alchemy produces NSFW consumables            |
| Stealth & Crime         | Lockpicks, poisons, gadgets        | Engineering produces crime tools             |

### Shared Data Contracts

| Contract          | Shared With                             | Purpose                                           |
| ----------------- | --------------------------------------- | ------------------------------------------------- |
| `Item`            | Battle, Inventory, Economy, Housing     | Crafted items share unified item model            |
| `Recipe`          | Magic (enchanting), Housing (furniture) | Recipe definitions shared across crafting systems |
| `CraftingStation` | Housing                                 | Home crafting stations use same station model     |
| `CharacterStats`  | RPG, Battle, Social                     | INT/DEX/STR affect crafting success               |

### Cross-System Events

| Event                          | Direction                          | Purpose                                        |
| ------------------------------ | ---------------------------------- | ---------------------------------------------- |
| `crafting.item_crafted`        | emits → Battle, Inventory, Economy | Crafted items enter inventory/economy          |
| `crafting.recipe_discovered`   | emits → Character Core             | New recipe knowledge for character progression |
| `gathering.resource_harvested` | emits → Economy                    | Gathered materials enter market supply         |
| `weather.season_changed`       | subscribes ← Weather               | Seasonal recipes unlock/lock                   |
| `magic.enchantment_applied`    | subscribes ← Magic                 | Cross-system enchanting workflow               |

---

### Previous Integration Notes

- **RPG Mechanics** — Stats affect crafting success, quality, speed
- **Inventory System** — Material storage, crafted item management
- **Economy System** — Trading, market, currency
- **World & Locations** — Gathering nodes, crafting stations, event injection
- **Plugin System** — Disciplines/recipes extensibility
- **Memory System** — Decay, promotion, provision, trust
- **Prompt Assembly** — Memory/event injection into context

## Implemented (verified 2026-10-09)

**Tables:**

- `crafting_attempts`, `crafting_orders`, `crafting_recipe_materials`, `crafting_recipes`, `crafting_station_defs`, `crafting_station_instances`, `gathering_node_defs`, `gathering_node_instances`, `gathering_node_materials`, `professions`, `profession_specializations`, `recipe_discoveries` — `src/db/schema-crafting.ts`; created in `src/db/migrations/001_init.ts`, audit columns from `src/db/migrations/033_audit_columns_underdocumented_tables.ts`
- Enums (disciplines, `QualityLevel` Poor→Legendary, `GatheringNodeType`, `DiscoveryMethod`) — `src/db/enums-crafting.ts`

**Modules:**

- `src/rpg/crafting/process.ts` — `CraftingProcessService`: attempt → consume materials → roll → output
- `src/rpg/crafting/stations.ts` — `StationsService`: station def + instance CRUD
- `src/rpg/crafting/orders.ts` — `CraftingOrderService`: player commissions (accept/fulfil/cancel) settled through `TradeService`
- `src/rpg/crafting/recipes/` — `RecipesService` (`index.ts`) over `crud.ts` / `materials.ts` / `update.ts`
- `src/rpg/crafting/index.ts` still TODO-comments `ProfessionsService`, `QualityService`, `GatheringService`, `DiscoveryService` — none implemented

**Shipped:**

- `POST /api/worlds/:worldId/craft` + craft-attempt reads — `src/routes/crafting/attempt.ts`
- `POST|GET /api/worlds/:worldId/crafting-orders` + accept/fulfil/cancel — `src/routes/crafting/orders.ts`
- recipes CRUD + material replace — `src/routes/crafting/recipes.ts`; mounted in `src/routes/v1/actors-surface.ts`
- station defs/instances CRUD — `src/routes/crafting/station-defs.ts` + `station-instances.ts` (barrel `src/routes/crafting/stations.ts`)
- `POST /api/rpg/craft` and `/api/rpg/crafting/stations` — `src/routes/rpg/crafting-execution.ts` + `crafting-stations.ts` + `crafting-station-instances.ts`, mounted in `src/routes/rpg/index.ts`

## Current State

| Surface | Status | Where |
| ------- | ------ | ----- |
| Recipes (CRUD + materials) | Shipped | `src/rpg/crafting/recipes/`, `src/routes/crafting/recipes.ts` |
| Stations (defs + instances) | Shipped | `src/rpg/crafting/stations.ts`, `src/routes/crafting/stations.ts` |
| Craft attempts (process) | Shipped | `src/rpg/crafting/process.ts`, `src/routes/crafting/attempt.ts`, `src/routes/rpg/crafting-execution.ts` |
| Crafting orders (commissions) | Shipped | `src/rpg/crafting/orders.ts`, `src/routes/crafting/orders.ts` |
| Profession progression | Schema only | `professions` + `profession_specializations` tables; no `ProfessionsService` (`src/rpg/crafting/index.ts` TODO) |
| Quality (6-tier) | Enum only | `QualityLevel` in `src/db/enums-crafting.ts`; no `QualityService` |
| Gathering | Schema only | `gathering_node_*` tables; no `GatheringService`, no route |
| Recipe discovery | Dead schema | `recipe_discoveries` has no non-test consumer (schema + `src/test-utils/insert-helpers.ts` only) |
| Crafting UI | Not Started | no crafting surface in `src/frontend/` (only an NPC stat label in `src/frontend/alpine/npc-mock.ts`) |

## Files

### Crafting

Implemented (verified 2026-10-09):

- `src/rpg/crafting/` — crafting system root (`process.ts`, `stations.ts`, `orders.ts`, `recipes/`)
- `src/db/schema-crafting.ts` — crafting/gathering/profession tables
- `src/db/enums-crafting.ts` — crafting enums
- `src/db/migrations/001_init.ts` — creates the crafting tables
- `src/routes/crafting/` — attempt/orders/recipes/stations API
- `src/routes/rpg/crafting-execution.ts`, `src/routes/rpg/crafting-stations.ts`, `src/routes/rpg/crafting-station-instances.ts` — rpg-prefix crafting API

Planned (do not exist yet):

- `src/rpg/crafting/professions.ts`, `src/rpg/crafting/quality.ts`, `src/rpg/crafting/gathering.ts`, `src/rpg/crafting/discovery.ts` — remaining services

### Memory

- `src/memory/provision.ts` — memory filtering & injection
- `src/memory/purge.ts` — decay & purge
- `src/memory/extraction.ts` — memory extraction from messages
- `src/memory/shareability.ts` — sharing probability
- `src/assistant/prompt/sections/memories.ts` — prompt assembly

### Chat

- `src/chat/context-window.ts` — context window management
- `src/chat/pruning.ts` — context pruning
- `src/chat/service.ts` — chat business logic
- `src/chat/hallucination-guard.ts` — hallucination detection (new)
- `src/chat/random-events.ts` — event injection (new)
- `src/chat/feature-permissions.ts` — UI gating (new)

## Unticketed Gaps

- `recipe_discoveries` is schema-only: its only consumers are `src/db/schema-crafting.ts`,
  `src/validation/db-schemas.ts`, and `src/test-utils/insert-helpers.ts` — no service or route
  reads or writes it. `DiscoveryService` sits nominally inside
  `TASK-complete-crafting-system-services`, but nothing owns the orphaned table itself.
- The four `TASK-frontend-crafting-*-ui` tickets plus `TASK-implement-crafting-ui` cover
  attempts/orders/recipes/stations UI; no ticket tracks a professions/progression UI.

## Related Epics

- `epic-items-economy-crafting.md` — economy-side crafting consumption
- `epic-skills-professions-config.md` — professions config + frontend
- `epic-item-systems-unification.md` — close-out that landed the crafting routes
- `epic-rpg-mechanics.md` — stats/skill checks feeding crafting rolls

## Linked Tasks

### Done

- `TASK-context-cut-memory-promotion.md` (Done)
- `TASK-related-memory-event-injection-hooks.md` (Done)
- `TASK-repetition-hallucination-guards.md` (Done)
- `TASK-local-random-event-generator.md` (Done)
- `TASK-character-memory-injection.md` (Done)
- `TASK-character-memory-injection-privacy.md` (Done)
- `TASK-memory-selection-ui.md` (Done)
- `TASK-rpg-crafting-professions.md` (Done — recipes/stations/process shipped in `src/rpg/crafting/`; its professions/gathering scope is not)
- `TASK-crafting-stations-execution.md` (Done — `src/routes/rpg/crafting-execution.ts`)
- `TASK-wire-crafting-routes.md` (Done — `src/routes/crafting/` mounted in `src/routes/v1/actors-surface.ts`)
- `FEAT-item-crafting-system.md` (Done)

### In Progress / Open

- `TASK-crafting-professions.md` (open)
- `TASK-crafting-system.md` (open)
- `TASK-crafting-rare-discovery.md` (open)
- `TASK-economy-crafting-slash-interactions.md` (Not Started)
- `TASK-memory-decay-logic.md` (open)
- `TASK-memory-promotion-pipeline.md` (open)
- `TASK-memory-provision-wiring.md` (open)
- `TASK-memory-trust-modifier-wiring.md` (open)
- `TASK-chat-route-extraction.md` (open)
- `TASK-chat-context-feature-permissions.md` (open)
- `TASK-frontend-crafting-attempts-ui.md` (open)
- `TASK-frontend-crafting-orders-ui.md` (open)
- `TASK-frontend-crafting-recipes-ui.md` (open)
- `TASK-frontend-crafting-stations-ui.md` (open)
- `TASK-implement-crafting-ui.md` (open)

### New (from lint/merge review)

- TASK-epic-36-lint-fix-array-method-warnings — 59 warnings, 10 files
- TASK-epic-36-lint-cognitive-complexity-misc — complexity + misc warnings
- TASK-implement-memory-decay-logic — decay_rate/strength columns unused
- TASK-wire-memory-promotion-pipeline — ContextWindow.promotedToMemory empty
- TASK-wire-memory-provision-context — buildProvisionContext missing params
- TASK-wire-trust-modifier-to-relationships — trustModifier never set
- TASK-extract-chat-route-business-logic — chats.ts 785L, messages.ts 910L
- TASK-implement-ui-feature-permissions — no UI-level feature gating
- `TASK-complete-crafting-system-services.md` (open — summary stale: claims 6 services missing, but `StationsService` + `CraftingProcessService` shipped; remaining are ProfessionsService, QualityService, GatheringService, DiscoveryService)
- `TASK-implement-crafting-ui.md` (open — claim still accurate: no crafting UI exists)

### Postponed (Moderation)

- TASK-internal-external-flagging.md
- TASK-nsfw-gate-moderation-events.md
- TASK-user-block-ban-shadow.md

## Wiring & Resolution Plan (2026-08-08 audit)

Update (verified 2026-10-09): `RecipesService`, `StationsService`, `CraftingProcessService`, and
`CraftingOrderService` are built and wired — `src/routes/crafting/` (mounted in
`src/routes/v1/actors-surface.ts`) plus `src/routes/rpg/crafting-execution.ts` /
`crafting-stations.ts` / `crafting-station-instances.ts` (mounted in `src/routes/rpg/index.ts`).
`TASK-wire-crafting-routes` and `TASK-crafting-stations-execution` are Done. The remaining 4
services (professions, quality, gathering, discovery) stay tracked by
`TASK-complete-crafting-system-services` — whose summary still lists all 6 as missing — no new ticket needed.
