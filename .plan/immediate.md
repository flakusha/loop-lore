# Immediate Plan

> **Last updated:** 2026-07-31 — P0 all complete (NSFW moderation infra committed); P1 complete; P2 actionable now
> **Status:** P0 ✅ complete; P1 ✅ complete; P2 actionable now

---

## P0 — Critical Path (Blocking)

| Priority | Epic / Task                                                    | Key Deliverables                                                                                                                                                                  | Status                                                                    |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **P0**   | **Data Integrity Phase 1** — Config Guards & Backend Selection | • Reject `sqlite` when `INSTANCE_COUNT > 1`<br>• Warn on network filesystem WAL path<br>• Fix stale MySQL claim in `architecture.md`                                              | ✅ Complete — `src/config/load.ts`, tests passing                         |
| **P0**   | **NSFW Moderation Safety Infrastructure**                      | • NSFW enable/disable per chat/user/world<br>• Non-public audit log of NSFW gate decisions<br>• Consent state tracking (from Shared Schemas)<br>• Generation boundary integration | ✅ Complete — `src/nsfw/moderation-service.ts`, 14 endpoints, 3 DB tables |
| **P0**   | **Shared Schemas** — Reputation, Consent, NSFW Rating          | • Unified `ReputationScore` (Social, Faction, NSFW)<br>• Unified `ConsentState` (NSFW + Chat Lifecycle)<br>• `NSFWContentRating` runtime enforcement at generation boundary       | ✅ Complete — `src/schemas/` implemented                                  |

---

## P1 — High Priority (Post-P0)

| Priority | Epic / Task                                                           | Key Deliverables                                                                                                                                                                                                  | Status                                      |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **P1**   | **Memory Tiers Wiring** — Selection UI, Lorebook, Cross-Chat          | • Memory selection UI (pinning, mid-chat panel)<br>• Lorebook activation with cooldowns<br>• Cross-chat memory persistence across workspaces<br>• Full generation pipeline integration                            | ✅ Complete                                 |
| **P1**   | **NSFW Integration Gaps** — Housing, Weather, Social, Disease         | • Housing: private spaces → encounter modifiers<br>• Weather: mood/pheromone/location availability<br>• Social: shared reputation, skill prerequisites<br>• Disease: reproductive health, STD transmission        | ✅ Complete                                 |
| **P1**   | **Battle Integration Gaps** — Items, Social, NPC, Weather, Resolution | • Equipment stats → combat modifiers<br>• Social skills (intimidate/negotiate) in combat<br>• NPC personality-driven AI<br>• Weather/terrain environmental modifiers<br>• Unified dice resolution for all systems | ✅ Complete — `src/battle/` (54KB, 6 files) |
| **P1**   | **Data Integrity Phase 2** — `data_version` Optimistic Concurrency    | • `UPDATE ... WHERE data_version = ?` on high-contention tables<br>• `409 Conflict` on version mismatch<br>• Unit + integration tests                                                                             | ✅ Complete                                 |

> P1 complete as of 2026-07-30. All 4 items done.

---

## P1.5 — Accessibility (Next after P0/residual)

| Priority | Epic / Task                        | Key Deliverables                                                                                                                                                                      | Status       | Effort | Ticket |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ | ------ |
| **P1.5** | **Accessibility — remaining gaps** | • `focus-visible` CSS on all focusable elements<br>• Focus trap for modals<br>• Skip links<br>• Screen reader live regions<br>• Touch gesture library<br>• 44×44px mobile tap targets | 🟡 ~60% done | Medium | —      |

**Next action**: Create `src/frontend/a11y/` module — focus-manager, touch-gestures, screen-reader utils, responsive helpers. Then add `a11y.css` (focus-visible, reduced-motion, high-contrast). Then wire skip links and modal focus traps in existing HTML templates.

---

## P2 — Core Gameplay Systems (Next Work)

