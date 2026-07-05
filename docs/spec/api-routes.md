# API Route Contract

## Conventions

### URL Structure

```
/api/{resource}        — collection
/api/{resource}/:id   — single entity
```

### Response Envelopes

All endpoints follow the standard envelope defined in [Error Envelope Spec](./error-envelope.md):

- **Success**: `{ ...data }` (200), `{ id }` (201), `{ data, pagination }` (200, paginated), empty (204)
- **Error**: `{ error, code, details? }` — see full table in error-envelope.md

### Pagination

Query: `?page=1&pageSize=50` (default page=1, pageSize=50, max 200)

Response:

```json
{
  "data": [...],
  "pagination": {
    "total": 142,
    "page": 1,
    "pageSize": 50,
    "totalPages": 3
  }
}
```

### Auth

- All API endpoints require `Authorization: Bearer <token>` except auth routes
- Auth middleware populates `RequestContext { userId, userRole, sessionId }`
- Admin-only endpoints marked 🔒
- Asset download uses signed URLs (token in query param) — see Assets section

---

## Existing Routes (already implemented)

### Age Gate

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/api/age-gate/status` | No | Check if age gate applies |
| POST | `/api/age-gate/accept` | No | `body: { birthDate: "YYYY-MM-DD" }` → 200 or 403 |

### Admin Age Gate 🔒

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/api/admin/age-gate` | Admin | View runtime config |
| PUT | `/api/admin/age-gate` | Admin | `body: { enabled?, minimumAge?, mode? }` → update runtime |

### Generation Control

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | `/api/generation/cancel` | Yes | `body: { chatId }` or `{ attemptId }` |
| GET | `/api/generation/status/:chatId` | Yes | Current gen status for chat |
| GET | `/api/generation/active` | Admin | List all active generations |
| POST | `/api/generation/retry` | Yes | `body: { messageId, chatId, step? }` → retry failed gen from optional step index |
| POST | `/api/generation/continue` | Yes | `body: { messageId, chatId }` → continue partial |
| POST | `/api/generation/regenerate` | Yes | `body: { messageId, chatId }` → replace AI response |

---

## Planned CRUD Routes

### Sessions / Auth

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| POST | `/api/auth/login` | No | `{ username, password }` | `{ token, user: {...} }` |
| POST | `/api/auth/logout` | Yes | — | 204 |
| GET | `/api/auth/me` | Yes | — | `{ id, username, displayName, role }` |

> **Note:** Registration (`POST /api/auth/register`) is NOT implemented. No `/api/sessions` routes exist.

