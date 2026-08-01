# TASK: GM/Assistant Story Whitenotes System

**Priority:** High
**Status:** 🟡 In Progress — Frontend Panel Complete, Backend Routes Pending
**Epic:** epic-gm-shadow-notes
**Tags:** gm, whitenotes, story-steering, narrative, assistant, system-message

## Description

Implement the GM/Assistant whitenote system for story steering. Whitenotes are structured annotations attached to system/user messages that provide narrative context for the LLM. They are visible in the prompt assembly pipeline but not exposed to players in chat.

## How It Extends Existing Work

Builds on the GM/Assistant Story Whitenotes & Shadow Notes epic. Adds the whitenote system on top of the existing prompt assembly pipeline and hook system.

## Current State (2026-08-01 review)

### Frontend: ✅ Complete

- GM panel sidebar (`src/components/chat/gm-panel.html`) with whitenotes tab
- Alpine.js component (`src/frontend/alpine/gm-panel.ts`) with full CRUD
- Add/delete operations wired to API
- Type selector (narrative_direction, character_context, world_state, tone, pacing, theme)
- Priority slider (1-10)
- Scope selector (scene, chapter, session, world)

### Backend: 🟡 Partial — DB + CRUD routes done, prompt injection missing

- ✅ `whitenotes` table (`src/db/schema-gm.ts`) — id, chat_id, type, content, priority, scope, expires_at, created_at
- ✅ API routes (`src/routes/gm-notes.ts`, mounted `elysia-app.ts:166`): `GET/POST /api/chats/:id/whitenotes`, `DELETE .../:noteId`
- ❌ Prompt injection — nothing in `src/assistant/prompt/` or `src/story/` reads whitenotes (zero consumers)
- ❌ Expiry — `expires_at` stored but never enforced during prompt assembly (no assembly to enforce in)
- ❌ No route tests (`gm-notes` endpoints untested)

## Acceptance Criteria

- [x] Whitenote data model (type, content, priority, scope, expiry)
- [ ] Whitenote creation API (GM/assistant can add whitenotes to messages)
- [ ] Whitenote assembly into prompt context before LLM call
- [ ] Whitenote expiry (auto-expire after N turns)
- [x] Whitenote types: narrative_direction, character_context, world_state, tone, pacing, theme
- [x] Whitenote priority system (higher priority = stronger LLM influence)
- [x] Whitenote scope (scene, chapter, session, world)
- [ ] `POST /api/chat/:id/whitenotes` — create a whitenote
- [ ] `GET /api/chat/:id/whitenotes` — list active whitenotes
- [ ] `DELETE /api/chat/:id/whitenotes/:id` — remove a whitenote
- [x] Frontend GM whitenote panel (add/edit/remove whitenotes)
- [ ] Frontend whitenote indicator (shows when whitenotes are active)
- [ ] Whitenote history log (track all whitenotes added/removed)

## Technical Notes

- Whitenotes stored in a new `whitenotes` table with chat_id and message_id references
- Assembly happens in `src/assistant/prompt/` during prompt context building
- Expiry is checked during prompt assembly (expired whitenotes are excluded)
- Integrates with the existing hook system (src/generation/hooks/) for pre-generation analysis
- Integrates with Chat Lifecycle & Moderation epic for prompt assembly
- Whitenotes are NOT sent to the LLM as visible chat messages — only assembled into prompt context