| Priority | Epic                 | Key Deliverables                                                                | Status         | Ticket(s)                                                                                                                                                                                                |
| -------- | -------------------- | ------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2**   | **RPG Mechanics**    | Dice engine, stat system, combat engine, XP/loot                                | ⬜ Not Started | [`TASK-rpg-mechanics-dice-stats.md`](TASK-rpg-mechanics-dice-stats.md), [`TASK-rpg-mechanics-combat.md`](TASK-rpg-mechanics-combat.md), [`TASK-rpg-mechanics-xp-loot.md`](TASK-rpg-mechanics-xp-loot.md) |
| **P2**   | **Character System** | Multi-personality switching, mood/happiness meter, memory injection probability | ⬜ Not Started | [`TASK-character-system-p2.md`](TASK-character-system-p2.md)                                                                                                                                             |
| **P2**   | **World Locations**  | Location discovery, travel time, world NPC integration                          | ⬜ Not Started | [`TASK-world-locations.md`](TASK-world-locations.md), [`TASK-exploration-discovery.md`](TASK-exploration-discovery.md)                                                                                   |

### P2 — Next Actions (Order of Work)

#### 1. RPG Mechanics — Dice Engine & Stat System (Start here)

Tickets: `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`

- [ ] Implement `src/rpg/dice.ts` — `rollDice(sides, count, modifier, advantage)` with crypto-grade entropy
- [ ] Implement `src/rpg/stats.ts` — six core stats (STR/DEX/CON/INT/WIS/CHA) with computed modifiers `floor((stat-10)/2)`
- [ ] Add `src/db/schema-rpg.ts` — dice roll history table
- [ ] Add `src/routes/rpg.ts` — TypeBox response schemas for roll/stat endpoints
- [ ] Unit tests for dice distributions, stat modifiers, advantage/disadvantage edge cases
- [ ] **Verification**: `bun run check && bun test src/rpg/`

#### 2. RPG Mechanics — Combat Engine

- [ ] Implement `src/rpg/combat.ts` — initiative, attack rolls, damage, AC
- [ ] Integrate with existing `src/battle/resolution.ts` for unified dice resolution
- [ ] Add combat round resolution with action economy (bonus actions, reactions, free actions)
- [ ] Unit tests for hit/miss, critical hits, initiative ties
- [ ] **Verification**: `bun run check && bun test src/rpg/`

#### 3. RPG Mechanics — XP Progression & Loot

- [ ] Implement `src/rpg/xp.ts` — XP tracking, level-up thresholds, stat scaling
- [ ] Implement `src/rpg/loot.ts` — rarity-weighted loot tables (common/uncommon/rare/legendary)
- [ ] Wire loot drops into combat resolution module
- [ ] Unit tests for XP thresholds, level-up stat increases, loot rarity distribution
- [ ] **Verification**: `bun run check && bun test src/rpg/`

#### 4. Character System — Multi-Personality

Ticket: `TASK-character-multi-personality.md`

- [ ] Implement `src/characters/personalities.ts` — personality CRUD + switching
- [ ] Implement `src/db/schema-personalities.ts` — personality tables
- [ ] Implement personality lock per world/chat context
- [ ] Implement random switching mechanism + stimulus-based triggers (events, mood, world state)
- [ ] Wire personality into character resolution pipeline (Layer 0)
- [ ] **Verification**: `bun run check && bun test src/characters/`

#### 5. Character System — Mood/Happiness

Ticket: `TASK-character-mood-happiness.md` — already In Progress (services + routes done, needs validation)

- [ ] Finalize `src/characters/mood.ts` — mood state, triggers, recovery
- [ ] Implement `MoodExpressionModifier` — expression calculation from mood level
- [ ] Integrate mood into character resolution (`resolveCharacterState`)
- [ ] Wire mood prompt injection into chat generation pipeline
- [ ] **Verification**: `bun run check && bun test src/characters/`

#### 6. Character System — Memory Injection

Ticket: `TASK-character-memory-injection.md` — already ✅ Done (privacy levels, comfort system functional)

- [ ] Verify completion — check `src/characters/memory-injection.ts` and `src/db/schema-memory-privacy.ts`
- [ ] Memory selection UI (`TASK-memory-selection-ui.md`) — mid-chat panel, pinning
- [ ] **Verification**: `bun run check`

#### 7. World & Locations

Ticket: `TASK-world-locations.md`

- [ ] Implement location discovery system
- [ ] Implement travel time between locations
- [ ] World NPC integration per location
- [ ] **Verification**: `bun run check`

---

## P3 — Advanced Features (Post-P2)

