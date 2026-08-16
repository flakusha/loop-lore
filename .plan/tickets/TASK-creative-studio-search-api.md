<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Task: Unified Search API Endpoint

**Epic:** epic-creative-studio.md (MVP Tier 1)
**Status:** ⬜ Not Started
**Effort:** Medium
**Depends On:** —

## Goal

Create a single search endpoint that searches across notes, memories, items, worlds, and locations for an actor.

## Acceptance Criteria

- [ ] `GET /api/actors/:actorId/search` returns unified results
- [ ] Query parameter `q` for full-text search across all types
- [ ] Filter by `type` (notes, memories, items, worlds, locations)
- [ ] Filter by `chat_id` (items linked to this chat)
- [ ] Filter by `interaction_id` (items from this turn)
- [ ] Filter by `status` (active, inactive, expired, all)
- [ ] Sort by `relevance` (default), `created_at`, `updated_at`, `ttl_remaining`
- [ ] Faceted response with counts per type, chat, status
- [ ] Pagination with `limit` and `offset`

## Implementation

- Create `src/routes/search.ts`
- Register in `src/elysia-app.ts`
- Query each item type and merge results
- Calculate relevance score for full-text matches
- Return unified response format

## API Contract

```json
{
  "results": [
    {
      "type": "notes|memories|items|worlds|locations",
      "id": "uuid",
      "title": "string",
      "content": "string",
      "category": "string",
      "status": "active|inactive|expired",
      "created_at": "ISO datetime",
      "chat_ids": ["chat-uuid"],
      "relevance_score": 0.92
    }
  ],
  "facets": {
    "types": { "notes": 15, "memories": 23 },
    "chats": { "chat-789": 12 },
    "statuses": { "active": 30, "expired": 11 }
  },
  "total": 46
}
```

## Files to Create/Modify

- `src/routes/search.ts` (new)
- `src/elysia-app.ts` (mount route)
