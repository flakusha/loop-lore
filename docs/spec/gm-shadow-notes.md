<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Actor Notes Specification

> **Status:** DESIGN — ready for implementation
> Authoritative source: `src/db/schema-manifest.ts`, `src/routes/actor-notes.ts`

## Overview

Actor notes are short, structured context blocks (lore, combat intel, relationship reminders, system directives) injected into the LLM context window during chat generation. They are distinct from `actor_memories` — notes are intentional, authored directives; memories are organic, promotion-based context.

**Core design principle:** Notes expire by default. The GM/assistant should never have to remember to deactivate a steering note — the system handles staleness automatically via message-count TTL. Expiration is the norm; indefinite persistence is the exception (pinned notes).

## Schema Extension

Current columns (from `schema-manifest.ts`):

| Column       | Type             | Notes                                                               |
| ------------ | ---------------- | ------------------------------------------------------------------- |
| `id`         | text PK          |                                                                     |
| `actor_id`   | text NOT NULL    |                                                                     |
| `title`      | text NOT NULL    |                                                                     |
| `content`    | text NOT NULL    | The actual note text injected into LLM context                      |
| `category`   | text NOT NULL    | Enum: general, combat, lore, relationships, reminders, system, etc. |
| `pinned`     | text NOT NULL    | Boolean — pinned notes bypass TTL                                   |
| `sort_order` | integer NOT NULL | Display + injection priority                                        |
| `created_at` | text NOT NULL    |                                                                     |
| `updated_at` | text NOT NULL    |                                                                     |

### Proposed Columns

| Column          | Type             | Default     | Description                                                                                                        |
| --------------- | ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `visibility`    | text NOT NULL    | `'visible'` | `visible` = injected into LLM context, `invisible` = exists but excluded from injection                            |
| `ttl_messages`  | integer NOT NULL | `10`        | Number of assistant messages before note auto-expires. Default 10 (5 turns). `null` = no expiry (only via pinned). |
| `ttl_remaining` | integer          | `null`      | Countdown decremented on each assistant message. Initialized to `ttl_messages` on creation.                        |
| `status`        | text NOT NULL    | `'active'`  | `active`, `inactive`, `expired`                                                                                    |
| `scope`         | text             | `null`      | `null` = applies to all chats for this actor, or a specific `chat_id` to restrict injection                        |
| `author_type`   | text NOT NULL    | `'user'`    | `user`, `assistant`, `gm` — who created the note (affects TTL defaults and shadow behavior)                        |

**Migration note:** Existing notes get `visibility='visible'`, `status='active'`, `ttl_messages=10`, `author_type='user'`. Behavior identical to today until TTL decrement logic is wired.

## TTL Defaults by Context

Notes expire by default. TTL values are determined by chat type and actor count:

| Context                            | Default TTL                        | Rationale                                          |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------- |
| **1x1 chat** (user ↔ assistant/GM) | 10 messages (5 turns)              | Enough for a scene, auto-clears when topic shifts  |
| **Group chat** (2-3 actors)        | 5 turns                            | Shorter — more actors = faster context bloat       |
| **Group chat** (4+ actors)         | 3 turns                            | Aggressive — many actors multiply context pressure |
| **Story mode**                     | Per-turn (matches `turn_strategy`) | Aligns with story turn cadence                     |

**Override at creation:** User/GM can set custom `ttl_messages` when creating a note. Set to `null` only via explicit "persistent" flag (bypasses TTL).

### Category-Based TTL Modifiers

Certain categories get TTL adjustments on top of the context base:

| Category        | Modifier              | Example                                           |
| --------------- | --------------------- | ------------------------------------------------- |
| `combat`        | -2 messages (shorter) | "Goblins flanking left" — expires fast            |
| `lore`          | +5 messages (longer)  | "The kingdom fell 300 years ago" — stays relevant |
| `relationships` | +3 messages (longer)  | "Elara distrusts strangers" — persistent trait    |
| `reminders`     | -3 messages (shorter) | "Check the north gate" — one-shot                 |
| `system`        | No modifier           | Neutral                                           |
| `general`       | No modifier           | Neutral                                           |