| Priority | Epic                    | Key Deliverables                               | Status         | Ticket(s)                                                                                                                                                                    |
| -------- | ----------------------- | ---------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P3**   | **Artifact System**     | Code/docs/datasets as assets                   | ⬜ Not Started | [`TASK-artifact-system.md`](TASK-artifact-system.md)                                                                                                                         |
| **P3**   | **Visual Novel Mode**   | Image + text overlay, transitions, typewriter  | ⬜ Not Started | [`TASK-visual-novel-mode.md`](TASK-visual-novel-mode.md), [`TASK-chat-visual-novel-mode.md`](TASK-chat-visual-novel-mode.md)                                                 |
| **P3**   | **Plugin Ecosystem**    | Plugin management API, marketplace, sandboxing | ⬜ Not Started | [`TASK-plugin-system.md`](TASK-plugin-system.md), [`TASK-plugin-management-api.md`](TASK-plugin-management-api.md), [`TASK-plugin-api-system.md`](TASK-plugin-api-system.md) |
| **P3**   | **Three-Tier Memory**   | Episodic/semantic/procedural memory tiers      | ⬜ Not Started | [`FEAT-memory-systems-three-tier.md`](FEAT-memory-systems-three-tier.md)                                                                                                     |
| **P3**   | **ComfyUI Integration** | Node discovery, workflow templates             | ⬜ Not Started | [`TASK-comfyui-node-discovery.md`](TASK-comfyui-node-discovery.md), [`FEAT-comfyui-plugin-workflow-templates.md`](FEAT-comfyui-plugin-workflow-templates.md)                 |
| **P3**   | **Provider Ecosystem**  | Anthropic/Ollama/Bedrock support               | ⬜ Not Started | [`FEAT-provider-plugin-ecosystem.md`](FEAT-provider-plugin-ecosystem.md)                                                                                                     |

### P3 — Next Actions (After P2 complete)

1. **Artifact System** (`TASK-artifact-system.md`): Create `src/assets/artifact-handler.ts` — code/doc/dataset asset linking. Build `src/routes/artifacts.ts` with TypeBox response schemas. Add artifact gallery UI component.
2. **Visual Novel Mode** (`TASK-visual-novel-mode.md`): Wire existing `src/story/` backend to new htmx/Alpine frontend. Implement image overlay component with transition effects. Add typewriter animation support.
3. **Plugin Ecosystem** (`TASK-plugin-system.md`): Implement plugin management API (`install/list/enable/disable`). Build marketplace UI. Add sandboxing layer for plugin execution.
4. **Three-Tier Memory** (`FEAT-memory-systems-three-tier.md`): Design episodic/semantic/procedural table schema. Implement retrieval pipeline with tier-aware weighting. Add memory type enum.
5. **ComfyUI Integration** (`TASK-comfyui-node-discovery.md`): Integrate ComfyUI node discovery and workflow template management.
6. **Provider Ecosystem** (`FEAT-provider-plugin-ecosystem.md`): Add Anthropic, Ollama, and Bedrock provider support alongside existing OpenAI-compatible provider.

---

## Milestone Gates

| Gate       | Trigger | Criteria                                                                                                                                                                                         |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gate A** | Post-P0 | ✅ All P0 items complete: Data Integrity Phase 1, NSFW moderation safety infra, Shared Schemas enforced                                                                                          |
| **Gate B** | Post-P1 | Import/Export + Admin functional with encryption; NSFW integrations complete; Battle integrations complete; Data Integrity Phase 2 complete; Memory tiers wired with UI + cross-chat persistence |
| **Gate C** | Post-P2 | Core RPG + Memory systems live; Character + World systems functional                                                                                                                             |
| **Gate D** | Post-P3 | Advanced features + plugin ecosystem operational                                                                                                                                                 |

---

## Notes

- **P0 items are blocking** — no safe multi-instance deployment without Data Integrity Phase 1; no NSFW content without moderation infrastructure; no cross-system data integrity without Shared Schemas
- **NSFW content is a competitive differentiator** — opt-in by default, but safety infrastructure must exist before mechanics
- **Cross-system integration gaps** (Battle, NSFW) are high-leverage — fixing them unblocks multiple downstream features
- **P2 starts with RPG Mechanics** — dice/stats is the foundation; combat depends on it; XP/loot depends on combat resolution
- **Character System tickets** — see `TASK-character-system-p2.md` for parent ticket; individual sub-tickets: `TASK-character-multi-personality.md`, `TASK-character-mood-happiness.md`, `TASK-character-memory-injection.md`
- **Reconciliation complete** — backlog/roadmap now reflect actual implementation state (see `backlog.md`)