### Users

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/users` | Admin | `?page&pageSize` | Paginated list |
| GET | `/api/users/:id` | Yes | — | User object |
| PUT | `/api/users/:id` | Yes† | `{ displayName?, settings? }` | Updated user |
| DELETE | `/api/users/:id` | Admin | — | 204 |
| PUT | `/api/users/:id/settings` | Yes† | `{ ...partial settings }` | Updated settings |

† User can only update their own profile. Admin can update any.

### Chats

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/chats` | Yes | `?page&pageSize` | Paginated list (user's chats) |
| POST | `/api/chats` | Yes | `{ name, type?, mode?, participantIds?, worldId? }` | `{ id }` + 201 |
| GET | `/api/chats/:id` | Yes | — | Chat + participants |
| PUT | `/api/chats/:id` | Yes† | `{ name?, mode?, turnStrategy?, worldId? }` | Updated chat |
| DELETE | `/api/chats/:id` | Yes† | — | 204 |
| GET | `/api/chats/:id/participants` | Yes | — | `[{ actor, role }]` |
| POST | `/api/chats/:id/participants` | Yes† | `{ actorId, role? }` | `{ id }` + 201 |
| DELETE | `/api/chats/:id/participants/:actorId` | Yes† | — | 204 |

† Owner or admin only for mutations. Participants can GET.

```json
// POST /api/chats body
{
  "name": "Campaign Chat",
  "type": "direct",
  "mode": "story",
  "participantIds": ["actor-uuid-1", "actor-uuid-2"],
  "worldId": "world-uuid",
  "currentLocationId": "loc-uuid",
  "turnStrategy": "round_robin",
  "gmConfig": { "narratorStyle": "descriptive", "enforceRules": true }
}
```

### Messages

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/chats/:id/messages` | Yes | `?page&pageSize&parentId&before` | Paginated list |
| POST | `/api/chats/:id/messages` | Yes | `{ content, role?, contentType?, parentId?, idempotencyKey? }` | `{ id }` + 201 |
| GET | `/api/messages/:id` | Yes | — | Message object |
| GET | `/api/messages/:id/variants` | Yes | — | List sibling variants (swipe options) |
| PUT | `/api/messages/:id/variant` | Yes† | `{ variantIndex: number }` | Select active variant (swipe) |
| DELETE | `/api/messages/:id` | Yes† | — | 204 |
| PUT | `/api/messages/:id/visibility` | Yes† | `{ visibility, reason? }` | Update visibility |
| PUT | `/api/messages/:id/status` | Admin | `{ status: "rejected"\|"confirmed" }` | Force status transition |

Message content is immutable after creation. To correct a message: regenerate (swipe) or delete and resend.
† Owner, chat participant, or admin.

```json
// POST /api/chats/:id/messages body
{
  "content": "Hello world",
  "role": "user",
  "contentType": "text",
  "parentId": null,
  "idempotencyKey": "client-gen-uuid"
}
```

Message listing: ordered by `created_at ASC`. `parentId` filter returns children of a specific message (tree). `before` param returns messages before a given timestamp.

### Actors (Characters)

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/actors` | Yes | `?page&pageSize&type` | Paginated list (user's + public) |
| POST | `/api/actors` | Yes | `{ displayName, actorType?, agentType?, description?, systemPrompt?, ... }` | `{ id }` + 201 |
| GET | `/api/actors/:id` | Yes | — | Actor object |
| PUT | `/api/actors/:id` | Yes† | `{ displayName?, description?, systemPrompt?, settings? }` | Updated actor |
| DELETE | `/api/actors/:id` | Yes† | — | 204 |
| GET | `/api/actors/:id/card` | Yes | `?format=v2` | Character card JSON (ST v2) |
| POST | `/api/actors/import` | Yes | `multipart/form-data: { file }` or `{ card: {...JSON...} }` | `{ id }` + 201 |

† Owner or admin. `type` filter: `?type=character` to list only characters.

### Actor Memories

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/actors/:id/memories` | Yes | `?type&page&pageSize` | Paginated list (type filter: episodic/semantic/procedural) |
| POST | `/api/actors/:id/memories` | Yes† | `{ content, type, priority?, tags? }` | `{ id }` + 201 |
| DELETE | `/api/actors/:id/memories/:memoryId` | Yes† | — | 204 |
| PUT | `/api/actors/:id/memories/:memoryId` | Yes† | `{ content?, priority?, tags? }` | Updated memory |

† Owner or admin.

```json
// POST /api/actors body
{
  "displayName": "Gandalf",
  "actorType": "character",
  "agentType": "ai",
  "description": "A wise wizard...",
  "systemPrompt": "You are Gandalf the Grey...",
  "settings": { "temperature": 0.7 }
}
```

### Worlds

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/worlds` | Yes | `?page&pageSize` | Paginated list |
| POST | `/api/worlds` | Yes | `{ name, description?, lore? }` | `{ id }` + 201 |
| GET | `/api/worlds/:id` | Yes | — | World object |
| PUT | `/api/worlds/:id` | Yes† | `{ name?, description?, lore? }` | Updated world |
| DELETE | `/api/worlds/:id` | Yes† | — | 204 |

† Owner or admin.

### World Locations

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/worlds/:id/locations` | Yes | `?page&pageSize` | Paginated list of locations |
| POST | `/api/worlds/:id/locations` | Yes† | `{ name, description?, parentLocationId?, connections? }` | `{ id }` + 201 |
| GET | `/api/worlds/:id/locations/:locId` | Yes | — | Location object |
| PUT | `/api/worlds/:id/locations/:locId` | Yes† | `{ name?, description?, parentLocationId?, connections? }` | Updated location |
| DELETE | `/api/worlds/:id/locations/:locId` | Yes† | — | 204 |

† World owner or admin.

### Assets

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/assets` | Yes | `?page&pageSize&type` | Paginated list |
| POST | `/api/assets` | Yes | `multipart/form-data: { file }` + `{ entityType?, entityId?, label? }` | `{ id }` + 201 |
| GET | `/api/assets/:id` | Yes | — | Asset metadata |
| GET | `/api/assets/:id/download` | Signed URL | — | Binary file with Content-Type |
| DELETE | `/api/assets/:id` | Yes† | — | 204 |
| POST | `/api/assets/:id/links` | Yes | `{ entityType, entityId, label? }` | `{ id }` + 201 |
| DELETE | `/api/assets/:id/links/:linkId` | Yes† | — | 204 |

† Owner or admin.
> **Note:** Signed URL system is NOT implemented. Asset downloads use `/api/assets/:id/raw` with standard Bearer auth.
> Signed URLs are aspirational (post-MVP).

---

## View Routes (Not API)

Served as static files from `dist/public/`:

| Path | File | Description |
|------|------|-------------|
| `/` | `index.html` | Landing |
| `/chat` | `chat.html` | Chat UI |
| `/settings` | `settings.html` | Settings |
| `/gallery` | `gallery.html` | Gallery |

Future: htmx partials under `/views/chat/messages`, `/views/chat/list`, etc.

---

## Notes

- All IDs are UUID v4 strings
- Timestamps are ISO 8601 strings (UTC)
- Boolean fields in JSON: `true`/`false`
- Content encoding is transparent to API layer — encoding happens at storage layer
- Encryption is transparent to API layer — payloads sent/received as plaintext
- Idempotency keys: client-generated UUID, server dedup within expiry window