Final TTL = `context_default + category_modifier`. Floor of 1 message minimum.

## Shadow Notes (GM/Assistant)

Shadow notes are a subset of notes with special behavior:

- **Created by:** `author_type = 'assistant'` or `author_type = 'gm'`
- **Visibility:** Always `invisible` to the user in the chat UI (not shown in message list)
- **Injection:** Always injected into LLM context (bypasses user visibility toggle)
- **Purpose:** Internal steering — "the dragon is actually friendly but pretends to be hostile", "the treasure is a mimic"

### Shadow Note Rules

1. Shadow notes are **never shown** in the chat message list or note list UI (unless dev mode is active)
2. Shadow notes appear in a separate **"Shadow Notes"** panel in the GM/Assistant admin view
3. Shadow notes respect TTL like any other note
4. Shadow notes can be linked to specific chat participants (via `scope`) or be global
5. Users cannot create shadow notes — only assistant/GM can

### Shadow Note Injection Format

```
## Shadow Directives (GM/Assistant internal)
- 🐉 [system] The dragon is feigning hostility; it seeks an ally against the Void King.
- 🗡️ [combat] The goblin chief carries a map to the hidden vault.
```

## Note Search and Filtering

### Search API

`GET /api/actors/:actorId/notes/search?q=:query`

| Parameter     | Type    | Description                                                                       |
| ------------- | ------- | --------------------------------------------------------------------------------- |
| `q`           | string  | Full-text search across title + content                                           |
| `category`    | string  | Filter by category                                                                |
| `status`      | string  | `active`, `inactive`, `expired`, `all` (default: `active`)                        |
| `visibility`  | string  | `visible`, `invisible`, `all` (default: `all`)                                    |
| `scope`       | string  | Chat ID or `null` for global                                                      |
| `author_type` | string  | `user`, `assistant`, `gm`, `all` (default: `all`)                                 |
| `pinned`      | boolean | Filter pinned-only                                                                |
| `sort`        | string  | `created_at`, `updated_at`, `sort_order`, `ttl_remaining` (default: `sort_order`) |
| `order`       | string  | `asc`, `desc` (default: `asc`)                                                    |
| `limit`       | integer | Results per page (default: 50, max: 200)                                          |
| `offset`      | integer | Pagination offset                                                                 |

### Search Response

```json
{
  "notes": [...],
  "total": 42,
  "facets": {
    "categories": {"combat": 5, "lore": 12, "relationships": 3},
    "statuses": {"active": 20, "inactive": 5, "expired": 17},
    "author_types": {"user": 30, "assistant": 8, "gm": 4}
  }
}
```

### Frontend Filter Bar

- **Search input:** Real-time full-text search
- **Category chips:** Click to toggle (combat, lore, relationships, etc.)
- **Status dropdown:** All / Active / Inactive / Expired
- **Author filter:** All / User / Assistant / GM
- **Scope filter:** All chats / Specific chat
- **Sort:** Newest / Oldest / TTL remaining / Priority
- **Bulk select:** Checkbox per note for bulk operations

## Context Injection

### Injection Path

`src/chat/memory-injection.ts` currently pulls from `actor_memories` only. Notes are added as a parallel injection source.

**Injection order in system prompt:**

1. World/system directives (highest priority)
2. **Shadow notes** (GM/assistant internal — invisible to user)
3. **Actor notes** (user-visible, filtered by status/visibility/scope)
4. Actor memories (organic context)
5. Chat history context window

### Injection Query

```sql
SELECT title, content, category, sort_order, author_type, pinned
FROM actor_notes
WHERE actor_id = :actorId
  AND status = 'active'
  AND visibility = 'visible'
  AND (scope IS NULL OR scope = :chatId)
ORDER BY
  author_type = 'gm' DESC,      -- GM shadow notes first
  author_type = 'assistant' DESC, -- Assistant shadow notes second
  pinned DESC,                    -- Pinned notes before TTL notes
  sort_order ASC                  -- User-defined priority
```

