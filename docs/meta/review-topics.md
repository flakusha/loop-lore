# Topic & Feature Review

> **Purpose:** Review, extension, and clarification of docs/ and .plan/ for the 10 core topics.
> **Date:** 2026-07-27
> **Status:** Draft — awaiting team review

---

## 1. Characters

### Existing Coverage

| File                                                | Type   | Status                                                                                          |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `docs/spec/character-spec.md`                       | Spec   | ✅ Comprehensive — fields, NSFW, impersonation, format conversion, API design, validation modes |
| `docs/spec/character-spec.md`                      | Spec   | ⚠️ Superseded by character-spec.md but still referenced                                          |
| `docs/spec/actors.md`                               | Spec   | ✅ Actor data model, memories, notes, lorebooks, items, economics                               |
| `.plan/epics/epic-character-core-system.md`         | Epic   | ✅ Covers traits, personality integrity, mood, relationships, licensing, avatars                |
| `.plan/tickets/TASK-character-core-system.md`       | Ticket | ✅ Exists                                                                                       |
| `.plan/tickets/TASK-character-relationships.md`     | Ticket | ✅ Exists                                                                                       |
| `.plan/tickets/TASK-character-mood-happiness.md`    | Ticket | ✅ Exists                                                                                       |
| `.plan/tickets/TASK-character-multi-personality.md` | Ticket | ✅ Exists                                                                                       |
| `.plan/tickets/TASK-character-spec-unified-api.md`  | Ticket | ✅ Exists                                                                                       |

### Gaps & Issues

1. **`docs/spec/character-spec.md` is superseded but still linked** — The character-spec.md says it supersedes it, but `docs/spec/character-spec.md` still exists and is referenced from the epic's "References" section. Either delete it or update the reference.
2. **No spec for character-to-character interaction rules** — The character-spec.md defines impersonation rules but not interaction mechanics (how characters interact with each other in chat, relationship-based dialogue modifiers, etc.).
3. **Character review workflow is underspecified** — The spec defines draft/pending_review/approved/rejected/archived states but the review API endpoints are thin. No spec for review escalation or admin override workflows.
4. **No character migration spec** — The character-spec.md mentions migration but there's no `docs/spec/character-migration.md` with detailed migration paths between spec versions.
5. **Licensing is listed but not fully specified** — The epic covers CC0 and admin management, but there's no `docs/spec/licensing.md` with legal-grade license definitions and enforcement rules.

### Recommended Actions

