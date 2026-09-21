<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# World Specification - Extension Research & Implementation Plan

**Research Date:** 2026-09-21
**Status:** Analysis + one focused extension
**Source material:** `local://paste-1.md` ("World Specification - Extension Research", 752 lines)
**Authoritative source:** `src/` + `AGENTS.md` (per `docs/spec/worlds.md` §1)

---

## 1. TL;DR

The paste research proposes 4 phases of world-extension work for loop-lore.

| Phase | Theme | Status in repo |
|-------|-------|----------------|
| 1 | Compound weather, rule hierarchy, market zones, world state machine | Mostly covered by existing tickets |
| 2 | Factions, biomes, calendar/festivals, world influence | Factions covered; biomes/calendar not started |
| 3 | 2D world map (fog of war, minimap, location detail) | Covered by `FEAT-2d-world-*` series |
| 4 | Background simulation, procedural generation, cross-world, dynamic difficulty | Speculative / greenfield |

After auditing the existing schema and ticket backlog, **most of the paste's Phase 1-4 proposals overlap with already-open tickets or aspirational specs**. There is **one** net-new extension worth shipping today that is small, deterministic, and aligned with the chat-prompt injection path: **a lifecycle layer for `world_lore_entries` (confidence decay, last-verified timestamp, source count, distortion)**. Implementation lands in this worktree.

Everything else from the paste is **linked to its existing ticket or spec** so the work isn't duplicated.

---

## 2. Architecture fit

loop-lore is a **chat-first** RPG platform (per `AGENTS.md` Project Overview): every game mechanic either feeds the **prompt** (`src/assistant/prompt/sections/*`) or fires from a **message** (`src/regex`, `src/story/events`). World features that don't survive the audience/prompt path are dead weight.

The paste's Phase 1-4 split doesn't always respect that filter:

- **Layered weather / microclimates** - affects player mood and a few narrative adjectives, but loop-lore has no `combat`/`movement` system that the `comfort_rating`/`travel_speed_mod` could feed into. Without a weather-driven movement or combat layer, layered weather is decoration. Cut.
- **Rule hierarchy with versioning** - `WorldRules` (toggles like `p2p_trade`, `trade_tax`) are already in `worlds.rules` JSON. There's no UI to author per-location overrides and no engine that resolves overlapping rules. YAGNI; keep one tier.
- **Market zones / supply chains** - existing `trade_history` + `actor_currencies` tables cover recorded trade. No NPC vendor loop consumes supply-chain inputs. Speculative.
- **World state machine (Peaceful/War/Plague/...)** - overlaps `world_states` snapshot table + `TASK-world-state-management` (Exploration/Settlement/Wilderness/Dungeon/Special). Defer to that ticket.
- **Faction system** - already covered by `epic-faction-reputation` and `TASK-faction-standing-schema`, `TASK-faction-reputation`, `TASK-faction-politics-coups-and-expansion-engine`, `TASK-faction-leaders-and-cadre-generation`, `TASK-faction-relations-list-and-standing`, `TASK-rpg-faction-reputation`. Do not re-open.
- **Biome system** - no prior ticket, but `locations` table has no biome column and the codebase has no terrain-driven code path. Skip until a terrain-affecting feature lands.
- **Calendar / festivals** - `story_turns` has `turn_number`/`day`/`hour`; no first-class `WorldCalendar`. The `world_timeline_events` table is an event ledger, not a calendar. Skip.
- **Player world influence (WorldDeed, WorldLegacy)** - no prompting path uses deeds today; `actor_memories` already captures actor-scoped experience. Cut until lore entries need provenance.
- **Procedural world generation** - out of scope (no deterministic seed requirement in chat-first RP).
- **Background world simulation** - partial in `TASK-world-simulation-*` but the simulation is event-driven via `src/story/events/`, not tick-driven. Adding tick simulation is the opposite direction; defer.
- **Cross-world features** - current `world_members`, `world_invites`, and the `world_id` FK chain are sufficient for shareable worlds. WorldLink has no prompt effect.
- **Dynamic difficulty scaling** - `worlds.difficulty_modifier` + `difficulty_reroll` + `difficulty_state` already exist; consumers (combat/dice/loot) are separate. Skip.
- **2D world map view, fog of war, interactive elements** - fully covered by `FEAT-2d-world-*` ticket series. Skip duplication.
- **Inventory grid view / 2D combat view / minimap / facility list** - sub-features of the 2D world series. Skip.
- **World examination / social / environmental / exploration / NPC observation / party / quest commands** - out of scope; slash-command surface area, not spec extension.