### Injection Format

```
## Active Notes
- [lore] The kingdom of Aethermoor fell three centuries ago; its ruins lie beneath the Ashwood.
- [combat] Goblin warbands patrol at night; avoid open fields after dusk.
- [relationships] Elara trusts no one who mentions the Void King.

## Shadow Directives (internal)
- 🐉 [system] The dragon is feigning hostility; it seeks an ally against the Void King.
```

## TTL Expiration Logic

### Decrement Trigger

On every **assistant message** (or story turn completion), for each `active` note with `ttl_messages`:

1. Decrement `ttl_remaining` by 1
2. If `ttl_remaining <= 0`:
   - Set `status = 'expired'`
   - Set `ttl_remaining = 0`
   - Emit notification event (see Expiry Notifications)

### Batch Expiry Check

Runs once at the start of each generation cycle (before context assembly), not per-message:

```sql
-- Expire notes that have run out of TTL
UPDATE actor_notes
SET status = 'expired', ttl_remaining = 0
WHERE status = 'active'
  AND pinned = 'false'
  AND ttl_messages IS NOT NULL
  AND ttl_remaining <= 1;

-- Decrement remaining TTL for active notes
UPDATE actor_notes
SET ttl_remaining = ttl_remaining - 1,
    updated_at = datetime('now')
WHERE status = 'active'
  AND pinned = 'false'
  AND ttl_messages IS NOT NULL
  AND ttl_remaining > 0;
```

### Manual Reset

```sql
-- Reactivate an expired/inactive note
UPDATE actor_notes
SET status = 'active',
    ttl_remaining = ttl_messages
WHERE id = :noteId;
```

Or via API: `POST /api/actors/:actorId/notes/:noteId/reactivate`

## Expiry Notifications

Notifications are context-dependent:

| Context                                 | Notification Behavior                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| **Assistant-driven chat** (1x1 with AI) | Required — assistant/GM drives the story, needs to know when steering expires |
| **User-driven chat** (1x1 with human)   | Optional — opt-in via user config or chat settings                            |
| **Group chat**                          | Required for assistant/GM participants only                                   |
| **Story mode**                          | Required — turn-based, expiry aligns with turn completion                     |

### Notification Payload

```json
{
  "event": "note_expired",
  "note_id": "note-abc-123",
  "actor_id": "actor-456",
  "title": "Scout Report",
  "category": "combat",
  "ttl_messages": 10,
  "messages_since_creation": 10,
  "chat_id": "chat-789"
}
```

### Notification Delivery

- **In-chat toast:** Brief notification in chat UI: "📌 Note expired: Scout Report"
- **System message:** Optional injection as a system message in chat history
- **Config option:** `notifications.note_expiry: 'toast' | 'system_message' | 'silent'` (default depends on context)

## Scope Resolution

| Event         | Behavior                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------- |
| Chat deleted  | Notes with `scope = :chatId` → set `scope = null` (become global) and `status = 'inactive'` |
| Actor deleted | Cascade delete all notes (existing FK behavior)                                             |
| Chat created  | No action — notes remain global until explicitly scoped                                     |

## Dev Mode: Full Message Contents Debug

When `devMode = true` (from user settings or `NODE_ENV=development`):

### Enhanced Note Display

- Show full `content` field (no truncation) in note cards
- Show `ttl_remaining` / `ttl_messages` as raw numbers (not badges)
- Show `scope` as chat ID (not resolved name)
- Show `author_type` and `visibility` status inline
- Show `created_at` / `updated_at` timestamps

### Chat Message Debug Panel

In dev mode, each chat message shows an expandable debug panel:

