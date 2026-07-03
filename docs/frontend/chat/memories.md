# Chat: Memory System

## Overview

A persistent memory layer that allows characters and the assistant to recall information across chat sessions. Backed by a vector database (or structured storage for v1). Users have granular control over which memories persist and which are discarded.

---

## Memory Types

| Type                   | Managed by                  | Scope                                               | Persistence                                             |
| ---------------------- | --------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| **Character memories** | LLM extracts + user curates | Per character, across all chats with that character | Survives chat deletion, deleted if character is deleted |
| **Assistant memories** | LLM extracts + user curates | Per user, across all chats                          | User-level, persists across all chats                   |
| **World memories**     | Game master / admin only    | Per world, canonical lore                           | Admin-managed, edited via world editor                  |

---

## How Memories Are Created

**Automatic extraction**: after each AI response, the LLM is prompted to extract key facts from the conversation. Extracted facts are stored as discrete memory entries with:

- Content (the fact itself, e.g., "The player's character is afraid of fire")
- Source message ID (for traceability)
- Confidence score (LLM-generated)
- Timestamp
- Category (optional, auto-assigned)

**Manual creation**: users can create memories directly via the chat interface:

- "Remember this" action on a message (selects the message content as a memory)
- Free-form memory entry in the memory panel

---

## Memory Selection & Carrying Forward

When starting a new chat with a character, the user can choose which memories to carry forward:

**Default behavior**: all memories for the character are injected into the new chat's context. The user can override this:

- **Start fresh**: no memories carried forward. The character remembers nothing.
- **Selective carry**: the user picks specific memories from a list. Only those are included.
- **Full carry**: all memories are included (default).

**UI**: the memory selection happens during the "Detailed setup" chat creation flow (`/character/:slug/create`). A "Memories" section shows:

- A list of all memories for this character, grouped by category
- Each memory has a checkbox (default: checked)
- Select all / Deselect all toggle
- "Add new memory" button (free-form text input)
- Preview of how many memories will be included (and estimated token cost)

**Mid-chat memory management**: the user can:

- View all memories for the current character via the right panel or a dedicated memory panel
- Delete individual memories (they are removed from future context but remain in the DB for traceability)
- Add new memories manually
- Toggle memory inclusion on/off for the current chat (does not affect other chats)

---

## Memory Panel

Accessible from the right panel or the More menu in the chat header. Shows:

- **Tab 1: Character memories** — all memories for the current character
  - List with search/filter
  - Each entry: content, category tag, confidence badge, source message link, timestamp
  - Actions: Edit, Delete, "Pin" (always include, never auto-purge)
  - "Add memory" button

- **Tab 2: Assistant memories** — memories the assistant has about the user
  - Same structure, but user-level (persists across all chats)
  - Only visible to the user (not shared with other users in multi-user mode)

- **Tab 3: World memories** (if chat is linked to a world)
  - Read-only for non-admin users
  - Admin users can edit, add, delete world memories
  - World memories are canonical — they override character and assistant memories in case of conflict

---

## Memory Limits & Auto-Purge

To control context window usage:

- **Token budget**: a configurable maximum token allocation for memories (default: 1024 tokens)
- **Priority**: when the budget is exceeded, lower-confidence memories are dropped first. Pinned memories are never dropped.
- **Auto-purge**: if a memory hasn't been referenced in the last N chats (configurable, default 10), it's marked as "stale" and may be dropped when budget is exceeded
- **User notification**: in Detailed mode, the memory panel shows token usage (e.g., "247 / 1024 tokens used")

---

## World Memories

World memories are managed exclusively by the game master / admin:

- Created via the world editor (not from chat)
- Contain canonical lore, rules, and historical facts about the world
- Are injected into the context of ALL chats linked to that world
- Non-admin users cannot add, edit, or delete world memories
- World memories are read-only in the chat memory panel
- Tracked separately from character/assistant memories in the token budget

---

## Implementation Notes (v1)

- v1 uses structured storage (JSON fields in the chat/character/world record) rather than a vector DB. This limits recall to exact-match queries but avoids the complexity of embedding pipelines.
- Vector DB integration is planned for v2, enabling semantic search ("find the memory about the fire incident").
- Memory extraction runs as a background task after each AI response. The user doesn't wait for it.
- Extracted memories are reviewed by the user before being committed (in Basic and Detailed modes). In Immersion mode, extraction happens silently and memories are visible in the panel for review.