**Net:** of the 11 paste categories, **9 are duplicates or speculative**. The one net-new slot - lore lifecycle - has no existing ticket and fills a real gap (verified-lore confidence is currently implicit).

---

## 3. Linked prior art

| Paste item | Existing ticket / spec |
|-----------|------------------------|
| Weather (paste 1.1) | TASK-weather-environment.md, epic-weather-environment.md, docs/spec/worlds.md 1.2 |
| Rule hierarchy (paste 1.2) | WorldRules on worlds.rules JSON; WorldChatRules in src/db/enums-gm.ts; no per-location override ticket - defer |
| Economy / market (paste 1.3) | actor_currencies, trade_history, TASK-trading-interface, TASK-economy-shared-loot-and-currency-split |
| Time (paste 1.4) | story_turns, chat_setup_templates.turn_strategy, docs/spec/worlds.md 1.3 |
| Lore lifecycle (paste 1.5) | **No existing ticket** - implemented in this worktree |
| World state machine (paste 2.1) | world_states snapshot table, TASK-world-state-management, TASK-story-world-state, TASK-world-event-system |
| Factions (paste 2.2) | epic-faction-reputation, TASK-faction-standing-schema, TASK-faction-reputation, TASK-faction-politics-coups-and-expansion-engine, TASK-faction-leaders-and-cadre-generation, TASK-faction-relations-list-and-standing, TASK-rpg-faction-reputation, FEAT-faction-system-backend (Done) |
| Biomes (paste 2.3) | None - out of scope |
| Calendar / festivals (paste 2.4) | world_timeline_events (event ledger), no calendar - defer |
| Procedural gen (paste 3.1) | FEAT-2d-world-seeded-procgen-stub-then-populate-location-sync (2D layer only) |
| Background simulation (paste 3.2) | TASK-world-simulation-npc-navigation-tick-driver, TASK-world-simulation-discovery-and-trade-events, TASK-world-simulation-timeline-driven-travel-patrol, TASK-world-time-sync-wait-and-chat-branch-merge |
| Player world influence (paste 3.3) | None - out of scope |
| Cross-world (paste 3.4) | world_members, world_invites; FEAT-shared-persistent-worlds-multiplayer-co-op-storytelling |
| Difficulty scaling (paste 3.5) | worlds.difficulty_modifier/difficulty_reroll/difficulty_state (already on 001_init) |
| 2D map view (paste 4) | FEAT-2d-world-* (8 tickets) + IDEA-2d-world-rag-business-process-mapping-spike |
| World examination / social / etc commands (paste 5) | Out of scope; slash-command surface area |

---

## 4. Extension implemented in this worktree

### 4.1 Lore lifecycle - world_lore_entries confidence / decay / distortion

**Why this, why now.** Every world event promoted into a lore entry (via `promoteEventToLore`, `src/story/events/promote-lore.ts`) starts equally "true". Today the `loreSection` (`src/assistant/prompt/sections/lore.ts`) has **no concept of source reliability or temporal decay** - a rumour promoted at world-day 0 is injected with the same weight as a fact verified at world-day 1000. The paste's `LoreLifecycle` interface (`confidence`, `distortion_level`, `last_verified`, `source_count`, `disputed`) is exactly the missing metadata.

**Scope (minimal).** Add five columns to `world_lore_entries`, a pure resolver in `src/assistant/lore/lifecycle.ts`, and a gate in `loreSection` that drops entries below a per-world confidence floor. No new tables.

```typescript
// src/assistant/lore/lifecycle.ts
interface LifecycleConfig {
  /** Drop entries below this confidence (0..100). Default 25. */
  min_confidence: number;
  /** Decay per world-day since last_verified. Default 0.5. */
  decay_per_day: number;
  /** Cap distortion; entries above become "disputed". Default 80. */
  distortion_cap: number;
}

function effectiveConfidence(
  row: { confidence: number; last_verified: string | null; distortion_level: number; },
  worldDaysSince: number,
  cfg: LifecycleConfig,
): number;
```