```
┌─ Message #42 ──────────────────────────────────────┐
│ Role: assistant                                     │
│ Tokens: 342                                         │
│ Model: gpt-4                                        │
│                                                     │
│ ┌─ Injected Context ──────────────────────────────┐ │
│ │ Notes (3):                                       │ │
│ │   - [lore] Kingdom fell 300 years ago (TTL: 7/10)│ │
│ │   - [combat] Goblins patrol at night (TTL: 3/10) │ │
│ │   - [system] Dragon is feigning hostility (📌)   │ │
│ │ Memories (2):                                    │ │
│ │   - User prefers stealth approaches              │ │
│ │   - Previous encounter with goblins              │ │
│ │                                                  │ │
│ │ Context window: 12,400 / 128,000 tokens          │ │
│ └──────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Full Message Content ───────────────────────────┐ │
│ │ The dragon rears back, its scales glinting in    │ │
│ │ the torchlight. But you notice something odd —   │ │
│ │ its eyes dart not to you, but to the shadows     │ │
│ │ behind you, as if warning of something else...   │ │
│ │                                                  │ │
│ │ [Raw: 342 tokens | 1,247 chars]                  │ │
│ └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Debug API Endpoint

`GET /api/chats/:chatId/messages/:messageId/debug`

Returns full message with:

- Complete injected context (notes, memories, system prompts)
- Token counts per component
- Model used
- Generation parameters
- Note TTL states at time of generation

## API Changes

### GET `/api/actors/:actorId/notes`

Add query parameters:

- `?status=active|inactive|expired|all` (default: `active`)
- `?visibility=visible|invisible|all` (default: `all`)
- `?scope=:chatId` (filter by scope)
- `?author_type=user|assistant|gm|all` (default: `all`)

### POST `/api/actors/:actorId/notes`

Accept new fields in body:

```json
{
  "title": "Scout Report",
  "content": "Orc encampment spotted near the river crossing.",
  "category": "combat",
  "visibility": "visible",
  "ttl_messages": 10,
  "scope": "chat-abc-123",
  "author_type": "user",
  "pinned": false,
  "sort_order": 0
}
```

### PATCH `/api/actors/:actorId/notes/:noteId`

Accept partial updates of any field, including:

- `status`: manual activate/deactivate/expire
- `ttl_remaining`: manual reset
- `ttl_messages`: change TTL without resetting countdown
- `visibility`: toggle LLM visibility
- `scope`: restrict or expand to all chats

### POST `/api/actors/:actorId/notes/:noteId/reactivate`

Convenience endpoint: resets `status = 'active'`, `ttl_remaining = ttl_messages`.

## Frontend

### Note Card (List View)

Each note card shows:

- Title + category badge
- Content preview (first 120 chars, full in dev mode)
- **Status indicator:** 🟢 active / 🟡 inactive / 🔴 expired
- **TTL badge:** `⏰ 7/10` (remaining/total) or `📌 pinned`
- **Visibility toggle:** eye icon 👁️ / eye-slash 🚫
- **Scope badge:** `all chats` or `chat: <name>`
- **Author badge:** `👤 user` / `🤖 assistant` / `🎲 gm`

### Note Detail Modal

Full edit form with:

- Title, content (textarea), category (dropdown)
- Visibility radio: visible / invisible
- TTL: integer input + "messages" label (default: 10, blank = no expiry)
- Scope: dropdown (all chats, or specific chat)
- Author type: user / assistant / gm (determines shadow behavior)
- Pinned checkbox (overrides TTL)
- Save / Delete / Reactivate buttons

### Filter Bar

- **Search input:** Real-time full-text search
- **Category chips:** Click to toggle (combat, lore, relationships, etc.)
- **Status dropdown:** All / Active / Inactive / Expired
- **Author filter:** All / User / Assistant / GM
- **Scope filter:** All chats / Specific chat
- **Sort:** Newest / Oldest / TTL remaining / Priority
- **Bulk select:** Checkbox per note for bulk operations

### Bulk Operations

- Select multiple notes → bulk activate/deactivate/expire/delete
- Bulk TTL reset (reactivate expired notes)
- Bulk scope assignment

## Edge Cases

| Case                                      | Behavior                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Note has `ttl_messages=0`                 | Expires immediately on next generation cycle (useful for one-shot directives) |
| Note has `ttl_messages=null, pinned=true` | Never expires, always active                                                  |
| Note has `ttl_messages=5, pinned=true`    | TTL is ignored; note stays active indefinitely                                |
| Scope chat is deleted                     | Note becomes `scope=null` + `status='inactive'` (preserved, not orphaned)     |
| Actor is deleted                          | Cascade delete all notes (existing FK behavior)                               |
| Multiple notes with same sort_order       | Stable sort by `created_at` as tiebreaker                                     |
| Shadow note created by user               | Rejected — only assistant/GM can create shadow notes                          |
| TTL category modifier pushes below 1      | Floor at 1 message minimum                                                    |

## Migration

New migration adds columns to `actor_notes`:

```sql
ALTER TABLE actor_notes ADD COLUMN visibility text NOT NULL DEFAULT 'visible';
ALTER TABLE actor_notes ADD COLUMN ttl_messages integer NOT NULL DEFAULT 10;
ALTER TABLE actor_notes ADD COLUMN ttl_remaining integer;
ALTER TABLE actor_notes ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE actor_notes ADD COLUMN scope text;
ALTER TABLE actor_notes ADD COLUMN author_type text NOT NULL DEFAULT 'user';
```

Existing notes: `visibility='visible'`, `status='active'`, `ttl_messages=10`, `author_type='user'` — identical behavior to today until TTL decrement logic is wired.

## Unified Search Interface (Notes + Memories + Extensible)

Shared search/browse UI for notes, memories, and future item types (lore entries, items, etc.). Single consistent API and frontend component.

### Design Principle

One search bar, one filter panel, one results grid — works across all "context items" that can be injected into LLM generation. Each item type registers itself into the unified interface.

### Registered Item Types

| Type         | Source Table         | Icon | Color  |
| ------------ | -------------------- | ---- | ------ |
| Notes        | `actor_notes`        | 📝   | Blue   |
| Memories     | `actor_memories`     | 🧠   | Purple |
| Lore entries | `actor_lore_entries` | 📜   | Amber  |
| World lore   | `world_lore_entries` | 🌍   | Green  |

Future types register via a manifest:

```typescript
interface SearchableItemType {
  id: string; // 'notes' | 'memories' | 'lore' | ...
  label: string; // 'Notes' | 'Memories' | ...
  icon: string; // emoji
  color: string; // tailwind class
  table: string; // DB table name
  searchFields: string[]; // columns to full-text search
  filterFields: FilterField[]; // available filters
  sortFields: SortField[]; // available sort options
  injectable: boolean; // can be injected into LLM context
}
```

### API

`GET /api/actors/:actorId/search`

| Parameter        | Type    | Description                                                    |
| ---------------- | ------- | -------------------------------------------------------------- |
| `q`              | string  | Full-text search across all registered item types              |
| `types`          | string  | Comma-separated: `notes,memories,lore` (default: all)          |
| `chat_id`        | string  | Filter items linked to this chat                               |
| `interaction_id` | string  | Filter items from this interaction/turn                        |
| `status`         | string  | `active`, `inactive`, `expired`, `all` (default: `active`)     |
| `sort`           | string  | `created_at`, `updated_at`, `relevance` (default: `relevance`) |
| `order`          | string  | `asc`, `desc` (default: `desc`)                                |
| `limit`          | integer | Results per page (default: 50, max: 200)                       |
| `offset`         | integer | Pagination offset                                              |

### Response

```json
{
  "results": [
    {
      "type": "notes",
      "id": "note-abc-123",
      "title": "Kingdom History",
      "content": "The kingdom of Aethermoor fell three centuries ago...",
      "category": "lore",
      "status": "active",
      "created_at": "2026-07-28T12:00:00Z",
      "chat_ids": ["chat-789"],
      "relevance_score": 0.92
    },
    {
      "type": "memories",
      "id": "mem-def-456",
      "title": "User prefers stealth",
      "content": "Alice consistently chooses stealth approaches...",
      "category": "preference",
      "status": "active",
      "created_at": "2026-07-27T08:00:00Z",
      "chat_ids": ["chat-789", "chat-101"],
      "relevance_score": 0.87
    }
  ],
  "facets": {
    "types": { "notes": 15, "memories": 23, "lore": 8 },
    "chats": { "chat-789": 12, "chat-101": 8 },
    "statuses": { "active": 30, "inactive": 5, "expired": 11 }
  },
  "total": 46
}
```

### Filter Panel

```
┌─ Search ────────────────────────────────────────────────────────────┐
│ [🔍 Search notes, memories, lore...]                                │
│                                                                      │
│ Type     [📝 Notes ✓] [🧠 Memories ✓] [📜 Lore ✓] [🌍 World ✓]   │
│                                                                      │
│ Chat     [All chats ▾]                                               │
│          ├ chat-789 (12)                                             │
│          ├ chat-101 (8)                                              │
│          └ chat-202 (3)                                              │
│                                                                      │
│ Interaction [All ▾]                                                  │
│            ├ Turn 5 — "Dragon encounter" (4)                         │
│            ├ Turn 4 — "Goblin ambush" (6)                            │
│            └ Turn 3 — "Arrival at village" (3)                       │
│                                                                      │
│ Status   [All ▾]                                                     │
│ Sort     [Relevance ▾] [Newest first ▾]                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Interaction Filter

