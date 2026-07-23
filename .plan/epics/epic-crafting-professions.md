# EPIC-036: Crafting, Memory & Chat Systems

**Status:** 🟡 In Progress
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

- **RPG Mechanics** — Stats affect crafting success, quality, speed
- **Inventory System** — Material storage, crafted item management
- **Economy System** — Trading, market, currency
- **World & Locations** — Gathering nodes, crafting stations, event injection
- **Plugin System** — Disciplines/recipes extensibility
- **Memory System** — Decay, promotion, provision, trust
- **Prompt Assembly** — Memory/event injection into context

## Files

### Crafting

- `src/rpg/crafting/` — crafting system root
- `src/db/schema-crafting.ts` — crafting tables
- `src/db/enums-crafting.ts` — crafting enums
- `src/db/migrations/026_crafting_professions.ts` — migration
- `src/routes/crafting.ts` — crafting API

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

## Linked Tasks

### Done

- TASK-context-cut-memory-promotion ✅
- TASK-related-memory-event-injection-hooks ✅
- TASK-repetition-hallucination-guards ✅
- TASK-local-random-event-generator ✅
- TASK-character-memory-injection ✅
- TASK-character-memory-injection-privacy ✅
- TASK-memory-selection-ui ✅

### In Progress / Open

- TASK-crafting-professions.md
- TASK-rpg-crafting-professions.md
- TASK-crafting-system.md
- TASK-memory-decay-logic.md
- TASK-memory-promotion-pipeline.md
- TASK-memory-provision-wiring.md
- TASK-memory-trust-modifier-wiring.md
- TASK-chat-route-extraction.md
- TASK-chat-context-feature-permissions.md

### New (from lint/merge review)

- TASK-epic-36-lint-fix-array-method-warnings — 59 warnings, 10 files
- TASK-epic-36-lint-cognitive-complexity-misc — complexity + misc warnings
- TASK-implement-memory-decay-logic — decay_rate/strength columns unused
- TASK-wire-memory-promotion-pipeline — ContextWindow.promotedToMemory empty
- TASK-wire-memory-provision-context — buildProvisionContext missing params
- TASK-wire-trust-modifier-to-relationships — trustModifier never set
- TASK-extract-chat-route-business-logic — chats.ts 785L, messages.ts 910L
- TASK-implement-ui-feature-permissions — no UI-level feature gating
- TASK-complete-crafting-system-services — 6 services missing (professions, stations, quality, process, gathering, discovery)
- TASK-implement-crafting-ui — no crafting UI exists

### Postponed (Moderation)

- TASK-internal-external-flagging.md
- TASK-nsfw-gate-moderation-events.md
- TASK-user-block-ban-shadow.md
