<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Rarity Extensions

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Boxes 2–6 implemented on `feat-rarity-extensions` (issue 46d76f4): shared scale + distribution roll + weighted selection in `src/story/events/rarity.ts`, rarity→priority promotion in `src/story/events/promote-lore.ts`, spec in `docs/spec/rarity.md`, tests in `rarity.test.ts` + `promote-lore.test.ts`. Box 3 deviation: `src/db/schema-core.ts` is GENERATED — the unified schema is delivered as the shared TS value-object module with rarity riding in events' `data` JSON; the schema-level column is box 1. Box 1 (`rarity_multiplier` migration on `world_timeline_events`) intentionally NOT done here — owned by `TASK-timeline-rarity-multiplier` (timeline family).\
**Priority:** High\
**Effort:** Medium\
**Type:** Feature Epic\
**Tags:** rarity, timeline, events, modifiers, distribution

## Overview

Extends the rarity system to support timeline-weighted rarity modifiers, event rarity distribution, and unified rarity across systems. Enables GMs to control event rarity by timeline and rarity tier, with cross-system integration for items, lore, and events.

## Key Features

- **Timeline-Weighted Rarity**
  - `timeline_id` modifier on rarity tiers
  - Example: "Golden Age" timeline boosts rare item drop rates
  - `rarity_multiplier` per timeline (0.5x - 2.0x)
- **Event Rarity Distribution**
  - Map rarity tiers to event probability
  - `manifest_probability` for future event steering
  - `occurred_at` timestamp for timeline event tracking
- **Unified Rarity System**
  - Single rarity scale across items, events, and lore
  - Cross-system rarity bonuses (e.g., rare items + rare events)

## Acceptance Criteria

- [ ] `rarity_multiplier` field added to `world_timeline_events` (migration — adds column, does not own `timeline_id`) — NOT here: owned by TASK-timeline-rarity-multiplier (timeline family)
- [x] Event rarity distribution algorithm in `src/story/events/` — `rollRarity` + `selectEventByRarity` in `src/story/events/rarity.ts` (rarity.test.ts)
- [x] Unified rarity schema in `src/db/schema-core.ts` — DEVIATION: schema-core is generated; satisfied by shared value-object `src/story/events/rarity.ts` re-using the loot scale (ItemRarity + RARITY_WEIGHTS); rarity rides in events' `data` JSON (see docs/spec/rarity.md)
- [x] Rarity-based event probability in `src/story/events/promote-lore.ts` — `event.data.rarity` → `EVENT_RARITY_PRIORITY` monotonic priority; absent/invalid → 0 (promote-lore.test.ts)
- [x] Documentation in `docs/spec/rarity.md` (updated) — scale, distribution, promotion mapping, selection, schema boundary
- [x] Unit tests for rarity-weighted event distribution — `src/story/events/rarity.test.ts` (15 tests) + rarity block in `promote-lore.test.ts` (3 tests)

## Dependencies

- `epic-lore-knowledge.md` (for lore-based rarity tiers — required upstream)

## Related Epics

- `epic-timeline-system.md` (indirect — reads `timeline_id` from events)
- `epic-memory-propagation.md` (indirect — uses propagation rules for rarity scope)

## Ownership

- **Owns**: `rarity_multiplier` per timeline, unified rarity scale across items/events/lore, event rarity distribution algorithm
- **Reads**: `world_timeline_events.timeline_id` (owned by Timeline System epic — does NOT modify this table)

---

_Notes: Builds upon existing `src/items/rarity.ts` and `docs/spec/items.md` rarity table. Timeline-weighted rarity is additive to base rarity. This is the terminal epic in the chain — no epics depend on this._
