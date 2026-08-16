<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Sectioning — Multi-Location Chat Spanning

**Status:** ⬜ Research Needed
**Priority:** Medium
**Effort:** High
**Related:** TASK-chat-backgrounds-location-sync, TASK-chat-transfer-location, TASK-travel-party-migration, TASK-transition-aux-llm-fallback

## Summary

Research and design chat sectioning — ability for one chat (or group chat) to span multiple locations with transitions. Currently a chat is bound to one world/location; users must create new chats when moving.

## Current Limitation

```
Current:  Chat → World → Location (single, static)
          Moving = new chat (loses context)

Needed:   Chat → World → Location(s) (multiple, sequential)
          Moving = section transition (keeps context)
```

## Problem Statement

- Characters in RPGs move between locations frequently
- Creating new chat per location breaks conversation continuity
- Group chats especially suffer — all members must be in same chat
- Location changes mid-conversation are common (combat → retreat → tavern)

## Research Areas

### 1. Chat Section Model

| Approach     | Description                                                    | Pros                     | Cons                                 |
| ------------ | -------------------------------------------------------------- | ------------------------ | ------------------------------------ |
| **Sections** | Chat has ordered sections, each tied to location               | Simple, clear boundaries | Rigid, requires explicit transitions |
| **Timeline** | Chat is continuous timeline with location metadata per message | Flexible, natural flow   | Complex query, no clear boundaries   |
| **Hybrid**   | Sections with timeline within each section                     | Best of both             | More complex schema                  |

**Recommendation:** Hybrid — sections for location grouping, timeline within sections.

### 2. Section Data Model

```typescript
interface ChatSection {
  id: string;
  chatId: string;
  locationId: string;
  worldId: string;
  order: number; // Position in chat
  title?: string; // "The Dark Forest", "Tavern"
  backgroundId?: string; // Section-specific background
  startedAt: Date;
  endedAt?: Date; // null = current section
  transitionType?: TransitionType; // How we arrived here
}

type TransitionType =
  | "walk" // Normal travel
  | "teleport" // Instant
  | "cutscene" // Narrative transition
  | "combat" // Forced move
  | "choice" // User selected
  | "narrative"; // Story-driven

interface ChatMessage {
  // ... existing fields
  sectionId: string; // Which section this message belongs to
}
```

### 3. Transition System

```
Location Change Detected
  ↓
Transition Event:
  ├── Old section → end timestamp
  ├── New section → create with location
  ├── Transition type + narrative
  └── Background change trigger
  ↓
UI Update:
  ├── Section divider (location change indicator)
  ├── Background crossfade
  ├── Character avatar update (if location affects appearance)
  └── Ambient sound change
```

### 4. Group Chat Complexity

| Scenario                             | Challenge                             |
| ------------------------------------ | ------------------------------------- |
| All members move together            | Simple — one section change           |
| Split party                          | Multiple sections per chat (parallel) |
| Member joins from different location | Section fork or merge                 |
| Combat scatter                       | Temporary section splits              |

**Recommendation:** Start with "all members move together" — simplest, covers 80% use case.

### 5. Context Preservation

| Context                     | Across Sections | Notes                                       |
| --------------------------- | --------------- | ------------------------------------------- |
| Conversation history        | ✅ Yes          | Full history accessible                     |
| Character relationships     | ✅ Yes          | Persistent                                  |
| Inventory/items             | ✅ Yes          | Carried between locations                   |
| Active quests               | ✅ Yes          | Quest state persists                        |
| NPC memories                | ⚠️ Partial       | NPCs remember meeting, not location details |
| Location-specific knowledge | ❌ No           | Each location has own context               |

## Tasks

### Phase 1: Research & Design

- [ ] Audit current chat schema (`src/db/schema-chats.ts`)
- [ ] Audit current location system (`src/routes/worlds.ts`)
- [ ] Research SillyTavern/RisuAI location handling
- [ ] Design section data model
- [ ] Design transition event system
- [ ] Design group chat section handling
- [ ] Write spec: `docs/spec/chat-sectioning.md`

### Phase 2: Schema & Migration

- [ ] Create `chat_sections` table
- [ ] Add `section_id` column to messages table
- [ ] Migration: create initial sections for existing chats
- [ ] Update chat CRUD to manage sections

### Phase 3: Section Management API

- [ ] `POST /api/chats/:id/sections` — create section
- [ ] `GET /api/chats/:id/sections` — list sections
- [ ] `PATCH /api/chats/:id/sections/:sectionId` — update section
- [ ] `POST /api/chats/:id/sections/:sectionId/end` — end section
- [ ] `POST /api/chats/:id/transfer` — move to new location (creates section)

### Phase 4: UI Components

- [ ] Section divider component (location change indicator)
- [ ] Section list panel (navigate between sections)
- [ ] Transfer dialog (select destination, transition type)
- [ ] Background sync (section → background)
- [ ] Section-aware infinite scroll (load by section)

### Phase 5: Integration

- [ ] Wire section creation to location change events
- [ ] Wire section transitions to background changes
- [ ] Wire section transitions to avatar/emotion changes
- [ ] Group chat: section sync for all members

## Files to Create

- `docs/spec/chat-sectioning.md` — specification
- `src/db/schema-sections.ts` — section tables
- `src/routes/chat-sections.ts` — section CRUD
- `src/frontend/section-manager.ts` — section state
- `src/components/section-divider.html` — UI component

## Files to Modify

- `src/db/schema-chats.ts` — add section support
- `src/db/schema-messages.ts` — add section_id
- `src/routes/chats.ts` — section-aware queries
- `src/routes/messages.ts` — section filtering
- `src/views/chat.html` — section UI
- `src/frontend/alpine/chat.ts` — section state

## Migration Considerations

| Existing Data       | Migration Strategy                                  |
| ------------------- | --------------------------------------------------- |
| Chats with messages | Create single section per chat, backfill section_id |
| Group chats         | Same — one section per chat                         |
| Chat exports        | Include section metadata                            |
| Archived chats      | Sections preserved, read-only                       |

## Risk

High — significant schema change, affects all message queries, group chat complexity, UI overhaul needed.

## Recommendation

Start with research phase — understand current schema constraints before committing to design. This task may reshape how chats work fundamentally.
