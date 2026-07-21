# TASK: Chat Autorenaming

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** Epic 36 (Chat Lifecycle)
**Tags:** chat, rename, llm, ux
**Spec:** `docs/frontend/chat/overview.md` (Chat Data Model)

## Summary

Automatically rename chats based on conversation context. Extracts a
descriptive title from the first few messages (character name + key topic)
using an LLM call or rule-based heuristic.

## Rationale

- Default chat names are "Chat with {Character}" — not helpful when you
  have 10 chats with the same character
- Auto-generated names like "Elara — The Dark Forest Quest" are
  immediately recognizable
- SillyTavern has this feature — users expect it
- Low effort, high daily-use value

## Current State

- Chats have no explicit `name` column — display uses character name
- Chat list shows "Character Name" for each row
- No auto-rename logic exists
- No LLM call for title generation

## Architecture

### Rename Strategy

Two approaches, both optional:

**1. Rule-based (v1, default):**
- Extract character name from chat participants
- Extract first location name from chat context (if world-linked)
- Combine: `"Character — Location"` or `"Character — First topic words"`
- No LLM call needed

**2. LLM-based (v2, optional):**
- Send first 3-5 messages to LLM with rename prompt
- LLM generates a short title (max 40 chars)
- Cost: ~100 tokens per rename (negligible)

### Trigger Points

| Trigger                | Behavior                                  |
| ---------------------- | ----------------------------------------- |
| After first exchange   | Auto-rename after user + character both sent a message |
| On-demand              | User clicks "Rename" in chat settings     |
| On location change     | Append location to name (if sectioning enabled) |
| Manual override        | User-set name is never overwritten        |

### Data Model

```typescript
// Add to chats table
interface Chat {
  // ... existing fields
  name?: string;           // user-set or auto-generated name
  name_source?: "manual" | "auto-rule" | "auto-llm";
  renamed_at?: string;
}
```

### Rename Prompt (LLM-based)

```
Generate a short, descriptive chat title (max 40 characters) for this
conversation. Include the character name and the main topic. Do not
use quotes or punctuation at the end.

Character: {characterName}
Messages:
{first 3-5 messages, truncated to 200 chars each}

Title:
```

## Tasks

### Phase 1: Schema & Rule-Based

- [ ] Add `name`, `name_source`, `renamed_at` columns to chats table
- [ ] Create migration
- [ ] Implement rule-based rename: `"Character — Topic"` from first messages
- [ ] Auto-trigger after first user+character exchange
- [ ] Display name in chat list (fallback to character name if no name)

### Phase 2: LLM-Based Rename

- [ ] Create `src/chat/auto-rename.ts` — rename logic
- [ ] Implement LLM-based rename with prompt template
- [ ] Add rename endpoint: `POST /api/chats/:id/rename`
- [ ] Add settings: enable/disable, method (rule/LLM), max length
- [ ] Token budget check (skip if context window tight)

### Phase 3: UI Integration

- [ ] Show auto-generated name in chat list
- [ ] Add "Rename" option in chat settings / context menu
- [ ] Manual rename: text input, saves as `name_source: "manual"`
- [ ] Show name source indicator (optional, debug info)
- [ ] Name update animation (smooth text transition)

## Files to Create

- `src/chat/auto-rename.ts` — rename logic (rule + LLM)

## Files to Modify

- `src/db/migrations/` — add name columns to chats
- `src/routes/chats.ts` — rename endpoint, name in responses
- `src/views/chat-list-panel.html` — display chat name
- `src/views/chat.html` — rename option in settings
- `src/frontend/alpine/chat.ts` — name state

## Acceptance Criteria

- [ ] Chat list shows descriptive names instead of "Chat with X"
- [ ] Rule-based rename works without LLM call
- [ ] LLM-based rename generates concise, accurate titles
- [ ] Manual rename overrides auto-name
- [ ] Auto-rename triggers after first exchange (if enabled)
- [ ] Rename setting is per-user (persisted in settings)
- [ ] No rename if user has disabled it

## Risk

Low — straightforward feature. LLM rename adds minimal cost. Rule-based
fallback ensures it works without any LLM configured.
