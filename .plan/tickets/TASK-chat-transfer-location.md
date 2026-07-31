# TASK: Chat Transfer & Location Change — Implementation

**Status:** 🟡 Foundation exists
**Priority:** P2-B
**Effort:** Medium
**Epic:** epic-chat-transfer-location
**Tags:** chat, location, travel, transfer, sectioning

## Summary

Implement the three location-change modes (in-chat, new chat, join existing)
and wire VN transitions to location changes. Builds on existing endpoints.

## What Exists

| Component                          | Status | Notes                                      |
| ---------------------------------- | ------ | ------------------------------------------ |
| `PUT /api/chats/:id/location`      | ✅     | Simple `current_location_id` update        |
| `POST /api/chats/:chatId/transfer` | ✅     | Transfer to location (same world)          |
| `POST /api/chats/:chatId/join`     | ✅     | Add user as participant                    |
| `GET /api/chats/joinable`          | ✅     | Discover chats at location                 |
| Transition detection               | ✅     | Regex-based in `chat/transitions.ts`       |
| `ChatTransition` type              | ✅     | Has `location_change` variant              |
| VN scene renderer                  | ✅     | Has transition effects (fade/cut/dissolve) |
| Chat sections                      | ❌     | No DB table, no section logic              |
| VN location transition             | ❌     | No wiring between location change and VN   |

## Implementation Plan

### Step 1: Chat Sections Table

Create migration for `chat_sections` table and add `section_id` to messages.

```sql
CREATE TABLE chat_sections (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  section_order INTEGER NOT NULL,
  title TEXT,
  transition_type TEXT CHECK (transition_type IN ('walk','teleport','cutscene','combat','choice','narrative')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE INDEX idx_sections_chat ON chat_sections(chat_id);
CREATE INDEX idx_sections_location ON chat_sections(location_id);
```

Add to messages table:

```sql
ALTER TABLE messages ADD COLUMN section_id TEXT REFERENCES chat_sections(id);
CREATE INDEX idx_messages_section ON messages(section_id);
```

### Step 2: Section Service

Add to `src/chat/service.ts`:

```typescript
export async function createSection(db, chatId, locationId, worldId, transitionType) { ... }
export async function endCurrentSection(db, chatId) { ... }
export async function getCurrentSection(db, chatId) { ... }
export async function listSections(db, chatId) { ... }
```

### Step 3: Wire Location Change to Section Creation

Modify `PUT /api/chats/:id/location`:

1. End current section (set `ended_at`)
2. Create new section at target location
3. Return section metadata in response

Modify `POST /api/chats/:chatId/transfer`:

1. Same section lifecycle as above
2. Also trigger VN transition event

### Step 4: VN Transition Integration

When a location change occurs:

1. Emit `chat.location_changed` event with section data
2. VN scene renderer receives event
3. Triggers scene transition effect (fade/cut/dissolve)
4. Background image changes to match new location
5. Ambient sound crossfades

Wire via existing `src/chat/transitions.ts`:

```typescript
// In createTransition(), when type is "location_change":
// → emit event with { oldSection, newSection, transitionType }
// → frontend picks up and triggers VN transition
```

### Step 5: "Create Chat at Location" Flow

New endpoint or extension to existing chat creation:

```typescript
POST /api/chats/:chatId/create-at-location
  body: { locationId: string, name?: string }
```

Logic:

1. Copy participants from source chat
2. Create new chat with `parent_chat_id = sourceChatId`
3. Set `current_location_id` to target
4. Create initial section at target location
5. Post transition narration in both chats
6. Return new chat ID

### Step 6: "Join Existing Chat" Flow

Already exists via `POST /api/chats/:chatId/join`. Enhance:

1. Return section history when joining (so UI knows location context)
2. Post "character joined" narration
3. VN entrance animation trigger

### Step 7: Section-Aware Message Queries

Modify `listMessages` in `chat/service.ts`:

- Add optional `sectionId` filter
- Return section metadata alongside messages
- Support "load by section" for infinite scroll

## Files to Create

- `src/db/migrations/031_chat_sections.ts` — chat_sections table
- `src/routes/chat-sections.ts` — section CRUD endpoints

## Files to Modify

- `src/db/schema-core.ts` — add ChatsSections interface
- `src/db/schema-manifest.ts` — regenerate
- `src/chat/service.ts` — add section CRUD, wire to location change
- `src/chat/types.ts` — add section types
- `src/routes/chats.ts` — section-aware location update
- `src/routes/chat-search.ts` — extend transfer with section creation
- `src/chat/transitions.ts` — emit section events
- `src/frontend/vn/scene-renderer.ts` — handle location transition events
- `src/frontend/vn/choice-cards.ts` — location choice cards

## Acceptance Criteria

- [ ] `chat_sections` table created with proper schema
- [ ] `messages.section_id` column added
- [ ] Location change creates new section automatically
- [ ] Section-aware message queries work
- [ ] VN transition fires on location change
- [ ] "Create chat at location" flow works end-to-end
- [ ] "Join existing chat" returns section context
- [ ] Background/sound sync per section
- [ ] All existing chat tests still pass

## Verification

```bash
bun run check
bun test src/chat/
bun test src/routes/chats.ts
bun test src/routes/chat-search.ts
```
