# Chat Privacy Specification

**Status:** Final
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the privacy model for chats in loop-lore: what makes a chat private vs public, who can access what, and how chat data visibility is controlled. It also covers steering notes (admin/assistant/GM) and coordination chats (player-to-player discussion excluded from LLM context).

---

## 1. Chat Privacy Levels

Privacy controls **who can see messages**. It is orthogonal to purpose (what the chat is for) and context-inclusion (whether messages feed the LLM).

### 1.1 Privacy Enum

```typescript
enum ChatPrivacy {
  Public = "public", // Anyone can discover and join
  Private = "private", // Only invited participants
  World = "world", // Any user in the same world
  Location = "location", // Any user at the same location
  Group = "group", // A defined group of participants
}
```

### 1.2 Privacy Level Descriptions

| Level        | Discovery              | Join                     | Message Visibility                   |
| ------------ | ---------------------- | ------------------------ | ------------------------------------ |
| **Public**   | Anyone can find it     | Anyone can join          | Visible to all participants          |
| **Private**  | Only participants know | Invite only              | Visible to participants only         |
| **World**    | All users in the world | Any user in the world    | Visible to all world participants    |
| **Location** | Users at the location  | Any user at the location | Visible to all location participants |
| **Group**    | Group members know     | Group members only       | Visible to group members             |

---

## 2. Chat Purpose & Context-Inclusion

Purpose controls **what the chat is for** and **whether messages feed the LLM**. This is orthogonal to privacy — a coordination chat can be private, world-scoped, or group-scoped.

### 2.1 Purpose Enum

```typescript
enum ChatPurpose {
  Main = "main", // Primary story/roleplay chat — LLM context included
  Side = "side", // Side conversations — LLM context included
  Notes = "notes", // GM/admin notes — LLM context included (steering)
  Coordination = "coordination", // Player-to-player discussion — LLM context EXCLUDED
}
```

### 2.2 Purpose Descriptions

| Purpose          | LLM Context | Description                                                                   |
| ---------------- | ----------- | ----------------------------------------------------------------------------- |
| **Main**         | ✓ Included  | Primary story/roleplay chat. Messages feed into generation context.           |
| **Side**         | ✓ Included  | Side conversations, side-quests, character interactions. Included in context. |
| **Notes**        | ✓ Included  | GM/admin/assistant steering notes. Included in context for guidance.          |
| **Coordination** | ✗ Excluded  | Player-to-player discussion (strategy, OOC chat). Never feeds the LLM.        |

### 2.3 Cross-Dimension Examples

| Privacy × Purpose      | Example                                  |
| ---------------------- | ---------------------------------------- |
| Private × Main         | Two players roleplaying privately        |
| Private × Coordination | Two players planning strategy OOC        |
| World × Coordination   | All players in a world discussing OOC    |
| Group × Coordination   | A party planning their next move         |
| Group × Notes          | GM notes visible only to that party's GM |
| World × Notes          | GM notes visible to all GMs in the world |

---

## 3. Steering Notes (Admin / Assistant / GM)

Steering notes are messages that influence the LLM's behavior without being player-facing dialogue. They are stored as messages with a specific `MessageRole` and visibility rules.

### 3.1 Note Roles

```typescript
enum SteeringNoteRole {
  Admin = "admin", // Server admin notes — visible to admins only
  GM = "gm", // Game master notes — visible to GMs and admins
  Assistant = "assistant", // AI assistant internal notes — visible to admins
  System = "system", // System-generated notes — visible to admins
}
```

### 3.2 Note Visibility Matrix

| Note Role     | Admin | GM | Player | In Export | In LLM Context |
| ------------- | ----- | -- | ------ | --------- | -------------- |
| **Admin**     | ✓     | ✗  | ✗      | Optional  | ✓              |
| **GM**        | ✓     | ✓  | ✗      | Optional  | ✓              |
| **Assistant** | ✓     | ✗  | ✗      | Optional  | ✓              |
| **System**    | ✓     | ✗  | ✗      | Optional  | ✓              |