**Migration.** One new top-level `002_world_lore_lifecycle.ts` migration appending five columns to `world_lore_entries` with sensible defaults (`confidence = 100`, `distortion_level = 0`, `last_verified = NULL`).

**Prompt integration.** `loreSection` queries the new columns, calls `effectiveConfidence`, and filters `effectiveConfidence >= cfg.min_confidence` after the existing audience/cooldown/selective gates. World config lives on `worlds.rules` JSON (`lifecycle_config`); absent key -> defaults.

**Backward compatibility.** Existing rows: `confidence=100, distortion_level=0, last_verified=NULL` -> `effectiveConfidence = 100` (no decay since no `last_verified`). Behavior is identical to today unless a world opts in to `lifecycle_config`.

**Tests.** Pure unit tests on `effectiveConfidence` (decay math, distortion clamp, no-verified identity) plus a `loreSection` integration test that:
- drops an entry when `effectiveConfidence < min_confidence`,
- keeps an entry when `last_verified` is fresh,
- promotes a `distortion_level >= cap` entry into the `<disputed>` wrapper.

### 4.2 What we deliberately skipped

- `LorePropagation` (paste 1.5 channels / reach_limit) - no NPC gossip pipeline exists; would require `npc_states` extensions we don't have.
- `requires_presence` already in lore spec 3.4 - implemented, not re-doing.
- Source-count multi-source verification - `actor_lore_entries` could be that source but no join exists; defer.

---

## 5. Files touched in this worktree

| File | Change |
|------|--------|
| src/db/migrations/002_world_lore_lifecycle.ts | Append five columns to world_lore_entries |
| src/db/schema-story.ts | Regenerated (auto) - WorldLoreEntries gains five fields |
| src/db/column-types.ts | Map confidence/distortion_level to real, no enum needed |
| src/test-utils/insert-helpers.ts | Regenerated (auto) |
| src/validation/db-schemas.ts | Regenerated (auto) |
| src/assistant/lore/lifecycle.ts | effectiveConfidence, LifecycleConfig, defaults |
| src/assistant/lore/lifecycle.test.ts | Pure unit tests |
| src/assistant/prompt/sections/lore.ts | Query + filter by effectiveConfidence |
| src/assistant/prompt/sections/lore.test.ts | New integration tests for confidence gating |
| .plan/tickets/TASK-world-lore-lifecycle-confidence-decay.md | The ticket itself |
| docs/spec/lore.md | 1.1 row table + new 1.4 lifecycle section |

---

## 6. Verification plan

| Gate | Command |
|------|---------|
| Migration roundtrip | `bun test src/db/migration-roundtrip.test.ts` |
| Schema sync | `bun run db:sync-types && bun run db:sync-manifest` |
| Unit + lifecycle | `bun test src/assistant/lore/ src/assistant/prompt/sections/` |
| Coverage floor | `bun run test:coverage` then `bun run scripts/check/coverage.mjs --floor=80` |
| Full check | `bun run check` |

---

## 7. Out-of-scope forward references

- Layered weather / microclimate - needs a movement/combat consumer first.
- Calendar / festival system - needs a calendar authoring surface and an audience-tagged lore path.
- Biome system - needs a terrain-driven code path first.
- Tick-driven background simulation - orthogonal to the current event-driven `src/story/events/` pipeline.
- 2D map enhancements - fully covered by the existing `FEAT-2d-world-*` series; coordinate via the `epic-2d-world` epic rather than reopening here.

---

## 8. Open questions (carry forward)

1. Should `effectiveConfidence` be prompt-time only, or should a scheduled job actively decay entries? (Answer: prompt-time only for now - keeps the change in one file and one test.)
2. Should `last_verified` be auto-bumped when an event re-promotes the same `key`? (Answer: out of scope; would require a `key`-keyed upsert path that doesn't exist today.)
3. Do we expose `lifecycle_config` on the world admin UI? (Answer: out of scope - JSON column only, edit via existing `worlds.rules` route.)
