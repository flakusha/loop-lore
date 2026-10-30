<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Rarity Specification

> **Status:** Event-side rarity implemented — a single shared scale, an
> event distribution roll, rarity-aware lore promotion, and a weighted
> selection primitive exist in `src/story/events/rarity.ts` with tests.
> The timeline `rarity_multiplier` column on `world_timeline_events` is
> NOT part of this module (see the boundary note below).

## Implemented

- **Single scale.** Events re-use the canonical loot rarity taxonomy —
  tiers and weights come from `src/rpg/loot/weights.ts` (`RARITY_WEIGHTS`
  over the `ItemRarity` enum). There is deliberately no second rarity
  vocabulary; `EventRarity` in `src/story/events/rarity.ts` is an alias.
- **Distribution roll.** `rollRarity({ rng, weights? })` returns a tier
  with probability proportional to the (possibly overridden) weight
  table. Randomness is injected — pass a seeded `mulberry32`
  (`src/autonomy/rng`) for reproducible rolls. Invalid weights
  (negative, non-finite, or an all-zero table) throw `TypeError`.
- **Rarity-aware promotion.** `promoteEventToLore`
  (`src/story/events/promote-lore.ts`) reads `event.data.rarity`, and a
  valid tier maps to a documented monotonic `world_lore_entries`
  priority via `EVENT_RARITY_PRIORITY` (common 0 → artifact 60). An
  absent or invalid rarity keeps the historic priority `0` — promotion
  never fails on an unknown tier.
- **Weighted selection.** `selectEventByRarity({ events, rng, weights?,
  rarityKey? })` picks one candidate with probability proportional to
  its rarity weight (the `effectiveWeight` pattern from rpg/loot).
  Candidates without a valid rarity ride at the common default weight,
  so rarity-less candidate sets are selected uniformly. This is a pure
  steering primitive: the extraction → validation → application
  pipeline still applies every validated event; callers that want
  rarity-weighted manifestation pick with this before applying.
- **Tests.** `src/story/events/rarity.test.ts` (scale mirroring,
  validation helpers, determinism, tier bounds, weight-order respect,
  custom overrides, throw paths, selection behavior) and the rarity
  block in `src/story/events/promote-lore.test.ts` (mapped priority,
  absent → 0, invalid → 0 without throw).

## Unified-schema boundary (deliberate deviation)

The epic's "unified rarity schema in `src/db/schema-core.ts`" box is
satisfied by the shared value-object module (`src/story/events/rarity.ts`)
plus rarity riding in the event's existing `data` JSON blob.
`src/db/schema-core.ts` is generated — it is never hand-edited, so no
schema column ships from this module. The schema-level
`rarity_multiplier` column on `world_timeline_events` is box 1 of
`epic-rarity-extensions` and is owned by
`TASK-timeline-rarity-multiplier` (timeline family); its migration will
consume this module's scale rather than redefine one.

## Epics

- `.plan/epics/epic-rarity-extensions.md`
- `.plan/tickets/TASK-rarity-extended-event-distribution.md`
