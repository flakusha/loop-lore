<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Design: Memory Knowledge Isolation and World Timeline

**Status:** design (no code — IDEA ticket, Low priority / Large effort)  
**Ticket:** `IDEA-memory-knowledge-isolation-and-world-timeline`  
**Spec pointer:** `docs/spec/memory-system.md` → Future Extensions  
**Epic:** `epic-memory-knowledge-systems.md`
**Priority:** Low
**Effort:** Large
**Type:** Design
**Tags:** memory, isolation, timeline
**Overview:** Isolation domains (character-private / party-shared / world-public / GM-only) + schema sketch + timeline consistency for cross-session memory visibility — design stage, no code; tracked via IDEA-memory-knowledge-isolation-and-world-timeline.

## Problem

`src/memory/` provisions context by budget + trust with no isolation
boundary: characters in one world can leak knowledge through shared pools,
and multi-session worlds (`epic-multi-session`) propagate session A
discoveries into session B context without explicit sharing.

## Isolation domains

| Domain | Visibility | Enforcement point |
| --- | --- | --- |
| Character-private | that character's sessions only | provision filter |
| Party-shared | party/group members | explicit share flag |
| World-public | all sessions in the world | default lore/events |
| GM-only | shadow/whitenotes, hidden lore | never provisioned to players |

Default-deny cross-session transfer: a memory provisioned in session A is
invisible in session B unless its domain is party-shared/world-public or an
explicit share record exists.

## Schema sketch (future migration, append-only)

- `actor_memories`: add `domain` (text enum), `shared_with` (JSON array),
  `timeline_id` (nullable FK), `source_session_id`.
- `memory_shares` audit table: `(memory_id, from_session, to_session,
  granted_by, granted_at)` — every cross-session transfer leaves a row.

## Timeline consistency

- Order events by `(game_time, seq)` per world; game-time from
  `epic-time-scale.md`, not wall-clock.
- Conflict detection: contradictory event assertions on the same
  `(world, entity, attribute)` window flag the newer as `contested` — recent
  wins for recall, both retained for GM review.
- Merge strategy for multi-session worlds: union by event id, contested
  flags survive merges, GM resolves.

## Provisioning rule changes

1. `src/memory/provision` gains a domain filter before budget ranking.
2. GM-only rows are excluded from player provision at the query layer,
   not by post-filtering.
3. Cross-session recall requires a `memory_shares` row or a
   party/world-public domain.

## Test plan (when implemented)

- Isolation: session B provision contains zero character-private rows from
  session A without a share record.
- Audit: every cross-session transfer has exactly one `memory_shares` row.
- Timeline: out-of-order inserts still recall in game-time order;
  contradictory events flag contested, never silently drop.

## Rollout

1. Schema migration (new columns nullable; backfill existing rows to
   character-private) + domain filter in provision.
2. Share API + audit table.
3. Timeline ordering + conflict flags.
4. Docs + unit tests per phase (isolation boundaries, merge semantics).
