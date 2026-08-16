<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat location-change event log + section-linkage fixes

**Status:** ⬜ Draft
**Priority:** P2-B
**Effort:** Medium
**Epic:** epic-chat-transfer-location
**Related:** TASK-chat-sectioning-multi-location, TASK-chat-transfer-location, TASK-chat-backgrounds-location-sync

## Summary

Persist chat location changes as an append-only event log so travel history is
recoverable (enables future chat re-reads / going back in history), and fix the
correctness bugs that disconnect the two existing location-tracking mechanisms
(`chats.current_location_id` scalar vs `chat_sections` + `messages.section_id`).

## Why

Review of multi-location chat spanning surfaced:

1. **No history.** `createTransition()` builds a `ChatTransition` but it is only
   `log().info()`'d — never persisted. `current_location_id` is a lossy scalar
   (each change overwrites the last). No `from`/`to`/`triggering_message`/
   `timestamp` captured. Travel path cannot be reconstructed from DB state.
2. **Migration drops section linkage.** `carryHistory()` copies messages but
   omits `section_id` → carried messages insert with `NULL`. `carryLocation()`'s
   remap loop (`update messages set section_id=new where chat_id=new and
   section_id=old`) then matches zero rows — dead code. Sections are copied but
   no carried message points to them.
3. **Nondeterministic location match.** `handleSceneTransitions` uses
   `LIKE %name%` + `executeTakeFirst()` → multi-match picks an arbitrary first;
   unanchored substring can hit the wrong place.
4. **Auto-detection never touches sections.** On `location_change` the scalar
   updates but no `chat_sections` row is created and the triggering message's
   `section_id` is never set — the two mechanisms drift.

## Implementation Plan

### Step 1 — Migration: `chat_location_events`

Append-only, immutable event log. New migration `039_chat_location_events.ts`:

```ts
createTable("chat_location_events")
  .addColumn("id", "text", primaryKey)
  .addColumn("chat_id", "text", references chats.id onDelete cascade, notNull)
  .addColumn("section_id", "text", references chat_sections.id onDelete set null)
  .addColumn("from_location_id", "text", references locations.id onDelete set null)
  .addColumn("to_location_id", "text", references locations.id onDelete set null)
  .addColumn("triggering_message_id", "text", references messages.id onDelete set null)
  .addColumn("source", "text", notNull)        // auto | manual | migration
  .addColumn("created_at", "text", notNull default now)
```

Index on `(chat_id, created_at)` for ordered history replay.

### Step 2 — Regenerate DB schema artifacts

`bun run db:sync-types && bun run db:sync-manifest && bun run db:schemas:check`

### Step 3 — Event-log service

New `src/chat/service/location-events.ts` exporting `recordLocationChange(db, {...})`
that inserts a row. Used by both the auto-detection path and the manual setter.

### Step 4 — Fix `carryHistory` (section linkage)

Add `section_id: m.section_id` to the carried-message insert so the remap in
`carryLocation()` actually reaches carried messages.

### Step 5 — Fix `handleSceneTransitions` (`src/routes/messages/transitions.ts`)

- **Deterministic match**: exact name match first, then `LIKE`, world-scoped;
  if multiple `LIKE` hits → skip (ambiguous) rather than `executeTakeFirst`.
- **Persist**: on `location_change`, call `recordLocationChange` with
  `from_location_id` = previous `current_location_id`, `to_location_id` = new,
  `triggering_message_id` = the message just inserted, `source = "auto"`.
- **Connect sections**: create/append a `chat_sections` row for the new location
  (if not already the tail) and set the triggering message's `section_id`.
- **Atomicity**: run the scalar update + event insert + section assign inside a
  single transaction (the message insert itself stays where it is).

### Step 6 — Manual setter writes event log

`PUT /api/chats/:id/location` (`src/routes/chats/extras.ts`): on change, call
`recordLocationChange` with `source = "manual"`.

### Step 7 — Tests

- `location-events` unit test (insert + ordering + FK null-out).
- `carryHistory` carries `section_id`; `carryLocation` remap reaches carried
  messages (regression for the dead-code bug).
- `handleSceneTransitions` deterministic match (exact vs ambiguous `LIKE`).
- Event-log row written on auto + manual change.

## Acceptance Criteria

- [ ] `chat_location_events` table exists; `bun run db:schemas:check` green.
- [ ] Location change (auto + manual) writes an immutable event row.
- [ ] `carryHistory` + `carryLocation` preserve message→section linkage on
      migration (remap no longer dead code).
- [ ] Ambiguous location names are rejected, not silently first-matched.
- [ ] Unit tests cover event log, carry linkage, deterministic match.
- [ ] `bun run check` green.

## Out of Scope

- Chat re-read / history-navigation UI (this ticket only persists the data).
- Temporal snapshots of `location_states` (per-location dynamic state remains
  world-scoped, not time-travel).
- A formal location state machine (at-location / traveling / arrived).