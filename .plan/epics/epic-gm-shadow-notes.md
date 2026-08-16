<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: GM/Assistant Story Whitenotes & Shadow Notes

**Status:** 🟡 In Progress (2026-08-01 — frontend + DB + CRUD routes done; prompt injection pending)
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** gm, assistant, story, notes, steering, system-message, user-message

## Summary

Add GM/Assistant story whitenotes and shadow notes for system/user message LLM story steering. Whitenotes are visible context cues that guide the LLM's narrative direction. Shadow notes are hidden metadata that influence story generation without being exposed to players.

## Current State (2026-08-01)

- ✅ DB tables: `whitenotes` (id, chat_id, type, content, priority, scope, expires_at, created_at) + `shadow_notes` (id, chat_id, type, content, revealed, created_at) — `src/db/schema-gm.ts`
- ✅ CRUD routes: `GET/POST /api/chats/:id/{whitenotes,shadow-notes}`, `DELETE .../:noteId`, `POST .../shadow-notes/:noteId/reveal` — `src/routes/gm-notes.ts` (mounted `elysia-app.ts:166`)
- ✅ Frontend GM panel (whitenotes + shadow notes tabs, full CRUD) — `src/components/chat/gm-panel.html` + `src/frontend/alpine/gm-panel.ts`
- ❌ **Prompt injection** — zero consumers: nothing reads whitenotes/shadow_notes into prompt assembly (`src/assistant/prompt/`, `src/story/`) → notes have no narrative effect yet
- ❌ Shadow note trigger conditions / visibility columns absent (table has `revealed` only)
- ❌ Reveal does not emit player-visible chat message
- ❌ No route tests for gm-notes
- ❌ Epic design says `message_id`-attached whitenotes; implementation is chat-scoped (no message_id column)

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

- Epic Chat Lifecycle & Moderation (EPIC-036)
- Epic Assistant Generation Extensions (EPIC-42)
- Epic Immersion & Presentation (EPIC-048)
- `src/generation/hooks/` — hook system for note injection
- `src/assistant/prompt/` — prompt assembly with note context

## Linked Tasks

- TASK-gm-whitenotes.md
- TASK-gm-shadow-notes.md