The interaction filter shows chat turns/interations as filterable units:

| Interaction | Description          | Item Count |
| ----------- | -------------------- | ---------- |
| Turn 5      | "Dragon encounter"   | 4          |
| Turn 4      | "Goblin ambush"      | 6          |
| Turn 3      | "Arrival at village" | 3          |

Items linked to a turn via:

- `actor_notes.scope` matching the chat
- `actor_memories.source_turn` or `actor_memories.source_chat`
- `actor_lore_entries` linked to the same chat

### Time-Based Sorting

All item types support time-based sorting:

| Sort Option     | Description                               |
| --------------- | ----------------------------------------- |
| `created_at`    | When item was created                     |
| `updated_at`    | When item was last modified               |
| `relevance`     | Full-text search relevance score          |
| `ttl_remaining` | Notes only — items expiring soonest first |

**Default sort:** `relevance` when searching, `updated_at` when browsing.

### Unified Result Card

Each result shows:

- **Type badge:** 📝 / 🧠 / 📜 / 🌍 with color
- **Title** (bold)
- **Content preview** (first 150 chars, with search term highlighted)
- **Metadata row:** category, status, chat link, time ago
- **Actions:** Edit, Inject into context, Pin, Delete

### Bulk Operations Across Types

- Select items across types → bulk activate/deactivate/delete
- Bulk inject selected into current chat context
- Bulk export (JSON/CSV)

