# Chat: Search & Filter

Search and filter for chat rooms (finding/joining chats) and messages
(finding content within chats). Covers sidebar search, filter chips,
full-text message search, and specialized content filters.

---

## Chat Room Search

### Sidebar Search (Left Panel)

When the hamburger sidebar is open, a search input sits at the top of the
"Chats" section:

```
┌─────────────────────────────┐
│ ☰ loop-lore          [close]│
├─────────────────────────────┤
│ 🔍 Search chats...          │  ← text input with debounce
├─────────────────────────────┤
│ [chat row]                  │
│ [chat row]                  │
│ ...                         │
└─────────────────────────────┘
```

**Behavior:**

- Debounced input (300ms) — filters the chat list in-place (client-side for
  loaded chats, server-side for broader search)
- Matching: character name, chat name/title, world name, tags
- Case-insensitive substring match (v1); fuzzy matching (v2)
- Clear button (×) when input has text
- Keyboard: `Escape` clears and closes search, `/` focuses search (when sidebar open)

**Server-side search** (for when client-side list is insufficient):

```
GET /api/chats/search?q=<query>&type=<direct|group>&world=<worldId>&limit=20
```

Returns chats matching the query across all user's chats. Response:

```typescript
interface ChatSearchResult {
  chatId: string;
  chatName: string; // auto-generated or user-set name
  characterName: string;
  characterAvatar: string; // URL
  worldName?: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  messageCount: number;
  participantCount: number;
  matchContext: string; // snippet showing where match occurred
}
```

### Find & Join (Public / World Chats)

For RPG mode, users can discover and join chats at locations:

```
GET /api/chats/joinable?world=<worldId>&location=<locationId>&limit=20
```

Returns public/shared chats the user is not yet a participant of:

```typescript
interface JoinableChat {
  chatId: string;
  chatName: string;
  worldName: string;
  locationName: string;
  participantCount: number;
  lastActiveAt: string;
  isPublic: boolean;
}
```

**Join flow:**

1. User searches or browses joinable chats
2. Clicks "Join" on a chat
3. Confirmation dialog (optional, configurable)
4. User added as participant, redirected to chat
5. History visible from join point forward (or full history if public)

**Transfer to new location** (within a chat):

- Discussed in `epic-chat-transfer-location.md` and
  `TASK-chat-sectioning-multi-location.md`
- When a user transfers, the chat's location updates and a section
  divider is created (if sectioning is enabled)

---

## Chat Room Filters

### Filter Chips (Sidebar)

Below the search input, a row of filter chips narrows the chat list:

```
┌─────────────────────────────┐
│ 🔍 Search chats...          │
├─────────────────────────────┤
│ [All] [Direct] [Group]      │  ← type filter
│ [World ▼] [Tags ▼] [More ▼] │  ← dropdown filters
├─────────────────────────────┤
│ [chat row]                  │
│ ...                         │
└─────────────────────────────┘
```

**Filter dimensions:**

| Filter            | Type         | Options                                                       |
| ----------------- | ------------ | ------------------------------------------------------------- |
| Type              | Chips        | All, Direct, Group                                            |
| World             | Dropdown     | All worlds, specific world names                              |
| Tags              | Multi-select | User-defined tags on chats (if implemented) or character tags |
| Participant count | Range        | 1 (solo), 2, 3-5, 6+                                          |
| Message count     | Range        | <10, 10-50, 50-200, 200+                                      |
| Has attachments   | Toggle       | Show only chats with media                                    |
| Last active       | Dropdown     | Today, This week, This month, Older                           |
| Pinned            | Toggle       | Show only pinned chats                                        |
| Has world         | Toggle       | Show only world-linked chats vs freeform                      |

**Combined filters:** Multiple filters compose with AND logic. Selecting
"All" on any dimension clears that filter.

**Active filters display:**

- Active filters shown as removable chips below the filter row
- "Clear all" link when ≥1 filter active
- Filter state persisted in `localStorage` (survives page reload)

**Server-side filter API:**

```
GET /api/chats?type=group&world=<id>&minMessages=10&activeSince=2026-07-01&limit=20&offset=0
```

### Filter Persistence

Filters are stored in `localStorage` under `chat-sidebar-filters`:

```json
{
  "type": "group",
  "world": "world_abc",
  "tags": ["fantasy", "rp"],
  "participantCount": "2",
  "messageCount": "50-200",
  "hasAttachments": false,
  "lastActive": "week",
  "pinned": false,
  "hasWorld": true
}
```

On sidebar open, filters restore to last-used state.

---

## Message Search

### In-Chat Search

Within an open chat, a search icon in the chat header opens a search bar:

```
┌──────────────────────────────────────┐
│ 📍 Ancient Tavern    [🔍] [Map] [⋯] │
├──────────────────────────────────────┤
│ 🔍 Search in this chat...     [×]   │  ← inline search bar
├──────────────────────────────────────┤
│ [message]                            │
│ [message]  ← highlighted match       │
│ [message]                            │
└──────────────────────────────────────┘
```

**Behavior:**

- Searches message `content` field (text)
- Highlighted matches in message bubbles (yellow background, `--accent-yellow`)
- "N of M matches" counter with up/down arrows to jump between matches
- `Enter` jumps to next match, `Shift+Enter` to previous
- `Escape` closes search, removes highlights
- Auto-scrolls to first match on search start

### Cross-Chat Search

From the sidebar or a global search (future), search across all chats:

```
GET /api/messages/search?q=<query>&chatId=<optional>&role=<optional>&
    hasAttachment=<optional>&attachmentType=<optional>&
    dateFrom=<optional>&dateTo=<optional>&limit=50&offset=0
```

```typescript
interface MessageSearchResult {
  messageId: string;
  chatId: string;
  chatName: string;
  role: "user" | "character" | "assistant" | "system";
  content: string; // full content
  matchContext: string; // highlighted snippet
  createdAt: string;
  attachments?: MessageAttachment[];
  matchScore: number; // relevance score (FTS)
}
```

**Search result UI:**

- List of matching messages, grouped by chat
- Each result shows: avatar, role badge, chat name, snippet with highlights
- Click result → navigate to that chat, scroll to message, flash-highlight
- Pagination (infinite scroll or load-more)

### Specialized Filters

#### Find Assets in Chat

Filter messages that contain attachments:

```
GET /api/messages/search?chatId=<id>&hasAttachment=true&attachmentType=image
```

Attachment types: `image`, `audio`, `video`, `document`, `archive`

**UI:** "📎 Assets" button in chat search → shows only messages with
attachments, filterable by type. Grid or list view of asset thumbnails.

#### Find Links / Music

Regex-based search for URL patterns in messages:

```
GET /api/messages/search?chatId=<id>&linkPattern=youtube|spotify|soundcloud
```

**UI:** "🔗 Links" button in chat search → shows messages containing URLs,
filterable by domain. Audio links get a special music note icon.

**Common link patterns:**

- Music: youtube.com, spotify.com, soundcloud.com, bandcamp.com
- Images: imgur.com, i.redd.it, pixiv.net
- Documents: docs.google.com, notion.so

#### Find by Role

Filter messages by sender:

| Filter    | Description                    |
| --------- | ------------------------------ |
| All       | All roles                      |
| User      | Messages from the current user |
| Character | Messages from AI characters    |
| Assistant | Messages from the assistant/GM |
| System    | System/narration messages      |

### Search Performance

| Scope           | Engine             | Notes                               |
| --------------- | ------------------ | ----------------------------------- |
| In-chat (v1)    | LIKE + trigram     | Adequate for <10K messages per chat |
| Cross-chat (v1) | FTS5 virtual table | SQLite FTS5 with porter tokenizer   |
| Cross-chat (v2) | PG full-text       | When migrating to Postgres          |

**Index:** `messages_fts` virtual table on `content` column, updated on
message insert/edit. Rebuild on migration.

---

## Integration Points

- **Chat list panel** (`src/views/chat-list-panel.html`): integrates sidebar
  search + filter chips
- **Chat header**: integrates in-chat search bar
- **Message list**: handles highlight rendering, scroll-to-match
- **HTMX**: search results loaded via hx-get, hx-trigger="input changed delay:300ms"
- **Alpine.js**: filter state management, localStorage persistence

## Files

### Create

- `src/routes/chat-search.ts` — search endpoints (chat search, message search)
- `src/db/fts.ts` — FTS5 setup, index management

### Modify

- `src/views/chat-list-panel.html` — add search input + filter chips
- `src/views/chat.html` — add in-chat search bar
- `src/frontend/alpine/chat-search.ts` — search state, debounce, navigation
- `src/routes/views.ts` — register search HTMX routes
- `src/db/migrations/` — FTS5 virtual table migration

## Related

- Epic 13 (Frontend Responsive) — existing chat list search
- Epic 24 (Filtering & Pagination) — general filter infrastructure
- Epic 36 (Chat Lifecycle) — context management
- Epic 41 (Chat Transfer) — location-aware search
- `TASK-chat-room-search-join.md` — implementation task
- `TASK-chat-room-filters.md` — implementation task
- `TASK-chat-message-search.md` — implementation task