- [x] Delete or archive `docs/spec/character-spec.md` (superseded by `character-spec.md`, file already deleted)` (superseded)
- [ ] Create `docs/spec/character-interactions.md` — interaction rules, relationship-based dialogue modifiers
- [x] Create `docs/spec/character-migration.md` (completed as Final)md` — detailed migration paths
- [x] Create `docs/spec/licensing.md` (completed as Final)md` — legal-grade license definitions
- [ ] Add review escalation workflow to `docs/spec/character-spec.md` §5.4

---

## 2. Characters' Interactions

### Existing Coverage

| File                                        | Type   | Status                                                                                 |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `docs/spec/actors.md`                       | Spec   | ✅ Final — relationship tiers, standing, and reputation defined              |
| `.plan/epics/epic-social-interaction.md`    | Epic   | ✅ Comprehensive — persuasion, intimidation, deception, barter, leadership, reputation |
| `.plan/tickets/TASK-social-interaction.md`  | Ticket | ✅ Exists                                                                              |
| `.plan/tickets/TASK-social-guild-system.md` | Ticket | ✅ Exists                                                                              |

### Gaps & Issues

1. `docs/spec/social-interaction.md` exists and is marked **Final** (was Draft).
- [ ] Reconcile character relationships (spec) with social interaction epic (plan)
- [ ] Add NPC-to-NPC interaction section to the social interaction spec
- [ ] Define relationship persistence rules in `docs/spec/actors.md`

---

## 3. NPCs

### Existing Coverage

| File                                  | Type    | Status                                                                           |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `docs/spec/actors.md`                 | Spec    | ✅ Final — NPC data model, behavior system, memory system defined                                          |
| `.plan/epics/epic-world-locations.md` | Epic    | ⚠️ Covers NPC placement/migration but NPCs are a sub-topic, not the primary focus |
| `.plan/tickets/TASK-npc-*.md`         | Tickets | ❌ No dedicated NPC tickets found                                                |

### Gaps & Issues

1. **No dedicated NPC spec** — NPCs are covered as a sub-topic in world-locations and actors.md, but there's no `docs/spec/npcs.md` that defines the NPC data model, behavior system, memory system, and interaction patterns specifically for NPCs.
2. **No NPC epic** — NPCs deserve their own epic (or at minimum a dedicated sub-section) given their importance to RPG gameplay.
3. **NPC behavior is underspecified** — The world-locations epic mentions NPC behavior patterns (aggressive, passive, territorial) but doesn't define the behavior state machine or how behaviors interact with world conditions.
4. **No NPC memory spec** — NPCs need to remember player interactions, but there's no dedicated spec for NPC memory lifecycle, decay, and sharing between NPCs.
5. **NPC inventory and trading** — Mentioned in world-locations but not specified as a standalone system.

### Recommended Actions

- [ ] Create `docs/spec/npcs.md` — NPC data model, behavior system, memory, interaction patterns
- [ ] Create `.plan/epics/epic-npcs.md` — dedicated NPC epic with phased implementation
- [ ] Create `.plan/tickets/TASK-npc-behavior.md` — NPC behavior state machine
- [ ] Create `.plan/tickets/TASK-npc-memory.md` — NPC memory system
- [ ] Create `.plan/tickets/TASK-npc-inventory.md` — NPC inventory and trading
- [ ] Add NPC section to `docs/spec/actors.md` (expand the "Draft" section into a full spec)

---

## 4. Worlds

### Existing Coverage

| File                                           | Type   | Status                                                     |
| ---------------------------------------------- | ------ | ---------------------------------------------------------- |
| `.plan/epics/epic-world-locations.md`          | Epic   | ⚠️ Very large (8 phases, ~100 interfaces) — needs splitting |
| `.plan/tickets/TASK-world-locations.md`        | Ticket | ✅ Exists                                                  |
| `.plan/tickets/TASK-world-event-system.md`     | Ticket | ✅ Exists                                                  |
| `.plan/tickets/TASK-world-state-management.md` | Ticket | ✅ Exists                                                  |
| `.plan/tickets/TASK-world-shaping-divine.md`   | Ticket | ✅ Exists                                                  |

### Gaps & Issues

1. **World-locations epic is too large** — The epic explicitly says "This epic is too large to ship in one pass" and proposes splitting into 4 sub-epics, but those sub-epics don't exist yet.
2. **No `docs/spec/worlds.md`** — There's no standalone world spec. World structure, conditions, style, and time tracking are defined only in the epic's design section.
3. **World persistence is not specified** — The epic mentions "persistent storage" as a feature but doesn't define the persistence model (what's saved, how often, how conflicts are resolved).
4. **World-time vs real-time is ambiguous** — The time tracking system defines multiple modes but doesn't specify which is the default or how they interact.
5. **No world spec for cross-world operations** — Characters can travel between worlds but the spec doesn't define what happens to world-specific data (traits, relationships, inventory) during cross-world travel.

### Recommended Actions

- [ ] Split `epic-world-locations.md` into 4 sub-epics (as the epic itself proposes):
  - `epic-world-travel-time.md` — conditions, weather, travel, random generation
  - `epic-world-npcs.md` — NPC placement, migration, inventories
  - `epic-world-encounters.md` — anomalies, resources, items, unique places
  - `epic-world-diplomacy-karma.md` — factions, reputation, karma, lore
- [ ] Create `docs/spec/worlds.md` — world data model, conditions, style, time
- [ ] Create `docs/spec/world-persistence.md` — persistence model, conflict resolution
- [ ] Define default time-tracking mode in world spec
- [ ] Add cross-world data rules to `docs/spec/actors.md`

---

## 5. Locations

### Existing Coverage

| File                                  | Type | Status                                    |
| ------------------------------------- | ---- | ----------------------------------------- |
| `.plan/epics/epic-world-locations.md` | Epic | ⚠️ Covered as sub-topic of world-locations |
| `docs/spec/world-locations.md`        | Spec | ❌ Does not exist                         |

### Gaps & Issues

1. **No dedicated location spec** — Locations are part of the world-locations epic but have no standalone spec. The location structure (type, conditions, anomalies, storage, connections) is defined only in the epic's design section.
2. **Location types are not enumerated** — The epic defines `dungeon`, `town`, `wilderness`, `special` as location types but doesn't enumerate all sub-types or define a location type taxonomy.
3. **Location-to-location connections** — The travel system defines connections but the spec doesn't define how connections are created, validated, or traversed.
4. **Location persistence** — Not specified independently from world persistence.

### Recommended Actions

- [ ] Create `docs/spec/locations.md` — location data model, types, connections, anomalies
- [ ] Define location type taxonomy in the location spec
- [ ] Add location-specific API design to the location spec
- [ ] Link location spec from the world spec and world-locations epic

---

## 6. Private and Public Chats

### Existing Coverage

| File                                              | Type         | Status                                               |
| ------------------------------------------------- | ------------ | ---------------------------------------------------- |
| `docs/spec/access-model-clarification.md`         | Spec         | ⚠️ Covers gallery access and chat access but is thin  |
| `docs/frontend/chat/overview.md`                  | Frontend doc | ⚠️ Has chat type definitions (direct/group/assistant) |
| `.plan/epics/epic-chat-lifecycle-moderation.md`   | Epic         | ✅ Exists                                            |
| `.plan/tickets/TASK-chat-lifecycle-moderation.md` | Ticket       | ✅ Exists                                            |

### Gaps & Issues

1. `docs/spec/chat-privacy.md` ✅ Final — privacy levels, access control, visibility rules defined** — The access-model-clarification.md covers ownership model and permission matrix but doesn't define what makes a chat "private" vs "public" in terms of data visibility, message persistence, and access control.
2. Chat visibility model coverage needs review** — The access model defines Master/GM/Member/Observer/Anonymous roles but doesn't cover all chat visibility scenarios (e.g., world-public chats, location-specific chats, private groups).
3. ✅ Resolved — chat privacy spec created** — Should there be a formal privacy level enum (public, private, world, location, group) with clear rules for each?
4. ⚠️ Message visibility rules still need detail in private vs public chats** — Not specified. Do private chat messages have different retention policies? Can public chat messages be exported differently?
5. **Cross-chat character visibility** — When a character is used in a private chat vs public chat, what are the visibility rules for character data (memories, relationships, inventory)?

### Recommended Actions

- [x] Create `docs/spec/chat-privacy.md` (completed as Final) — privacy levels, access control, visibility rules
- [x] Define `ChatPrivacy` enum (completed)
- [ ] Add privacy-level-specific message retention rules
- [ ] Add character data visibility rules per privacy level
- [ ] Expand `docs/spec/access-model-clarification.md` with chat-specific rules

---

## 7. Visual Novel

### Existing Coverage

| File                                             | Type         | Status                                                           |
| ------------------------------------------------ | ------------ | ---------------------------------------------------------------- |
| `docs/frontend/chat/visual-novel-mode.md`        | Frontend doc | ✅ Comprehensive — 3 layout modes, scene transitions, typewriter |
| `.plan/epics/epic-visual-novel-mode.md`          | Epic         | ✅ Covers dynamic generation + Q&A mode                          |
| `.plan/tickets/TASK-visual-novel-mode.md`        | Ticket       | ✅ Backend complete, frontend not started                        |
| `.plan/tickets/TASK-vn-branching-choices.md`     | Ticket       | ✅ Exists                                                        |
| `.plan/tickets/TASK-vn-dynamic-generation.md`    | Ticket       | ✅ Exists                                                        |
| `.plan/tickets/TASK-vn-qa-mode.md`               | Ticket       | ✅ Exists                                                        |
| `.plan/tickets/TASK-vn-template-actions.md`      | Ticket       | ✅ Exists                                                        |
| `.plan/tickets/TASK-vn-scene-template-system.md` | Ticket       | ✅ Exists                                                        |

### Gaps & Issues

1. **No `docs/spec/visual-novel.md`** — The frontend doc covers rendering but there's no spec for the VN data model, scene format, template system, or Q&A mechanics.
2. **VN backend is "complete" but thin** — The ticket says backend is complete (DB column + API pass-through) but the actual VN-specific backend logic (scene management, branching, Q&A state machine) is not implemented.
3. **Dynamic generation is not specified** — The VN epic mentions dynamic image/story generation but doesn't define the generation pipeline, prompt format, or caching strategy in a spec doc.
4. **Q&A mode is underspecified** — The VN epic defines the TypeScript interfaces but doesn't specify how Q&A integrates with the chat system, how answers affect story state, or how consequences are tracked across sessions.
5. **No VN asset spec** — VN mode needs background images, character portraits, and scene assets. There's no spec for how VN assets are stored, linked, and versioned.

### Recommended Actions

- [ ] Create `docs/spec/visual-novel.md` — VN data model, scene format, branching, Q&A mechanics
- [ ] Create `docs/spec/vn-assets.md` — VN asset storage, linking, versioning
- [ ] Create `docs/spec/vn-generation.md` — dynamic image/story generation pipeline
- [ ] Update `.plan/epics/epic-visual-novel-mode.md` to reference new spec docs
- [ ] Create `.plan/tickets/TASK-vn-scene-management.md` — backend scene management
- [ ] Create `.plan/tickets/TASK-vn-qa-state.md` — Q&A state machine and consequence tracking

---

## 8. Battle Mode

### Existing Coverage

| File                                                     | Type   | Status                                                         |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `.plan/epics/epic-battle-action-systems.md`              | Epic   | ⚠️ Very large — 6 phases, far-fetched features mixed with core  |
| `.plan/tickets/TASK-battle-action-systems.md`            | Ticket | ✅ Exists                                                      |
| `.plan/tickets/TASK-battle-arena-spectator.md`           | Ticket | ✅ Exists                                                      |
| `.plan/tickets/TASK-chat-battle-mode-switch.md`          | Ticket | ✅ Exists                                                      |
| `.plan/tickets/TASK-enemies-monsters-systems.md`         | Ticket | ✅ Exists                                                      |
| `.plan/tickets/TASK-battle-template-actions.md`          | Ticket | ✅ Exists                                                      |
| `.plan/tickets/TASK-battle-encounter-template-system.md` | Ticket | ✅ Exists                                                      |
| `docs/spec/rpg-mechanics.md`                             | Spec   | ✅ Has combat section (plugin RPG engine, dice, combat intent) |

### Gaps & Issues

1. **Battle action epic is too large** — Similar to world-locations, the epic mixes core battle mechanics with trading, inventory, spells, and far-fetched features (dynamic backgrounds, scene visualization). It needs splitting.
2. **No `docs/spec/battle.md`** — There's no standalone battle spec. Combat rules, turn structure, action resolution, and mode transitions are defined only in the epic's design section and in rpg-mechanics.md.
3. **Battle mode switching is not specified** — The `TASK-chat-battle-mode-switch.md` ticket exists but there's no spec for how battle mode interacts with normal chat mode, what state is preserved, and how transitions work.
4. **Far-fetched features dilute the epic** — Dynamic backgrounds and scene visualization are marked "far-fetched" but still occupy space in the epic. They should be in a separate epic or deferred.
5. **No spec for battle state persistence** — When a battle ends, what state is persisted? How are battle results recorded? How do they affect character progression?

### Recommended Actions

- [ ] Split `epic-battle-action-systems.md` into focused sub-epics:
  - `epic-battle-core.md` — turn-based mechanics, battle modes, actions
  - `epic-battle-ui.md` — reduced message size, state display, turn order
  - `epic-battle-utilities.md` — dice roller, stat calculator, initiative tracker
  - `epic-trading-inventory.md` — trading, inventory management, items transfer
  - `epic-spells-actions.md` — spell system, action system, cooldowns
  - `epic-skill-checks.md` — skill rolls, DC, modifiers
- [ ] Create `docs/spec/battle.md` — battle data model, turn structure, action resolution
- [ ] Create `docs/spec/battle-mode-switching.md` — mode transition rules, state preservation
- [ ] Remove far-fetched features from battle epic to a separate `epic-visual-novel-mode.md` (they belong there)
- [ ] Create `.plan/tickets/TASK-battle-state-persistence.md` — battle result storage

---

## 9. Inventory System

### Existing Coverage

| File                                           | Type    | Status                                                                    |
| ---------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `docs/spec/actors.md`                          | Spec    | ⚠️ Has `actor_items` table definition but no inventory system spec         |
| `.plan/epics/epic-item-system-extensions.md`   | Epic    | ✅ Covers durability, effects, stats drift, unique items, dupe protection |
| `.plan/tickets/TASK-item-system-extensions.md` | Ticket  | ✅ Has state machines for usable/collectable/consumable                   |
| `.plan/tickets/TASK-inventory*.md`             | Tickets | ❌ No dedicated inventory tickets found                                   |

### Gaps & Issues

1. **No `docs/spec/inventory.md`** — The actors.md defines the `actor_items` table but there's no standalone inventory spec covering inventory management, capacity limits, weight systems, organization, and UI.
2. **Inventory is mentioned in character-spec.md extensions** — The `CharacterExtensions` interface has an `inventory` field but it's a simple array, not a full inventory system with slots, weight, and capacity.
3. **No inventory management tickets** — The item system extensions ticket covers item states but not inventory management (organizing, sorting, filtering, comparing items).
4. **Weight/encumbrance is not specified** — The rpg-mechanics.md mentions inventory weight in the prompt assembly section but doesn't define a weight/encumbrance system.
5. **Inventory persistence is unclear** — When a character moves between worlds/locations, what inventory items travel with them? Are there location-bound items?

### Recommended Actions

- [ ] Create `docs/spec/inventory.md` — inventory data model, capacity, weight, organization
- [ ] Create `.plan/epics/epic-inventory.md` — dedicated inventory epic
- [ ] Create `.plan/tickets/TASK-inventory-management.md` — inventory UI and management
- [ ] Create `.plan/tickets/TASK-inventory-weight.md` — weight/encumbrance system
- [ ] Create `.plan/tickets/TASK-inventory-persistence.md` — inventory persistence across worlds
- [ ] Update `docs/spec/actors.md` to reference `docs/spec/inventory.md`

---

## 10. Items' System (Usable, Consumable, etc.)

### Existing Coverage

| File                                           | Type   | Status                                                                                   |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `.plan/tickets/TASK-item-system-extensions.md` | Ticket | ✅ Has state machines for ItemUseState, ItemCollectState, ItemConsumeState               |
| `.plan/epics/epic-item-system-extensions.md`   | Epic   | ✅ Covers durability, effects, stats drift, unique items, dupe protection, OP management |
| `docs/spec/actors.md`                          | Spec   | ⚠️ Has `actor_items` table with item types                                                |
| `docs/spec/rpg-mechanics.md`                   | Spec   | ⚠️ Has item transfer tools and trade validation                                           |

### Gaps & Issues

1. **Item type taxonomy is incomplete** — The ticket defines `ItemUseState` (available, equipped, consumed, depleted) and `ItemCollectState` (unowned, owned, traded, lost) but doesn't define the full item type taxonomy. What distinguishes a "usable" from "consumable" from "equippable" vs "tradeable" vs "quest"?
2. **No `docs/spec/items.md`** — There's no standalone item spec. Item types, properties, rarity, economics, and crafting are scattered across rpg-mechanics.md and the item system extensions epic.
3. **Item properties are not specified** — The actor_items table has `item_type`, `metadata`, `equipped` but doesn't define a property system (damage, defense, value, weight, rarity, effects).
4. **Usable vs consumable distinction is not clear** — The state machines define the states but not what makes an item "usable" (can be used once per encounter?) vs "consumable" (consumed on use) vs "equippable" (can be equipped/unequipped).
5. **No item crafting spec** — The RPG mechanics epic mentions crafting but there's no spec for item crafting recipes, requirements, and outcomes.
6. **Item rarity system is mentioned but not specified** — The epic mentions common/uncommon/rare/epic/legendary but doesn't define the rarity system (stat ranges, drop rates, value multipliers).

### Recommended Actions

- [ ] Create `docs/spec/items.md` — item type taxonomy, properties, rarity, crafting, economics
- [ ] Create `.plan/epics/epic-items.md` — dedicated items epic (separate from extensions)
- [ ] Create `.plan/tickets/TASK-item-types.md` — item type taxonomy (usable, consumable, equippable, tradeable, quest, etc.)
- [ ] Create `.plan/tickets/TASK-item-crafting.md` — crafting system
- [ ] Create `.plan/tickets/TASK-item-rarity.md` — rarity system
- [ ] Create `.plan/tickets/TASK-item-properties.md` — item property system (damage, defense, value, weight, etc.)
- [ ] Update `TASK-item-system-extensions.md` to reference the new item type taxonomy spec
- [ ] Define clear distinction between usable/consumable/equippable in the item spec

---

## 11. Attachments & Media Pipeline

### Existing Coverage

| File                                      | Type         | Status                                                                               |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `docs/spec/assets.md`                     | Spec         | ✅ Upload & processing pipeline (6 steps), polymorphic linking, compression strategy |
| `src/assets/service.ts`                   | Code         | ✅ Asset CRUD, local storage, metadata extraction                                    |
| `src/assets/metadata.ts`                  | Code         | ✅ PNG/JPEG/WebP/GIF header parsing (zero deps)                                      |
| `src/assets/controller.ts`                | Code         | ✅ Upload, serve, link endpoints                                                     |
| `src/assistant/commands/caption.ts`       | Code         | ✅ `/caption` slash command — LLM-based image captioning                             |
| `src/generation/caption-route.ts`         | Code         | ✅ `handleImageCaption()` — caption via vision model                                 |
| `src/generation/hooks/nsfw-hook.ts`       | Code         | ⚠️ Text-only NSFW detection (keyword-based)                                           |
| `src/generation/hooks/moderation-hook.ts` | Code         | ⚠️ Text-only moderation flags (keyword-based)                                         |
| `src/chat/pruning.ts`                     | Code         | ✅ `hasAttachment` flag in retention scoring                                         |
| `src/routes/messages.ts`                  | Code         | ✅ `enrichAttachments()` — resolves asset IDs to full metadata                       |
| `docs/frontend/gallery.md`                | Frontend doc | ✅ Gallery UI spec                                                                   |

### Gaps & Issues

1. **Content analysis pipeline does not exist** — `docs/spec/assets.md` defines steps 1-6 (upload → validate → store → compress → DB write → response) but step 4 is compression only. There is no step for **content analysis**: auto-captioning, image moderation, or review queue integration. The `/caption` command exists but requires manual invocation — it is not triggered by the upload pipeline.

2. **Image moderation is absent** — `NsfwHook` and `ModerationHook` scan text content only. No image-level NSFW detection, violence/gore detection, or PII detection exists. The hooks infrastructure (`src/generation/hooks/`) supports new hook types but no image analysis hook has been implemented.

3. **No review/automoderation queue** — Flagged content has no persistence layer or admin UI. The `ModerationAction` type in `src/chat/moderation.ts` supports `flag` actions but there is no queue, no review interface, and no approve/reject workflow.

4. **Captioning is manual only** — The `/caption` command works but requires user invocation. There is no auto-caption-on-upload, no batch captioning for existing images, and no configurable auto-caption policy per chat or world.

5. **Metadata extraction is limited** — `metadata.ts` reads dimensions and embedded captions (PNG tEXt, JPEG COM) but does not extract EXIF data (GPS, camera, timestamps), ICC color profiles, or video/audio metadata (duration, codec, bitrate). No image hashing for deduplication.

6. **No thumbnail generation in code** — The spec (line 86) defines "256px thumbnail WebP" as a processing step, but no code generates thumbnails. The `AssetRecord` has `width`/`height` but no `thumbnail_path` field.

7. **No attachment generation integration** — Image generation (`image-gen-route.ts`) and image edit (`image-edit-service.ts`) exist but are not wired to chat upload flow. No "generate and attach" or "edit attached image" automation.

8. **Frontend attachment UI is incomplete** — Upload works but no drag-and-drop zone, no batch upload, no inline editing, no image comparison view, no attachment search/filter.

### Recommended Actions

- [ ] Extend `docs/spec/assets.md` pipeline with **step 4b: content analysis** — auto-caption, image moderation, review queue hook
- [ ] Create `docs/spec/attachment-moderation.md` — review queue, approve/reject workflow, per-chat policies
- [ ] Add `ImageModerationHook` to `src/generation/hooks/` — visual content analysis (NSFW, violence, PII)
- [ ] Wire auto-caption to upload pipeline — configurable per chat/world, not global default
- [ ] Extend `metadata.ts` — EXIF extraction, image hashing, thumbnail generation
- [ ] Add `thumbnail_path` column to `assets` table via migration
- [ ] Create review queue admin UI — flagged attachments with approve/reject actions
- [ ] Wire image generation to chat — "generate image" button, auto-attach to message

### Spec ↔ Code Alignment

| Concern          | Spec                     | Code                                 | Gap                                        |
| ---------------- | ------------------------ | ------------------------------------ | ------------------------------------------ |
| Upload pipeline  | ✅ `assets.md` steps 1-6 | ✅ `service.ts` + `controller.ts`    | Steps 4-5 (compress/thumbnail) not in code |
| Content analysis | ❌ Not in spec           | ⚠️ `/caption` exists, hooks exist     | **No pipeline integration**                |
| Image moderation | ❌ Not in spec           | ⚠️ Text-only hooks                    | **No image analysis**                      |
| Review queue     | ❌ Not in spec           | ❌ None                              | **Entirely missing**                       |
| Auto-caption     | ❌ Not in spec           | ⚠️ Manual `/caption`                  | **No automation**                          |
| Metadata         | ✅ `assets.md` (basic)   | ✅ `metadata.ts` (PNG/JPEG/WebP/GIF) | Limited — no EXIF, no hashing              |
| Thumbnails       | ✅ `assets.md` line 86   | ❌ No code                           | **Missing implementation**                 |
| Frontend UI      | ✅ `gallery.md`          | ⚠️ Partial                            | Missing drag-drop, batch, search           |

## 12. Quests, Random Encounters & Factions

### Existing Coverage

| File                                     | Type | Status                                                 |
| ---------------------------------------- | ---- | ------------------------------------------------------ |
| `docs/spec/quests-encounters.md`         | Spec | ✅ NEW — Full data model, schema, implementation notes |
| `.plan/epics/epic-faction-reputation.md` | Epic | ⬜ High-level only — references new spec               |
| `docs/spec/npcs.md`                      | Spec | ✅ NPC types include `quest_giver`, `faction_leader`   |
| `docs/spec/locations.md`                 | Spec | ⚠️ Location anomalies exist but no encounter tables     |
| `docs/spec/worlds.md`                    | Spec | ⚠️ World rules exist but no RPG opt-in config           |
| `docs/spec/rpg-mechanics.md`             | Spec | ⚠️ Aspirational — no code, no quests/encounters         |
| `docs/spec/social-interaction.md`        | Spec | ⚠️ Social mechanics but no faction integration          |
| `src/` code                              | Code | ❌ No quest, encounter, or faction code exists         |

### Spec ↔ Code Alignment

| Concern                 | Spec                                 | Code                      | Gap                  |
| ----------------------- | ------------------------------------ | ------------------------- | -------------------- |
| Quest system            | ✅ `quests-encounters.md` full model | ❌ None                   | **Entirely missing** |
| Random encounters       | ✅ `quests-encounters.md` full model | ❌ None                   | **Entirely missing** |
| Faction structure       | ✅ `quests-encounters.md` full model | ❌ None                   | **Entirely missing** |
| Hero/villain roles      | ✅ `quests-encounters.md` §3.3       | ❌ None                   | **Entirely missing** |
| Faction relations       | ✅ `quests-encounters.md` §3.4       | ❌ None                   | **Entirely missing** |
| Player faction standing | ✅ `quests-encounters.md` §4.2       | ❌ None                   | **Entirely missing** |
| Opt-in config           | ✅ `quests-encounters.md` §4.2       | ❌ None                   | **Entirely missing** |
| NPC quest givers        | ✅ `npcs.md` §1.1                    | ❌ None                   | **Entirely missing** |
| Encounter tables        | ✅ `quests-encounters.md` §2.1       | ⚠️ Location anomalies only | No weighted tables   |
| Quest/NPC gating        | ✅ `quests-encounters.md` §1.7       | ❌ None                   | **Entirely missing** |

### Recommended Actions

- [ ] Implement `src/quests/` — quest service, objectives, chains, rewards
- [ ] Implement `src/encounters/` — encounter tables, generator, log
- [ ] Implement `src/factions/` — faction service, relations, standings
- [ ] Add world RPG config columns to `worlds` table
- [ ] Add location RPG config columns to `locations` table
- [ ] Wire quest/encounter context into prompt injection
- [ ] Create `src/routes/quests.ts`, `src/routes/encounters.ts`, `src/routes/factions.ts`
- [ ] Add faction member roles to NPC system

## Cross-Cutting Issues

### 1. Spec/Plan Alignment

| Issue                                        | Details                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Epics reference specs that don't exist**   | Several epics reference `docs/spec/` files that haven't been created yet (npcs.md, inventory.md, battle.md, chat-privacy.md) |
| **Specs exist but have no linked epic**      | `docs/spec/rpg-mechanics.md` exists but has no matching epic in `.plan/epics/`                                               |
| **Tickets exist with no linked epic**        | Several tickets have no linked epic file or reference epics that don't exist                                                 |
| **Epics reference tickets that don't exist** | Some epics list linked tasks that have no corresponding ticket files                                                         |

### 2. Overlapping Scope

| Overlap                              | Between                                              | Recommendation                                                                                     |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| World-locations vs RPG Mechanics     | Both define location-based systems, resource systems | World-locations owns location data; RPG Mechanics owns resource extraction mechanics               |
| Battle vs RPG Mechanics              | Both define combat, stats, skills                    | RPG Mechanics owns stat systems; Battle owns combat flow and UI                                    |
| Social Interaction vs Character Core | Both define relationships                            | Character Core owns relationship data model; Social Interaction owns interaction mechanics         |
| Item System Extensions vs Inventory  | Both cover items                                     | Items spec owns item types/properties; Inventory spec owns inventory management                    |
| Assets vs Attachments                | Both cover media in chat                             | Assets owns storage/linking/compression; Attachments owns content analysis/moderation/review queue |
| VN Mode vs Assets                    | Both use background images and portraits             | VN owns scene rendering and transitions; Assets owns image storage and linking                     |

### 3. Missing Cross-References

- `docs/spec/character-spec.md` should reference `docs/spec/social-interaction.md` when created
- `docs/spec/actors.md` should reference `docs/spec/inventory.md` and `docs/spec/items.md`
- `docs/spec/rpg-mechanics.md` should reference `docs/spec/battle.md` and `docs/spec/items.md`
- `docs/spec/assets.md` should reference `docs/spec/attachment-moderation.md` when created
- `docs/frontend/gallery.md` should reference `docs/spec/assets.md` pipeline section
- `docs/spec/worlds.md` (to be created) should reference `docs/spec/locations.md` and `docs/spec/npcs.md`
- `docs/frontend/chat/visual-novel-mode.md` should reference `docs/spec/visual-novel.md`

### 4. Stale References

- `docs/spec/character-spec.md` is superseded by `docs/spec/character-spec.md` — should be archived or deleted
- `docs/meta/plan.md` references epics that have been renamed or restructured
- Several `.plan/tickets/` files reference epics that don't exist or have been split

---

## Priority Recommendations

### Immediate (create missing specs)

1. `docs/spec/npcs.md` — NPCs have no dedicated spec
2. `docs/spec/inventory.md` — inventory has no dedicated spec
3. `docs/spec/items.md` — items have no dedicated spec
4. `docs/spec/chat-privacy.md` — chat privacy is only in a thin access-model doc
5. `docs/spec/attachment-moderation.md` — review queue, approve/reject workflow, per-chat policies
6. Extend `docs/spec/assets.md` pipeline with step 4b: content analysis (auto-caption, image moderation)
7. ✅ `docs/spec/quests-encounters.md` — quests, encounters, factions (just created)

### Short-term (split oversized epics)

1. `epic-world-locations.md` → 4 sub-epics (world-travel-time, world-npcs, world-encounters, world-diplomacy)
2. `epic-battle-action-systems.md` → 5 sub-epics (battle-core, battle-ui, battle-utilities, trading-inventory, spells-actions)

### Medium-term (create missing epics and tickets)

1. `epic-npcs.md` — dedicated NPC epic
2. `epic-inventory.md` — dedicated inventory epic
3. `epic-items.md` — dedicated items epic (separate from extensions)
4. `epic-social-interaction.md` already exists — needs spec doc

### Long-term (reconciliation)

1. Archive `docs/spec/character-spec.md`
2. Reconcile all cross-references between specs and epics
3. Update `.plan/tickets/index.json` to reflect current state
4. Update `docs/meta/plan.md` to reflect current epic numbering