### 3.3 Note Storage

Notes are stored as regular messages with特殊 fields:

```typescript
interface SteeringNote {
  id: string;
  chat_id: string;
  role: SteeringNoteRole;
  content: string;
  visibility: "visible" | "hidden"; // visible to authorized roles, hidden from others
  pinned: boolean; // pinned notes appear at top of context
  category: NoteCategory; // general, world, character, story, combat, session
  author_id: string; // who created this note
  created_at: number;
  expires_at: number | null; // optional expiry (e.g., session notes expire after session)
}
```

### 3.4 Note Categories

```typescript
enum NoteCategory {
  General = "general", // General GM notes
  World = "world", // World-building notes
  Character = "character", // Character-specific notes
  Story = "story", // Story arc notes
  Combat = "combat", // Combat encounter notes
  Session = "session", // Session-specific notes (expire after session)
}
```

### 3.5 Prompt Injection for Notes

Notes are injected into the LLM context based on their role and category:

```
[GM Notes — Story Arc]
- The dark lord is actually the player's father
- Reveal this in Act 3

[GM Notes — Combat]
- Boss has 3 phases, each with different weaknesses
- Phase 2: use fire attacks

[Admin Notes — System]
- Rate limit active: 10 messages/minute
- Debug mode: verbose logging enabled
```

---

## 4. Coordination Chats

Coordination chats are player-to-player discussions that are **excluded from LLM context**. They use the same privacy levels as other chats but with `purpose = "coordination"`.

### 4.1 Behavior

- Messages are stored normally but flagged as `purpose = "coordination"`
- The generation pipeline skips coordination messages when building context
- Coordination chats can be used for:
  - OOC (out-of-character) discussion
  - Strategy planning
  - Meta-gaming discussion
  - Player coordination (scheduling, logistics)
  - Backstage/GM-only planning (if GM is a participant)

### 4.2 UI Treatment

- Coordination chats are visually distinct (different icon, muted color)
- They appear in a separate "Coordination" section in the chat list
- They do not trigger notification badges for story events
- They can be collapsed/hidden by default

### 4.3 Privacy Combinations

| Privacy  | Purpose      | Use Case                              |
| -------- | ------------ | ------------------------------------- |
| Private  | Coordination | Two players planning OOC              |
| Group    | Coordination | Party strategy discussion             |
| World    | Coordination | All players discussing OOC            |
| Location | Coordination | Players at same location coordinating |

---

## 5. Access Control

### 5.1 Permission Matrix

| Action                | Master | GM           | Member | Observer | Anonymous         |
| --------------------- | ------ | ------------ | ------ | -------- | ----------------- |
| Read messages         | ✓      | ✓            | ✓      | ✓        | ✗ (unless public) |
| Send messages         | ✓      | ✓            | ✓      | ✗        | ✗                 |
| Read steering notes   | ✓      | ✓ (GM notes) | ✗      | ✗        | ✗                 |
| Create steering notes | ✓      | ✓            | ✗      | ✗        | ✗                 |
| Manage participants   | ✓      | ✓            | ✗      | ✗        | ✗                 |
| Change settings       | ✓      | ✓            | ✗      | ✗        | ✗                 |
| Export chat           | ✓      | ✓            | ✓      | ✗        | ✗                 |
| Delete messages       | ✓      | ✓            | ✗      | ✗        | ✗                 |
| Moderate              | ✓      | ✓            | ✗      | ✗        | ✗                 |

### 5.2 Role Definitions

| Role          | Description                                      |
| ------------- | ------------------------------------------------ |
| **Master**    | Chat creator, full control                       |
| **GM**        | Game master, can influence chat flow             |
| **Member**    | Active participant                               |
| **Observer**  | Can read but not participate                     |
| **Anonymous** | Public chat visitors (read-only, no persistence) |

---

