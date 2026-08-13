# API Reference

## Authentication

Bearer tokens in `Authorization: Bearer <token>` header. Token is UUID v4. Server stores SHA-256 hash in `sessions` table. See `docs/spec/auth-middleware.md`.

## Base URL

All endpoints prefixed with `/api/`.

## Users

### Get Current User

`GET /api/users/me` — returns `{ id, username, displayName, role, createdAt }`

### Update Profile

`PUT /api/users/me` — body: `{ displayName, settings }`. Username immutable.

### Get User by ID

`GET /api/users/:userId`

## Authentication

### Login

`POST /api/auth/login` — body: `{ username, password }` — returns `{ token, user }`

### Logout

`POST /api/auth/logout` — 204 No Content

### Me

`GET /api/auth/me` — returns `{ id, username, displayName, role }`

## Chats

### List

`GET /api/chats` — paginated user's chats

### Create

`POST /api/chats` — body: `{ name, type, mode, participantIds, worldId }` — returns `{ id }` 201

### Get

`GET /api/chats/:chatId` — chat object with participants

### Update

`PUT /api/chats/:chatId` — body: `{ name, mode }`

### Delete

`DELETE /api/chats/:chatId` — 204

### Move Location

`PUT /api/chats/:chatId/location` — body: `{ locationId }` — null clears location

## Messages

### List

`GET /api/chats/:chatId/messages` — query: `page`, `pageSize` (max 200), `parentId`

### Send

`POST /api/chats/:chatId/messages` — body: `{ content, role, contentType, parentId, idempotencyKey }` — returns `{ id }` 201

### Update Visibility

`PUT /api/messages/:messageId/visibility` — body: `{ visibility, reason }`

### Delete

`DELETE /api/messages/:messageId` — 204

## Characters

### Get

`GET /api/actors/:id` — actor object

### Create

`POST /api/actors` — body: `{ displayName, actorType, agentType, description, systemPrompt }` — returns `{ id }` 201

### Update

`PUT /api/actors/:id` — body: updated fields

### Delete

`DELETE /api/actors/:id` — 204

## Worlds

### List

`GET /api/worlds` — paginated list

### Create

`POST /api/worlds` — body: `{ name, description, locationCount, kind, visibility }` — returns `{ id }` 201

### Get

`GET /api/worlds/:worldId`

### Update

`PUT /api/worlds/:worldId`

### Delete

`DELETE /api/worlds/:worldId` — deletes world + all locations, states, quests, items — 204

### Initialize States

`POST /api/worlds/:worldId/initialize-states` — creates default state records for all locations and NPCs

## World Locations

### List

`GET /api/worlds/:worldId/locations`

### Create

`POST /api/worlds/:worldId/locations` — body: `{ name, description, connections, parentLocationId }` — connection IDs validated against same world

### Get

`GET /api/worlds/:worldId/locations/:locationId`

### Update

`PUT /api/worlds/:worldId/locations/:locationId`

### Delete

`DELETE /api/worlds/:worldId/locations/:locationId` — 204

## Assets

### Upload

`POST /api/assets` — multipart `file` (+ optional `alt_text`, `chat_id`) — returns `{ id, filename, mime_type, asset_type, size_bytes, storage_backend, alt_text }`, 201 (200 with `duplicate: true` if the same file already exists).

### List

`GET /api/assets?entity_type=image&entity_id=...&label=...` — paginated; filters by `entity_type`, `entity_id`, `label` plus standard pagination.

### Link

`POST /api/assets/:assetId/links` — body: `{ entityType, entityId, label }` — returns `{ id }` 201

### Unlink

`DELETE /api/assets/:assetId/links/:linkId` — 204

### Delete

`DELETE /api/assets/:assetId` — 204

### Serve

`GET /api/assets/:assetId/raw` — original file
`GET /api/assets/:assetId/compressed` — compressed variant
`GET /api/assets/:assetId/thumb` — thumbnail (images only)

Auth required. Asset downloads use direct paths (no signed URLs).

## Error Responses

All errors follow `{ error: { message, code, details? } }`. Common codes:

- `VALIDATION_ERROR` — invalid request data
- `UNAUTHORIZED` — missing/invalid auth
- `FORBIDDEN` — insufficient permissions
- `NOT_FOUND` — resource not found
- `CONFLICT` — resource conflict (e.g. duplicate username)
- `INTERNAL_ERROR` — unexpected server error

## Rate Limiting

429 response: `{ error: { message: "Rate limit exceeded", code: "RATE_LIMITED", details: { limit, remaining, reset } } }`

## Pagination

Query params: `page` (default 1), `pageSize` (default 50, max 200). Response: `{ data: [...], pagination: { total, page, pageSize, totalPages } }`
