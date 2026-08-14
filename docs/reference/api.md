# API Reference

## Authentication

Bearer tokens in `Authorization: Bearer [REDACTED:Authorization header] header. Token is UUID v4. Server stores SHA-256 hash in `sessions` table. See `docs/spec/auth-middleware.md`.

## Base URL

All endpoints prefixed with `/api/v1/` (versioned; see `docs/spec/api-versioning.md`).

## Health

### Health Check

`GET /api/v1/health` — returns `{ status: "ok" }`

## Authentication Endpoints

### Login

`POST /api/v1/auth/login` — body: `{ username, password }` — returns `{ token, user }`

### Demo Login

`POST /api/v1/demo-login` — returns `{ token, user }` (demo mode only)

### Register

`POST /api/v1/auth/register` — body: `{ username, password, displayName }` — returns `{ token, user }`

### Logout

`POST /api/v1/auth/logout` — 204 No Content

### Me

`GET /api/v1/auth/me` — returns `{ id, username, displayName, role }`

## Users

### Get Current User

`GET /api/v1/users/me` — returns `{ id, username, displayName, role, createdAt }`

### Update Current User

`PUT /api/v1/users/me` — body: `{ displayName, settings }`. Username immutable.

### Get Current User Settings

`GET /api/v1/users/me/settings` — returns user settings object

### Update Current User Settings

`PUT /api/v1/users/me/settings` — body: settings fields

### Get User by ID

`GET /api/v1/users/:id`

### Update User

`PUT /api/v1/users/:id` — admin only

### Delete User

`DELETE /api/v1/users/:id` — admin only, 204

### Get User Settings

`GET /api/v1/users/:id/settings` — admin only

### Update User Settings

`PUT /api/v1/users/:id/settings` — admin only

## Chats

### List

`GET /api/v1/chats` — paginated user's chats

### Create

`POST /api/v1/chats` — body: `{ name, type, mode, participantIds, worldId }` — returns `{ id }` 201

### Get

`GET /api/v1/chats/:id` — chat object with participants

### Update

`PUT /api/v1/chats/:id` — body: `{ name, mode }`

### Delete

`DELETE /api/v1/chats/:id` — 204

### Rename

`PUT /api/v1/chats/:id/rename` — body: `{ name }`

### Migrate

`PUT /api/v1/chats/:id/migrate` — migrate chat schema

### Move Location

`PUT /api/v1/chats/:id/location` — body: `{ locationId }` — null clears location

### Set Persona

`PUT /api/v1/chats/:id/persona` — body: `{ personaId }`

### Set Impersonate

`PUT /api/v1/chats/:id/impersonate` — body: `{ actorId }`

### Mark Read

`PUT /api/v1/chats/:id/mark-read` — marks chat as read

### Batch Archive

`POST /api/v1/chats/batch/archive` — body: `{ chatIds }`

### Batch Delete

`POST /api/v1/chats/batch/delete` — body: `{ chatIds }`

### Batch Export

`POST /api/v1/chats/batch/export` — body: `{ chatIds }`

### Participants

`GET /api/v1/chats/:id/participants` — list participants

### Add Participant

`POST /api/v1/chats/:id/participants` — body: `{ actorId, role }`

### Update Participant

`PUT /api/v1/chats/:id/participants/:actorId` — body: `{ role }`

### Remove Participant

`DELETE /api/v1/chats/:id/participants/:actorId` — 204

### Pins — List

`GET /api/v1/chats/:id/pins` — list pinned messages

### Pin Message

`POST /api/v1/chats/:id/pins` — body: `{ messageId }`

### Unpin Message

`DELETE /api/v1/chats/:id/pins/:pinId` — 204

### Chat Setup Templates — List

`GET /api/v1/chat-setup-templates` — list templates

### Create Template

`POST /api/v1/chat-setup-templates` — body: template fields

### Invites — List

`GET /api/v1/chats/:id/invites` — list chat invites

### Create Invite

`POST /api/v1/chats/:id/invites` — body: `{ expiresAt, maxUses }`

### Delete Invite

`DELETE /api/v1/chats/:id/invites/:inviteId` — 204

### Join by Invite

`POST /api/v1/invites/:code/join` — join chat via invite code

### VN Choices — List

`GET /api/v1/chats/:id/vn-choices` — list VN choice cards

### Create VN Choice

`POST /api/v1/chats/:id/vn-choices` — body: choice card fields

### Select VN Choice

`POST /api/v1/chats/:id/vn-choices/:choiceId/select` — select a choice

### VN Choice History

`GET /api/v1/chats/:id/vn-choices/history` — VN choice history

### Story Turns — List

`GET /api/v1/chats/:id/story-turns` — list story turns

### Get Story Turn

`GET /api/v1/chats/:id/story-turns/:turnId` — get specific turn

### Encryption Key

`GET /api/v1/chats/:id/encryption-key` — get chat encryption key

### Chat Activity

`GET /api/v1/chats/activity` — recent chat activity

## Messages

### List

`GET /api/v1/chats/:id/messages` — query: `page`, `pageSize` (max 200), `parentId`

### Send

`POST /api/v1/chats/:id/messages` — body: `{ content, role, contentType, parentId, idempotencyKey }` — returns `{ id }` 201

### Get

`GET /api/v1/messages/:id` — single message

### Update

`PUT /api/v1/messages/:id` — body: `{ content }`

### Delete

`DELETE /api/v1/messages/:id` — 204

### Update Visibility

`PUT /api/v1/messages/:id/visibility` — body: `{ visibility, reason }`

### Update Status

`PUT /api/v1/messages/:id/status` — body: `{ status }`

### Archive

`PUT /api/v1/messages/:id/archive` — archive message

### Restore

`PUT /api/v1/messages/:id/restore` — restore archived message

### Purge Chat Messages

`DELETE /api/v1/chats/:id/messages/purge` — purge all messages in chat

### Variants — List

`GET /api/v1/messages/:id/variants` — list message variants

### Get Variant

`GET /api/v1/messages/:id/variant` — get specific variant

### Reactions — List

`GET /api/v1/messages/:id/reactions` — list reactions

### Add Reaction

`POST /api/v1/messages/:id/reactions` — body: `{ emoji }`

### Remove Reaction

`DELETE /api/v1/messages/:id/reactions` — body: `{ emoji }`

### Quick Emojis

`GET /api/v1/messages/quick-emojis` — list quick emoji shortcuts

## Characters / Actors

### List

`GET /api/v1/actors` — paginated list

### Create

`POST /api/v1/actors` — body: `{ displayName, actorType, agentType, description, systemPrompt }` — returns `{ id }` 201

### Get

`GET /api/v1/actors/:actorId` — actor object

### Update

`PUT /api/v1/actors/:actorId` — body: updated fields

### Delete

`DELETE /api/v1/actors/:actorId` — 204

### Get Card

`GET /api/v1/actors/:actorId/card` — character card (V2/V3 format)

### Export

`GET /api/v1/actors/:actorId/export` — export character data

### Availability — List

`GET /api/v1/actors/:actorId/availability` — list character availability slots

### Set Availability

`POST /api/v1/actors/:actorId/availability` — body: availability fields

### Delete Availability

`DELETE /api/v1/actors/:actorId/availability` — 204

### Emotion Avatars — Jobs List

`GET /api/v1/actors/:actorId/emotion-avatars/jobs` — list avatar generation jobs

### Get Job Status

`GET /api/v1/actors/:actorId/emotion-avatars/jobs/:jobId` — job status

### Cancel Job

`POST /api/v1/actors/:actorId/emotion-avatars/jobs/:jobId/cancel` — cancel job

### Generate Emotion Avatar

`POST /api/v1/actors/:actorId/emotion-avatars` — body: `{ emotion, provider }`

### Emotion Prompt Modifier

`GET /api/v1/emotions/prompt-modifier/:emotion` — get prompt modifier for emotion

### Emotion Types

`GET /api/v1/emotions/types` — list supported emotion types

### Licensing — Get

`GET /api/v1/actors/:actorId/licensing` — get character license

### Set Licensing

`POST /api/v1/actors/:actorId/licensing` — body: license fields

### Delete Licensing

`DELETE /api/v1/actors/:actorId/licensing` — 204

### Relationships — List

`GET /api/v1/actors/:actorId/relationships` — list relationships

### Get Relationship

`GET /api/v1/actors/:actorId/relationships/:targetActorId` — get specific relationship

### Create Relationship

`POST /api/v1/actors/:actorId/relationships` — body: `{ targetActorId, type, strength }`

### Update Relationship

`PUT /api/v1/actors/:actorId/relationships/:targetActorId` — body: updated fields

### Delete Relationship

`DELETE /api/v1/actors/:actorId/relationships/:targetActorId` — 204

### Record Relationship Event

`POST /api/v1/actors/:actorId/relationships/events` — body: `{ targetActorId, eventType, impact }`

## Worlds

### List

`GET /api/v1/worlds` — paginated list

### Create

`POST /api/v1/worlds` — body: `{ name, description, locationCount, kind, visibility }` — returns `{ id }` 201

### Get

`GET /api/v1/worlds/:worldId`

### Update

`PUT /api/v1/worlds/:worldId`

### Delete

`DELETE /api/v1/worlds/:worldId` — deletes world + all locations, states, quests, items — 204

### Initialize States

`POST /api/v1/worlds/:worldId/initialize-states` — creates default state records for all locations and NPCs

### World Chats

`GET /api/v1/worlds/:worldId/chats` — list chats in world

### World Invites — List

`GET /api/v1/worlds/:worldId/invites` — list world invites

### Create World Invite

`POST /api/v1/worlds/:worldId/invites` — body: `{ expiresAt, maxUses }`

### Delete World Invite

`DELETE /api/v1/worlds/:worldId/invites/:inviteId` — 204

### Join World by Invite

`POST /api/v1/world-invites/:code/join` — join world via invite code

### Trade — Get Balance

`GET /api/v1/worlds/:worldId/trade/balance` — get trade balance

### Execute Trade

`POST /api/v1/worlds/:worldId/trade/execute` — body: trade details

## World Locations

### List

`GET /api/v1/worlds/:worldId/locations`

### Create

`POST /api/v1/worlds/:worldId/locations` — body: `{ name, description, connections, parentLocationId }` — connection IDs validated against same world

### Get

`GET /api/v1/worlds/:worldId/locations/:locId`

### Update

`PUT /api/v1/worlds/:worldId/locations/:locId`

### Delete

`DELETE /api/v1/worlds/:worldId/locations/:locId` — 204

### Location Explorer

`GET /api/v1/worlds/:worldId/location-explorer` — explore world locations

### Location Details

`GET /api/v1/worlds/:worldId/locations/:locId/details` — detailed location info

### World Lore Entries — List

`GET /api/v1/worlds/:worldId/lore-entries` — list world lore entries

### Actor Lore Entries — List

`GET /api/v1/actors/:actorId/lore-entries` — list actor lore entries

### Actor Memories — List

`GET /api/v1/actors/:actorId/memories` — list actor memories

### Actor Notes — List

`GET /api/v1/actors/:actorId/notes` — list actor notes

## Settings

### Get Settings

`GET /api/v1/settings` — get global settings

### Update Settings

`PUT /api/v1/settings` — body: settings fields

### Export Settings

`GET /api/v1/settings/export` — export settings

## Sessions

### List

`GET /api/v1/sessions` — list active sessions

### Get

`GET /api/v1/sessions/:id` — get session details

### Delete

`DELETE /api/v1/sessions/:id` — revoke session, 204

## API Keys

### List

`GET /api/v1/user-api-keys` — list user API keys

### Create

`POST /api/v1/user-api-keys` — body: `{ provider, key }`

### Delete

`DELETE /api/v1/user-api-keys/:provider` — 204

## Key Management

### List Keys

`GET /api/v1/keys` — list encryption keys

### Create Key

`POST /api/v1/keys` — body: key fields

### Rotate Keys

`POST /api/v1/keys/rotate` — rotate encryption keys

### Update Key

`PUT /api/v1/keys/:id` — body: updated fields

### Delete Key

`DELETE /api/v1/keys/:id` — 204

## Encryption Status

`GET /api/v1/encryption/status` — returns encryption system status

## Analytics

### Chat Analytics

`GET /api/v1/analytics/chat/:chatId` — analytics for specific chat

### Overview

`GET /api/v1/analytics/overview` — global analytics overview

### Model Comparisons — Create

`POST /api/v1/analytics/comparisons` — body: comparison fields

### List Comparisons

`GET /api/v1/analytics/comparisons` — list model comparisons

### Leaderboard

`GET /api/v1/analytics/comparisons/leaderboard` — model leaderboard

## Telemetry

### Record Event

`POST /api/v1/telemetry/event` — body: `{ eventType, data }`

### Analytics Summary

`GET /api/v1/telemetry/analytics/summary` — telemetry summary

### Model Analytics

`GET /api/v1/telemetry/analytics/models` — model usage analytics

### Error Analytics

`GET /api/v1/telemetry/analytics/errors` — error analytics

### Daily Analytics

`GET /api/v1/telemetry/analytics/daily` — daily analytics

### Purge Analytics

`DELETE /api/v1/telemetry/analytics/purge` — purge analytics data

## Activity

### Activity Stream

`GET /api/v1/activity/stream` — SSE activity stream

## Export

### Export Data

`POST /api/v1/export` — body: `{ type, ids }` — triggers export job

## Frontend Logs

### Submit Logs

`POST /api/v1/frontend/logs` — body: `{ logs }` — submit frontend log entries

## i18n

### List Locales

`GET /api/v1/i18n/locales` — list available locales

### Get Locale

`GET /api/v1/i18n/locale` — query: `lang` — get locale strings

## Plugins

### List

`GET /api/v1/plugins` — list installed plugins

### Enable

`POST /api/v1/plugins/:name/enable` — enable plugin

### Disable

`POST /api/v1/plugins/:name/disable` — disable plugin

## Admin

### NSFW Settings — Get

`GET /api/v1/admin/nsfw` — get NSFW configuration (admin only)

### Update NSFW Settings

`PUT /api/v1/admin/nsfw` — body: NSFW config fields (admin only)

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