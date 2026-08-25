<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Lore Knowledge System

**Status:** Draft\
**Priority:** High\
**Effort:** Medium\
**Type:** Feature Epic\
**Tags:** lore, knowledge, propagation, timeline-specific, secrets

## Overview

Extends lore system to support timeline-specific knowledge propagation, secret lore with rarity-based access, and event-driven knowledge unlocking. Enables hidden world knowledge that reveals only through specific timeline events or character actions.

## Key Features

- **Timeline-Specific Lore**
  - Add `timeline_id` to `world_lore_entries` and `actor_lore_entries`
  - Lore entries that only exist in specific timeline branches
  - Timeline selection determines which lore is available
- **Lore Knowledge Secrets**
  - Secret lore entries with `reveal_condition` field
  - Reveal triggers: character actions, timeline events, rarity thresholds
  - Progressive revelation: secrets unlock layers of deeper lore
- **Rarity-Based Knowledge**
  - Rare lore entries only discoverable through rare events
  - Common lore available to all timelines
  - Lore quality tiers affect token budget allocation

## Acceptance Criteria

- [ ] `timeline_id` column added to lore tables (migration)
- [ ] `reveal_condition` field in lore entries schema
- [ ] Timeline-aware lore injection in `src/assistant/prompt/sections/lore.ts`
- [ ] Secret lore UI in `docs/frontend/worlds.md` (lorebook section)
- [ ] Rarity-weighted lore selection algorithm
- [ ] Unit tests for timeline-specific lore access

## Dependencies

- `epic-memory-propagation.md` (for knowledge propagation rules — required upstream)

## Dependents (downstream epics that build on this)

- `epic-rarity-extensions.md` (uses lore rarity tiers for event distribution)

## Related Epics

- `docs/spec/lore.md` (existing lore spec)
- `epic-memory-knowledge-systems.md`
- `epic-timeline-system.md` (indirect — provides timeline_id)

## Ownership

- **Owns**: `world_lore_entries.timeline_id`, `actor_lore_entries.timeline_id`, `reveal_condition` field, secret lore UI, rarity-weighted lore selection algorithm

---

_Notes: Builds upon existing lorebook system in `src/assistant/lore/` and `src/routes/actor-lore-entries.ts`. Secret lore UI reuses world detail page patterns. Reads `timeline_id` from Timeline System epic (indirect dependency)._

## Chat Audit 2026-08-25 — Related Findings

- **B2:** Hallucination guard validates vs static DB snapshot; no transient/dynamic world-object handling → false positives. See BUG-hallucination-guard-known-params-ignored.

_Source: chat functionality audit (loop-lore), 2026-08-25._