### Extension Point

New item types register via config:

```typescript
// src/search/searchable-types.ts
export const SEARCHABLE_TYPES: SearchableItemType[] = [
  { id: 'notes', label: 'Notes', icon: '📝', color: 'blue', ... },
  { id: 'memories', label: 'Memories', icon: '🧠', color: 'purple', ... },
  { id: 'lore', label: 'Lore Entries', icon: '📜', color: 'amber', ... },
  { id: 'world-lore', label: 'World Lore', icon: '🌍', color: 'green', ... },
  // Future: { id: 'items', label: 'Items', icon: '⚔️', color: 'red', ... },
];
```

Plugins can register additional types:

```typescript
// Plugin example: quest objectives
SEARCHABLE_TYPES.push({
  id: "quest-objectives",
  label: "Quest Objectives",
  icon: "🎯",
  color: "orange",
  table: "quest_objectives",
  searchFields: ["title", "description",],
  filterFields: ["status", "quest_id",],
  sortFields: ["created_at", "due_at",],
  injectable: true,
},);
```

### Frontend Page

Located at `/notes` (or integrated into Creative Studio):

```
Creative Studio
├── Gallery (assets, images, audio)
├── Notes & Memories (unified search)  ← EXPANDED
│   ├── Notes tab
│   ├── Memories tab
│   └── All tab (unified view)
├── Characters (character management)
└── Templates (prompt templates)
```

