# Chat: Export & Sharing

## Overview

Chats can be exported for sharing outside the app, published as curated
stories, or shared as read-only links. This covers portability, social
sharing, and content preservation.

## Export Formats

### Markdown Export

Exports the chat as formatted markdown, suitable for sharing in Discord,
GitHub gists, blogs, or personal archives.

**What's included:**

- Chat name, participants, creation date
- Messages in chronological order (active path only, no archived/swipes)
- Character names as headers
- Metadata: timestamps, token counts (optional)

**What's excluded:**

- System messages (generation attempts, tool calls)
- Archived messages
- Swipe variants (only the active path)

**Format:**

```markdown
# Chat: The Lost Temple of Ares

**Participants:** Alice (user), Lyra (character)
**World:** Forgotten Realm
**Date:** 2026-01-15

---

**Alice:** I push open the heavy stone door.

**Lyra:** The door groans as it yields to your touch. Inside, the air is thick
with the scent of ancient dust and something else — ozone, maybe. Magic.

**Alice:** I step inside cautiously.

**Lyra:** Your boots echo on the worn flagstones. Torches flicker to life along
the walls as you enter, illuminating a vast chamber...
```

### JSON Export

Machine-readable format for import into other instances or tools.

```json
{
  "spec": "loop-lore-chat-v1",
  "chat": {
    "name": "The Lost Temple of Ares",
    "created_at": "2026-01-15T10:00:00Z",
    "world": "Forgotten Realm",
    "participants": [
      { "name": "Alice", "type": "user" },
      { "name": "Lyra", "type": "character" }
    ]
  },
  "messages": [
    {
      "id": "msg-uuid",
      "parent_id": null,
      "actor": "Alice",
      "content": "I push open the heavy stone door.",
      "timestamp": "2026-01-15T10:00:00Z"
    }
  ]
}
```

### PDF Export (Future)

Formatted PDF with chapter headers, character portraits, and page numbers.
Useful for printing or archival.

## API Endpoints

```
GET /api/chats/:id/export?format=markdown
Response: 200
Content-Type: text/markdown
Content-Disposition: attachment; filename="chat-export.md"

GET /api/chats/:id/export?format=json
Response: 200
Content-Type: application/json
Content-Disposition: attachment; filename="chat-export.json"
```

## Chat Sharing (Read-Only Link)

Generate a read-only link that lets anyone view the chat without an account
(or with a different account).

### Share Settings

| Setting          | Options                     | Default    |
| ---------------- | --------------------------- | ---------- |
| Visibility       | `unlisted` / `public`       | `unlisted` |
| Expiry           | 1h / 24h / 7d / 30d / never | `24h`      |
| Include metadata | on/off                      | `on`       |

- **Unlisted:** accessible only via the direct link, not discoverable
- **Public:** listed on a "Shared Stories" page (future)

### Share API

```
POST /api/chats/:id/share
Body: {
  "visibility": "unlisted",
  "expires_in": "24h"
}
Response: 201
{
  "share_id": "share-uuid",
  "url": "/shared/share-uuid",
  "expires_at": "2026-01-16T10:00:00Z"
}

DELETE /api/chats/:id/share/:shareId
Response: 204
```

### Share Viewer

The shared chat renders as a read-only view:

- No input area, no toolbar, no sidebars
- Messages displayed in a clean, scrollable layout
- Character names styled with their colors
- "Powered by loop-lore" footer with link to instance

## Chat Publishing (Curated Stories)

Publish a chat as a curated story — the author selects which messages to
include, reorders if needed, and adds editorial notes.

### Publish Flow

1. Author opens "Publish" dialog from chat settings
2. Selects messages to include (checkbox per message)
3. Adds optional title, cover image, author notes
4. Publishes → generates a static page

### Published Story Page

```
GET /stories/:storySlug
```

- Clean reading layout, no chat UI
- Table of contents (auto-generated from message breaks)
- Character list with avatars
- Author notes at top and between sections

This is a future feature — MVP uses markdown export only.

## Chat Import

Import a markdown or JSON export into a new chat.

```
POST /api/chats/import
Content-Type: application/json
Body: {
  "format": "json",
  "data": { ...exported JSON... },
  "world_id": "optional-world-uuid"
}
Response: 201
{ "chat_id": "new-chat-uuid" }
```

Import validates:

- All actor references resolve (or creates stub characters)
- Message tree structure is valid
- No duplicate IDs

Markdown import parses the header format and creates a basic linear chat
(no tree branching).
