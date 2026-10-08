<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: GM/Assistant Story Whitenotes & Shadow Notes

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** DB, CRUD routes, GM panel, and prompt-section wiring all ship. `gmNotesSection` is registered in `src/assistant/prompt/registry.ts` and reads both tables, so notes do reach the LLM. Open: `trigger_condition`, `message_id`, and reveal narration.
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** gm, assistant, story, notes, steering, system-message, user-message

## Summary

Add GM/Assistant story whitenotes and shadow notes for system/user message LLM story steering. Whitenotes are visible context cues that guide the LLM's narrative direction. Shadow notes are hidden metadata that influence story generation without being exposed to players.

## Current State (2026-08-01)

- ✅ DB tables — `src/db/schema-gm.ts`
  - `whitenotes`: id, chat_id, type, content, priority, scope, expires_at, created_at, data_version, record_hash
  - `shadow_notes`: id, chat_id, type, content, status, visibility, expires_at, created_at, author_type, data_version, record_hash
- ✅ CRUD routes: `GET/POST /api/chats/:id/{whitenotes,shadow-notes}`, `DELETE .../:noteId`, `POST .../shadow-notes/:noteId/reveal` — `src/routes/gm-notes/` (mounted in `src/routes/v1/actors-surface.ts:92`, not `elysia-app.ts`)
- ✅ Frontend GM panel (whitenotes + shadow notes tabs, full CRUD) — `src/components/chat/gm-panel.html` + `src/frontend/alpine/gm-panel.ts`
- ✅ **Prompt injection** — `src/assistant/prompt/sections/gm-notes.ts` reads both tables (`fetchActiveWhitenotes`, unrevealed shadow notes, expiry filtered, `MAX_WHITENOTES`/`MAX_SHADOW_NOTES` caps) and is registered in `src/assistant/prompt/registry.ts` as `gmNotesSection`. Notes DO reach prompt assembly.
- ✅ `shadow_notes.visibility` — `ShadowNoteVisibility` enum + `shadowNotesStatusVisibility` state machine (`src/db/enums-gm.ts`)
- ✅ Route tests — `src/routes/gm-notes.test.ts`
- ❌ `shadow_notes.trigger_condition` column absent — the design's `trigger_condition` has no column; `status`/`visibility`/`expires_at`/`author_type` are the only behavioural fields
- ❌ Reveal does not emit a player-visible chat message (row update only)
- ❌ Design says `message_id`-attached whitenotes; implementation is chat-scoped (no `message_id` column)

## Design

### Whitenotes (Visible to LLM, Contextual)

Whitenotes are structured annotations attached to system/user messages that provide narrative context for the LLM. They are visible in the prompt assembly pipeline but not exposed to players in chat.

```typescript
interface Whitenote {
  id: string;
  message_id: string; // reference to the system/user message
  type: "narrative_direction" | "character_context" | "world_state" | "tone" | "pacing" | "theme";
  content: string; // the actual note text
  priority: number; // 1-10, higher = stronger influence
  scope: "scene" | "chapter" | "session" | "world";
  expires_after_turns: number; // auto-expire after N turns
}
```

### Shadow Notes (Hidden Metadata)

Shadow notes are hidden metadata that influence story generation without being exposed to players. They are stored separately from the chat message stream and injected into the LLM prompt assembly pipeline.

```typescript
interface ShadowNote {
  id: string;
  chat_id: string;
  type: "foreshadowing" | "consequence" | "hidden_fact" | "player_motivation" | "world_secret" | "narrative_hook";
  content: string;
  visibility: "gm_only" | "gm_and_assistant" | "conditional";
  trigger_condition: string; // when to activate this shadow note
  revealed: boolean; // whether the note has been revealed to players
  revealed_to: string[]; // player/character IDs that have seen this note
}
```

### Story Steering

Story steering uses whitenotes and shadow notes to guide the LLM's narrative direction:

1. **Pre-generation** — whitenotes are assembled into the prompt context before LLM call
2. **During generation** — shadow notes influence tone, pacing, and narrative direction
3. **Post-generation** — generated content is checked against shadow notes for consistency

## Tasks

- `TASK-gm-whitenotes.md` — GM whitenote system for story steering
- `TASK-gm-shadow-notes.md` — Shadow notes for hidden narrative influence

## Related

- `epic-chat-lifecycle-moderation.md` (ChatMode)
- `epic-assistant-generation-extensions.md`
- `epic-immersion-presentation.md`
- `epic-hidden-carriage-context.md`
- `src/generation/hooks/` — hook system for note injection
- `src/assistant/prompt/` — prompt assembly with note context

## Linked Tasks

- `TASK-gm-whitenotes.md`
- `TASK-gm-shadow-notes.md`
- `TASK-gm-trigger-and-timeline-backfill-propagation.md` — GM triggers fire and backfill the timeline via memory propagation
- `TASK-invisible-gm-only-quest-and-ark-system.md` — GM-only quests + ARK system integration
- `TASK-invisible-note-scope-global-local-temporal-random.md` — invisible-note scope (global/local/temporal/random)

## Docs-Gap Audit Remainders (2026-09-19)

- [ ] [gap-audit E8] Story-notes panel: 3-tab structure + role-access matrix (GM notes panel core done)

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| epic-chat-lifecycle-moderation.md (ChatMode) | chat + message lifecycle | whitenotes attach to messages; reveal emits messages |
| epic-assistant-generation-extensions.md | prompt assembly hooks | whitenotes + shadow notes injected pre-generation |
| epic-immersion-consistency-gate.md | `GateVerdict` | soft-refuse/obstacle narration integrates with note types |
| epic-narration-actor-separation.md | `MessageKind` | reveal emits a `kind: narration` message |
| src/generation/hooks/ | hook system for note injection | whitenotes assembled pre-generation |
| src/assistant/prompt/ | prompt assembly with note context | GM notes section in prompt template |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| epic-assistant-gm-flows.md | whitenotes + shadow notes | GM steering directives in prompt |
| epic-memory-propagation.md | whitenotes with memory scope | scope = world/session/chapter drives memory propagation |
| epic-immersion-presentation.md | revealed shadow notes | player-visible reveal events |
| epic-hidden-carriage-context.md | `{ system, visibility }` shadow isolation | carriage never ingests `gm_only` shadow content; shares the visibility contract |

### Dependencies

- `src/assistant/prompt/sections/gm-notes.ts` — the prompt section builder
- `src/assistant/prompt/registry.ts` — section registration
- `src/routes/v1/actors-surface.ts` — route mount
- `src/db/enums-gm.ts` — note types, visibility, and the status state machine

### Unticketed Gaps

- `shadow_notes.trigger_condition` — the design specifies per-note activation
  triggers; no column and no ticket.
- `whitenotes.message_id` — the design is message-scoped, the schema is
  chat-scoped; no ticket reconciles the two.
- Reveal narration: `gm.note.reveal` is declared as an emitted event in
  Cross-System Events but `reveal()` only updates the row — no emitter exists.
- `revealed_to` (per-player reveal tracking) from the design has no column.
- Story-notes panel 3-tab structure + role-access matrix ([gap-audit E8]).

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `Whitenote { id, messageId, type, content, priority, scope }` | memory, generation | narrative context |
| `ShadowNote { id, chatId, type, content, visibility, trigger, revealed }` | memory, presentation | hidden steering |

### Cross-System Events

|| Event | Direction | Purpose |
|| ----- | --------- | ------- |
|| `gm.note.reveal` | emits | player-visible narration (`kind: narration`) |
|| `gm.note.expired` | emits | scope TTL expiry |