The "All" tab uses the unified search interface. Individual tabs show filtered views of their specific type.

## Server-Side Logging & Tracing (Dev Mode)

When `NODE_ENV=development` or `devMode: true` in user settings:

### Structured Logging

Every note operation emits structured logs with correlation IDs:

```json
{
  "level": "info",
  "component": "notes",
  "operation": "inject",
  "actor_id": "actor-456",
  "chat_id": "chat-789",
  "notes_injected": 3,
  "notes_expired": 1,
  "ttl_states": [
    { "id": "note-1", "ttl_remaining": 7, "category": "lore" },
    { "id": "note-2", "ttl_remaining": 3, "category": "combat" },
    { "id": "note-3", "ttl_remaining": 0, "status": "expired" }
  ],
  "correlation_id": "gen-abc-123",
  "timestamp": "2026-07-28T12:00:00Z"
}
```

### Trace Events

| Event                  | Logged When                  | Payload                                |
| ---------------------- | ---------------------------- | -------------------------------------- |
| `note.created`         | Note created                 | Full note object                       |
| `note.updated`         | Note patched                 | Changed fields only                    |
| `note.expired`         | TTL hits 0                   | Note ID, category, TTL was             |
| `note.reactivated`     | Manual reactivation          | Note ID, new TTL                       |
| `note.injected`        | Context assembly             | Note IDs, token count, injection order |
| `note.scope.resolved`  | Chat deleted, scope fallback | Note IDs, old scope, new scope         |
| `note.shadow.created`  | Shadow note by assistant/GM  | Note ID, author_type                   |
| `note.shadow.injected` | Shadow note in context       | Note IDs, position in injection        |

### Log Levels

| Level   | Use                                                                 |
| ------- | ------------------------------------------------------------------- |
| `debug` | Individual note injection details, TTL decrement per-note           |
| `info`  | Batch operations (expiry check, scope resolution), note CRUD        |
| `warn`  | TTL floor hit (modifier pushed below 1), shadow note scope mismatch |
| `error` | Injection failure, DB constraint violation                          |

### Tracing Integration

- All note operations tagged with `correlation_id` (links to generation attempt)
- Spans: `notes.inject` → `memory.inject` → `context.assemble` → `llm.generate`
- Exportable to OpenTelemetry collector if configured

### Dev Dashboard Endpoint

`GET /api/dev/notes/trace?actor_id=:actorId&chat_id=:chatId&limit=50`

Returns recent note operations with full trace data:

```json
{
  "operations": [
    {
      "id": "op-1",
      "operation": "note.inject",
      "timestamp": "2026-07-28T12:00:00Z",
      "actor_id": "actor-456",
      "chat_id": "chat-789",
      "notes_injected": 3,
      "notes_expired": 1,
      "correlation_id": "gen-abc-123",
      "duration_ms": 12
    }
  ],
  "summary": {
    "total_operations": 150,
    "avg_injection_time_ms": 8,
    "notes_expired_total": 23,
    "active_notes": 12
  }
}
```

## Notes Frontend Page

Dedicated notes management page, similar to gallery. Accessible from main navigation.

### Page Layout

