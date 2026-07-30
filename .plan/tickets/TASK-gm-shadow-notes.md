# TASK: GM/Assistant Shadow Notes System

**Priority:** High
**Status:** 🟡 In Progress — Frontend Panel Complete, Backend Routes Pending
**Epic:** epic-gm-shadow-notes
**Tags:** gm, shadow-notes, hidden-narrative, story-steering, assistant, metadata

## Description

Implement the GM/Assistant shadow notes system for hidden narrative influence. Shadow notes are hidden metadata that influence story generation without being exposed to players. They are stored separately from the chat message stream and injected into the LLM prompt assembly pipeline.

## How It Extends Existing Work

Builds on the GM/Assistant Story Whitenotes & Shadow Notes epic and the whitenotes system (TASK-gm-whitenotes.md). Adds hidden narrative influence on top of visible whitenotes.

## Current State (2026-07-31)

### Frontend: ✅ Complete

- GM panel sidebar (`src/components/chat/gm-panel.html`) with shadow notes tab
- Alpine.js component (`src/frontend/alpine/gm-panel.ts`) with full CRUD
- Add/delete/reveal operations wired to API
- Type selector (foreshadowing, consequence, hidden_fact, player_motivation, world_secret, narrative_hook)
- Revealed/unrevealed status display

### Backend: ❌ Not Started

- No `shadow_notes` DB table
- No API routes for shadow notes
- No prompt injection pipeline

## Acceptance Criteria

- [x] Shadow note data model (type, content, visibility, trigger condition, revealed state)
- [ ] Shadow note creation API (GM/assistant can add shadow notes)
- [ ] Shadow note injection into prompt assembly (hidden from player view)
- [ ] Shadow note reveal mechanic (conditional or GM-triggered reveals)
- [x] Shadow note types: foreshadowing, consequence, hidden_fact, player_motivation, world_secret, narrative_hook
- [ ] Shadow note trigger conditions (when to activate influence)
- [ ] Shadow note consistency checking (generated content should align with shadow notes)
- [ ] `POST /api/chat/:id/shadow-notes` — create a shadow note
- [ ] `GET /api/chat/:id/shadow-notes` — list shadow notes (GM only)
- [ ] `POST /api/chat/:id/shadow-notes/:id/reveal` — reveal a shadow note to players
- [x] Frontend GM shadow note panel (add/edit/remove/reveal shadow notes)
- [ ] Frontend shadow note indicator (shows when shadow notes are active, hidden from players)
- [ ] Shadow note consistency log (track when shadow notes influenced generation)

## Technical Notes

- Shadow notes stored in a new `shadow_notes` table with chat_id and visibility field
- Injection happens in `src/assistant/prompt/` during prompt context building (hidden from chat output)
- Reveal mechanic updates the `revealed` flag and optionally sends a chat message to players
- Consistency checking uses the existing hook system to verify generated content aligns with shadow notes
- Integrates with whitenotes system (TASK-gm-whitenotes.md) for combined narrative steering
- Integrates with Chat Lifecycle & Moderation epic for prompt assembly
- Shadow notes are NEVER sent to the LLM as visible chat messages — only assembled into prompt context
