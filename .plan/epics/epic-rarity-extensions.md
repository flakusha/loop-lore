# Epic: Rarity Extensions

**Status:** Draft\
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

- [ ] `rarity_multiplier` field added to `world_timeline_events` (migration — adds column, does not own `timeline_id`)
- [ ] Event rarity distribution algorithm in `src/story/events/`
- [ ] Unified rarity schema in `src/db/schema-core.ts`
- [ ] Rarity-based event probability in `src/story/events/promote-lore.ts`
- [ ] Documentation in `docs/spec/rarity.md` (updated)
- [ ] Unit tests for rarity-weighted event distribution

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