## 6. Message Visibility Rules

### 6.1 Public vs Private Messages

| Scenario                       | Message Visibility                         |
| ------------------------------ | ------------------------------------------ |
| Public chat, public message    | Visible to all participants                |
| Private chat, public message   | Visible to chat participants only          |
| Public chat, GM-only note      | Visible to GM only (not in export)         |
| Private chat, GM-only note     | Visible to GM only                         |
| World chat, location-specific  | Visible to users at that location          |
| Coordination chat, any message | Visible to participants, excluded from LLM |

### 6.2 Character Data Visibility

When a character participates in a chat, their visible data depends on the chat's privacy level:

| Data          | Public | Private | World | Location | Group |
| ------------- | ------ | ------- | ----- | -------- | ----- |
| Name          | ✓      | ✓       | ✓     | ✓        | ✓     |
| Description   | ✓      | ✓       | ✓     | ✓        | ✓     |
| Personality   | ✓      | ✓       | ✓     | ✓        | ✓     |
| Inventory     | ✗      | ✓       | ✓     | ✓        | ✓     |
| Relationships | ✗      | ✓       | ✓     | ✓        | ✓     |
| Memories      | ✗      | ✓       | ✓     | ✓        | ✓     |
| Stats         | ✗      | ✓       | ✓     | ✓        | ✓     |
| Location      | ✗      | ✓       | ✓     | ✓        | ✓     |

---

## 7. Chat Retention Policies

### 7.1 Retention by Privacy Level

| Privacy Level | Retention | Exportable | Deletable        |
| ------------- | --------- | ---------- | ---------------- |
| Public        | Permanent | ✓          | GM only          |
| Private       | Permanent | ✓          | Master + GM      |
| World         | Permanent | ✓          | GM + World Owner |
| Location      | Permanent | ✓          | GM + World Owner |
| Group         | Permanent | ✓          | Master + GM      |

### 7.2 Anonymous Chat Handling

- Anonymous messages in public chats are stored but marked as `actor_type = 'anonymous'`
- Anonymous messages have no persistent identity — they cannot be looked up later
- After session end, anonymous messages persist but cannot be attributed to a specific user

---

## 8. Database Schema

### chats table additions

```sql
-- Add privacy column
ALTER TABLE chats ADD COLUMN privacy TEXT NOT NULL DEFAULT 'private';
-- Values: 'public', 'private', 'world', 'location', 'group'

-- Add purpose column
ALTER TABLE chats ADD COLUMN purpose TEXT NOT NULL DEFAULT 'main';
-- Values: 'main', 'side', 'notes', 'coordination'
```

### chat_participants table additions

```sql
-- Add role column
ALTER TABLE chat_participants ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
-- Values: 'master', 'gm', 'member', 'observer', 'anonymous'

-- Add joined_at timestamp
ALTER TABLE chat_participants ADD COLUMN joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add left_at timestamp (NULL = still in chat)
ALTER TABLE chat_participants ADD COLUMN left_at DATETIME;
```

### steering_notes table (new)

```sql
CREATE TABLE steering_notes (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  role TEXT NOT NULL, -- 'admin', 'gm', 'assistant', 'system'
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'visible', -- 'visible', 'hidden'
  pinned INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  author_id TEXT NOT NULL,
  expires_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_steering_notes_chat ON steering_notes(chat_id);
CREATE INDEX idx_steering_notes_role ON steering_notes(role);
```

---

## 9. API Design

### Chat Creation

```typescript
interface ChatCreateBody {
  name: string;
  type: "direct" | "group";
  privacy: ChatPrivacy;
  purpose: ChatPurpose;
  world_id?: string; // if world or location privacy
  location_id?: string; // if location privacy
  participant_ids: string[]; // actor IDs
  gm_id?: string; // GM actor ID (optional)
}
```

### Steering Notes API

