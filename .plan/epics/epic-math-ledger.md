<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-MATH-LEDGER — Event-sourced projections

**Status:** 📝 Draft
**Priority:** medium
**Effort:** Large (event table + projection rebuild + tests)
**Type:** Architecture → Implementation
**Tags:** rpg, math, ledger, event-sourcing, projection, audit
**Overview:** Split state-change JSON columns on `interaction_logs` into proper event tables and add rebuildable projections for `character_relationships`, `character_stats`, and `inventory`.

Split state-change JSON columns on `interaction_logs` into proper
event tables and add rebuildable projections for `character_relationships`,
`character_stats`, and `inventory`.

## Why

Event sourcing is great for auditability. Today, `interaction_logs`
records `state_changes: TEXT` as a JSON blob and `RelationshipsService`
projects it into a single overwritable row on `character_relationships`.
This loses history and forces every consumer to trust the latest write.
A canonical rebuildable projection is the fix.

## Sub-systems

- `src/db/migrations/010_relationship_change_events.ts` — new event
  table: `id`, `chat_id`, `actor_id`, `target_id`, `delta` (numeric),
  `reason`, `seq`, `created_at`.
- `src/db/migrations/010_inventory_change_events.ts` — same shape for
  inventory deltas.
- `src/services/projections/relationships.ts` —
  `rebuild(chatId, atSeq?)` returning the canonical state.
- `src/services/projections/inventory.ts` — analogous.

## Acceptance criteria

- After `rebuild(chatId)`, `character_relationships` matches the
  current row content (round-trip parity).
- After `rebuild(chatId, atSeq = 5)` (where 5 events exist), the
  returned projection reflects only events up to sequence 5.
- Tests cover monotonic `seq` and out-of-order insertion (LWW by seq).
- The legacy `state_changes` column is read for back-compat during
  migration; new rows write to event tables.

## Out of scope

- Migrating historical JSON blobs into structured events (separate
  ticket; data back-fill is a one-shot migration task).


git issue: 16e69f5
