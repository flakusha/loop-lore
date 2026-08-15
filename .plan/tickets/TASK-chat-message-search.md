# TASK: Chat Message Search & Filter

**Status:** 🟡 Partial — backend routes + tests exist, FTS5 schema + search API + in-chat UI pending
**Priority:** Medium
**Effort:** Med–High
**Epic:** Epic 24 (Filtering & Pagination), Epic 36 (Chat Lifecycle)
**Tags:** chat, message, search, filter, fts, ux
**Spec:** `docs/frontend/chat/search-and-filter.md` §Message Search

## Summary

Full-text message search within a single chat and across all chats. Filter
messages by role, attachment type, date range, and content patterns. Find
assets, music links, and other media in chat history.

## Rationale

- Chats grow long — finding a specific message or asset is painful
- Users need to find "that image from last week" or "the music link they shared"
- RPG players need to find past lore, NPC dialogue, or quest clues
- Cross-chat search enables finding information across all conversations

## Current State

- No message search exists (messages loaded by scroll only)
- Infinite scroll loads older messages but no search capability
- No FTS index on messages table
- Attachment metadata exists but no search by attachment
- SQLite `bun:sqlite` supports FTS5

## Architecture

### In-Chat Search

```
User clicks 🔍 in chat header
  ↓
Inline search bar appears below header
  ↓
User types → debounce 300ms → query server
  ↓
GET /api/messages/search?chatId=X&q=...&limit=50
  ↓
Results: message IDs + match snippets
  ↓
Highlight matches in message list
  ↓
Navigate between matches (↑/↓ arrows, Enter/Shift+Enter)
```

### Cross-Chat Search

```
Global search (sidebar or future global search bar)
  ↓
GET /api/messages/search?q=...&chatId=&role=&hasAttachment=&limit=50
  ↓
Results grouped by chat
  ↓
Click result → navigate to chat, scroll to message, flash-highlight
```

### Specialized Searches

| Search Type    | Query Parameter        | Description                      |
| -------------- | ---------------------- | -------------------------------- |
| Assets in chat | `hasAttachment=true`   | Messages with any attachment     |
| Images only    | `attachmentType=image` | Messages with image attachments  |
| Music/links    | `linkPattern=youtube`  | Messages containing URL patterns |
| By role        | `role=character`       | Messages from specific role      |
| Date range     | `dateFrom=&dateTo=`    | Messages in time window          |
| Regex          | `pattern=<regex>`      | Content regex match (v2)         |

### FTS Implementation

```sql
-- SQLite FTS5 virtual table
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Trigger: update FTS on message insert
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content)
  VALUES (new.rowid, new.content);
END;

-- Trigger: update FTS on message edit
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content)
  VALUES (new.rowid, new.content);
END;

-- Trigger: update FTS on message delete
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;
```

### Response Types

```typescript
interface MessageSearchResult {
  messageId: string;
  chatId: string;
  chatName: string;
  chatCharacterName: string;
  role: "user" | "character" | "assistant" | "system";
  content: string;
  matchContext: string; // highlighted snippet (50-100 chars around match)
  createdAt: string;
  attachments?: MessageAttachment[];
  matchScore: number; // FTS relevance score
}

interface MessageSearchResponse {
  results: MessageSearchResult[];
  total: number;
  hasMore: boolean;
  query: string;
}
```

## Tasks

### Phase 1: FTS Schema

- [ ] Create FTS5 virtual table migration (`messages_fts`)
- [ ] Add insert/update/delete triggers
- [ ] Backfill existing messages into FTS index
- [ ] Add index maintenance to message CRUD routes

### Phase 2: Search API

- [ ] Create `src/routes/message-search.ts`
- [ ] Implement `GET /api/messages/search` with FTS5 query
- [ ] Add chatId filter (scope to one chat)
- [ ] Add role filter
- [ ] Add hasAttachment filter
- [ ] Add attachmentType filter
- [ ] Add dateFrom/dateTo filters
- [ ] Add limit/offset pagination
- [ ] Generate matchContext (snippet around match)
- [ ] Register route in router

### Phase 3: In-Chat Search UI

- [ ] Add search bar to chat header (toggle on 🔍 click)
- [ ] Wire to search API with chatId scope
- [ ] Highlight matches in message list (yellow background)
- [ ] Add match counter ("N of M matches")
- [ ] Add ↑/↓ navigation between matches
- [ ] Add Enter/Shift+Enter keyboard shortcuts
- [ ] Add Escape to close search and clear highlights
- [ ] Auto-scroll to first match on search start

### Phase 4: Specialized Filters

- [ ] "📎 Assets" button in search → filter to attachment messages
- [ ] Attachment type sub-filter (image/audio/video/document)
- [ ] "🔗 Links" button → filter to messages with URLs
- [ ] Domain pattern matching (youtube, spotify, etc.)
- [ ] Role filter dropdown in search results

### Phase 5: Cross-Chat Search

- [ ] Global search input (sidebar or dedicated search page)
- [ ] Remove chatId scope from API call
- [ ] Group results by chat (chat name + character name headers)
- [ ] Click result → navigate to chat, scroll to message
- [ ] Flash-highlight animation on target message (2s fade)

## Files to Create

- `src/routes/message-search.ts` — search endpoints
- `src/db/migrations/` — FTS5 virtual table + triggers
- `src/frontend/alpine/message-search.ts` — search state, highlight, navigation

## Files to Modify

- `src/routes/messages.ts` — update FTS triggers on CRUD
- `src/routes/router.ts` — register message-search routes
- `src/views/chat.html` — search bar, highlight styles
- `src/views/chat-list-panel.html` — global search input
- `src/public/css/app.css` — search highlight, match counter styles

## Performance

| Metric            | Target  | Notes                         |
| ----------------- | ------- | ----------------------------- |
| In-chat search    | < 200ms | FTS5 with index               |
| Cross-chat search | < 500ms | FTS5 across all user messages |
| Highlight render  | < 16ms  | CSS highlight, no DOM rewrite |
| FTS index size    | < 2x    | Message table size overhead   |

## Acceptance Criteria

- [ ] In-chat search returns results within 200ms
- [ ] Matches highlighted in message list
- [ ] Navigate between matches with keyboard
- [ ] Cross-chat search groups results by chat
- [ ] Click result navigates to correct message
- [ ] Attachment filter finds messages with media
- [ ] Link filter finds messages with URLs
- [ ] FTS index stays in sync with message CRUD
- [ ] No performance degradation on chats with 1000+ messages

## Risk

Med — FTS5 schema requires triggers that must stay in sync with message
CRUD. Cross-chat search across many chats could be slow without proper
indexing. Test with large datasets.