```typescript
// Create a steering note
POST /api/chats/:chatId/notes
Body: {
  role: 'admin' | 'gm' | 'assistant' | 'system';
  content: string;
  visibility: 'visible' | 'hidden';
  pinned: boolean;
  category: NoteCategory;
}

// List steering notes (filtered by user's role)
GET /api/chats/:chatId/notes?role=gm&category=combat

// Update a steering note
PATCH /api/chats/:chatId/notes/:noteId
Body: {
  content?: string;
  visibility?: 'visible' | 'hidden';
  pinned?: boolean;
}

// Delete a steering note
DELETE /api/chats/:chatId/notes/:noteId
```

### Chat List Filtering

```typescript
interface ChatListQuery {
  privacy?: ChatPrivacy[]; // filter by privacy level
  purpose?: ChatPurpose[]; // filter by purpose
  world_id?: string; // filter by world
  location_id?: string; // filter by location
  type?: "direct" | "group"; // filter by type
  search?: string; // text search
  exclude_coordination?: boolean; // hide coordination chats from main list
}
```

---

## 10. Prompt Injection

### 10.1 Chat Context

```
[Chat Context]
Privacy: private
Purpose: main
Participants: Alice (player), Bob (character), Charlie (NPC)
World: Forgotten Realm
Location: Ironhold Tavern
```

### 10.2 Steering Notes Injection

```
[GM Notes — Story Arc]
- The dark lord is actually the player's father
- Reveal this in Act 3

[GM Notes — Combat]
- Boss has 3 phases, each with different weaknesses
- Phase 2: use fire attacks

[Admin Notes — System]
- Rate limit active: 10 messages/minute
```

### 10.3 Coordination Exclusion

Messages with `purpose = "coordination"` are excluded from context. The generation pipeline filters them out:

```typescript
// In message fetching for context
const messages = await db
  .selectFrom("messages",)
  .where("chat_id", "=", chatId,)
  .where("purpose", "!=", "coordination",) // exclude coordination
  .orderBy("created_at", "asc",)
  .execute();
```

---

## 11. Implementation Notes

### Files to Modify

| File                                            | Purpose                                               |
| ----------------------------------------------- | ----------------------------------------------------- |
| `src/db/schema-core.ts`                         | Add privacy and purpose enums to Chats table          |
| `src/db/enums-core.ts`                          | Add ChatPurpose, SteeringNoteRole, NoteCategory enums |
| `src/db/migrations/`                            | Add privacy/purpose columns, steering_notes table     |
| `src/routes/chats.ts`                           | Add purpose filtering, coordination exclusion         |
| `src/chat/service.ts`                           | Enforce privacy and purpose in message access         |
| `src/generation/actor-resolver.ts`              | Filter out coordination messages from context         |
| `src/assistant/prompt/sections/chat-history.ts` | Inject steering notes into context                    |

### Files to Create

| File                           | Purpose                           |
| ------------------------------ | --------------------------------- |
| `src/chat/privacy.ts`          | Privacy level enforcement         |
| `src/chat/visibility.ts`       | Message visibility rules          |
| `src/chat/steering-notes.ts`   | Steering note CRUD and visibility |
| `src/chat/coordination.ts`     | Coordination chat filtering       |
| `src/routes/steering-notes.ts` | Steering notes API routes         |

---

## Reference

| Document                                                 | Covers                                         |
| -------------------------------------------------------- | ---------------------------------------------- |
| `docs/spec/access-model-clarification.md`                | Gallery access, chat access ownership model    |
| `docs/frontend/chat/overview.md`                         | Chat types (direct/group/assistant)            |
| `docs/frontend/chat/archiving.md`                        | Message archiving (retention)                  |
| `.plan/epics/epic-chat-lifecycle-moderation.md`          | Chat lifecycle and moderation                  |
| `.plan/tickets/TASK-chat-context-feature-permissions.md` | Feature permissions                            |
| `docs/spec/quests-encounters.md`                         | Quest/encounter system (factions issue quests) |