```
┌─ Notes ─────────────────────────────────────────────────────────────┐
│ [Search: ___________________] [Category ▾] [Status ▾] [Author ▾]   │
│ [Scope ▾] [Sort: Priority ▾] [← →]          [+ New Note] [Bulk ⚙] │
│                                                                      │
│ ┌─ Active (12) ───────────────────────────────────────────────────┐  │
│ │ ☐ 📌 Kingdom History     [lore]       ⏰ 10/10  👁️  all chats │  │
│ │ ☐ 🗡️ Goblin Patrols      [combat]     ⏰ 3/10   👁️  chat-abc │  │
│ │ ☐ 💔 Elara's Trust       [relations]  ⏰ 8/10   🚫  all chats │  │
│ │ ...                                                              │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│ ┌─ Shadow Notes (4) ─────────────────────────────────────────────┐   │
│ │ ☐ 🐉 Dragon's Secret    [system]     ⏰ 7/10   🤖 assistant  │   │
│ │ ☐ 🗺️ Hidden Vault       [combat]     ⏰ 5/10   🎲 gm         │   │
│ │ ...                                                              │   │
│ └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│ ┌─ Expired (8) ──────────────────────────────────────────────────┐   │
│ │ ☐ 📋 Old Scout Report    [combat]     expired  👁️  all chats │   │
│ │ ...                                                              │   │
│ └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Sections

| Section          | Contents                           | Default View                |
| ---------------- | ---------------------------------- | --------------------------- |
| **Active**       | Notes with `status='active'`       | Expanded                    |
| **Shadow Notes** | Notes with `author_type != 'user'` | Collapsed (click to expand) |
| **Expired**      | Notes with `status='expired'`      | Collapsed                   |
| **Inactive**     | Notes with `status='inactive'`     | Collapsed                   |

### Note Card Actions

| Action                 | Icon | Behavior                                               |
| ---------------------- | ---- | ------------------------------------------------------ |
| Edit                   | ✏️    | Opens detail modal                                     |
| Pin/Unpin              | 📌   | Toggle pinned status                                   |
| Visibility toggle      | 👁️/🚫 | Toggle visible/invisible                               |
| Reactivate             | 🔄   | Reset TTL, set active                                  |
| Delete                 | 🗑️    | Permanent delete (with confirmation)                   |
| Request from assistant | 🤖   | Flags note for assistant to reference in next response |

### Request from Assistant

The "Request from assistant" action is a **soft signal** — it doesn't force the assistant to use the note, but adds it to a priority queue for the next generation cycle:

```json
{
  "event": "note.requested",
  "note_id": "note-abc-123",
  "actor_id": "actor-456",
  "requested_by": "user",
  "chat_id": "chat-789",
  "priority": "high"
}
```

**Behavior:**

- Requested notes get a `📌` priority boost in injection order
- Assistant sees a hint: "User requested you reference: Kingdom History"
- Assistant can acknowledge or ignore — it's a suggestion, not a command
- Request expires after 1 generation cycle (one-shot boost)

### Creative Studio Integration

Notes page is part of the **Creative Studio** section alongside Gallery:

```
Creative Studio
├── Gallery (assets, images, audio)
├── Notes (context, lore, directives)  ← NEW
├── Characters (character management)
└── Templates (prompt templates)
```

**Cross-linking:**

- Notes can reference gallery assets (via `asset_id` field on notes)
- Gallery assets can show "Referenced by: 3 notes" badge
- Notes page has a "Link Asset" button that opens gallery picker

### Note Detail Modal

Full edit form with:

- Title, content (textarea), category (dropdown)
- Visibility radio: visible / invisible
- TTL: integer input + "messages" label (default: 10, blank = no expiry)
- Scope: dropdown (all chats, or specific chat)
- Author type: user / assistant / gm (determines shadow behavior)
- Pinned checkbox (overrides TTL)
- **Link Asset:** button to attach gallery asset (shows thumbnail preview)
- Save / Delete / Reactivate buttons

### Bulk Operations

- Select multiple notes → bulk activate/deactivate/expire/delete
- Bulk TTL reset (reactivate expired notes)
- Bulk scope assignment
- Bulk visibility toggle

## Integration Points

| System                 | Relationship                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `memory-injection.ts`  | Primary consumer — reads active, visible notes for LLM context |
| `actor_memories.ts`    | Parallel system — notes are intentional, memories are organic  |
| `chat/service.ts`      | Triggers TTL decrement on assistant message completion         |
| `turning/`             | Story mode also triggers TTL decrement on turn completion      |
| `notifications/`       | Expiry notifications (context-dependent)                       |
| `frontend/dev-mode.ts` | Enhanced debug display when devMode active                     |
