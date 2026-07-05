# API Reference

## Authentication

All API endpoints (except public endpoints) require authentication via opaque bearer tokens passed in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are UUID v4 strings. Server stores SHA-256 hash in `sessions` table — raw token never stored. Session is deleted on logout. See [Auth Middleware](../spec/auth-middleware.md).

## Base URL

All API endpoints are prefixed with `/api/`.

## Users

### Get Current User

```http
GET /api/users/me
Authorization: Bearer <token>
```

Returns the currently authenticated user's information.

**Response:**

```json
{
  "id": "user_uuid",
  "username": "johndoe",
  "displayName": "John Doe",
  "role": "user",
  "createdAt": "2026-01-15T10:30:00.000Z"
}
```

### Update User Profile

```http
PUT /api/users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "Johnny"
}
```

Only `displayName` and `settings` can be updated. Username is immutable.

**Response:** Updated user object

### Get User by ID

```http
GET /api/users/:userId
Authorization: Bearer <token>
```

**Response:** User object

## Authentication

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "password123"
}
```

**Response:**

```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "user": {
    "id": "user_uuid",
    "username": "johndoe",
    "displayName": "John Doe",
    "role": "user"
  }
}
```

### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response:** 204 No Content

### Get Current User (Auth check)

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:** `{ id, username, displayName, role }`

## Chats

### Get User's Chats

```http
GET /api/chats
Authorization: Bearer <token>
```

**Response:** Paginated array of user's chat objects

### Create Chat

```http
POST /api/chats
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Adventure",
  "type": "direct",
  "mode": "roleplay",
  "participantIds": ["actor-uuid"],
  "worldId": "world-uuid"
}
```

**Response:** `{ "id": "chat_uuid" }` with 201

### Get Chat by ID

```http
GET /api/chats/:chatId
Authorization: Bearer <token>
```

**Response:** Chat object with participants

### Update Chat

```http
PUT /api/chats/:chatId
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Adventure Name",
  "mode": "roleplay"
}
```

**Response:** Updated chat object

### Delete Chat

```http
DELETE /api/chats/:chatId
Authorization: Bearer <token>
```

**Response:** 204 No Content

## Messages

### Get Messages for a Chat

```http
GET /api/chats/:chatId/messages
Authorization: Bearer <token>
```

**Query Parameters:**

- `page`: Page number (default: 1)
- `pageSize`: Messages per page (default: 50, max: 200)
- `parentId`: Filter by parent message (tree view)
- `before`: Get messages before this timestamp

**Response:** Paginated list of message objects

### Send Message

```http
POST /api/chats/:chatId/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello, world!",
  "role": "user",
  "contentType": "text",
  "parentId": null,
  "idempotencyKey": "client-gen-uuid"
}
```

**Response:** `{ "id": "msg_uuid" }` with 201

### Update Message Visibility

```http
PUT /api/messages/:messageId/visibility
Authorization: Bearer <token>
Content-Type: application/json

{
  "visibility": "hidden_by_user",
  "reason": "mistake"
}
```

**Response:** Updated message object

### Delete Message

```http
DELETE /api/messages/:messageId
Authorization: Bearer <token>
```

**Response:** 204 No Content

## Characters

### Get Character

```http
GET /api/actors/:id
Authorization: Bearer <token>
```

**Response:** Actor object (character/user/assistant)

### Create Character

```http
POST /api/actors
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "Gandalf",
  "actorType": "character",
  "description": "A wise old wizard",
  "systemPrompt": "You are Gandalf the Grey..."
}
```

**Response:** `{ "id": "actor_uuid" }` with 201

### Update Character

```http
PUT /api/actors/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "Gandalf the White",
  "description": "An even wiser wizard"
}
```

**Response:** Updated actor object

### Delete Character

```http
DELETE /api/actors/:id
Authorization: Bearer <token>
```

**Response:** 204 No Content

## Assets

### Upload Asset

```http
POST /api/assets
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary file>
```

**Response:**

```json
{
  "id": "asset_uuid",
  "filename": "portrait.png",
  "mimeType": "image/png",
  "sizeBytes": 123456,
  "urls": {
    "raw": "/api/assets/uuid/raw",
    "compressed": "/api/assets/uuid/compressed",
    "thumbnail": "/api/assets/uuid/thumb"
  }
}
```

### List Assets

```http
GET /api/assets?type=image
Authorization: Bearer <token>
```

**Response:** Paginated array of asset objects

### Link Asset to Entity

```http
POST /api/assets/:assetId/links
Authorization: Bearer <token>
Content-Type: application/json

{
  "entityType": "character",
  "entityId": "actor_uuid",
  "label": "portrait"
}
```

**Response:** `{ "id": "link_uuid" }` with 201

### Unlink Asset from Entity

```http
DELETE /api/assets/:assetId/links/:linkId
Authorization: Bearer <token>
```

**Response:** 204 No Content

### Delete Asset

```http
DELETE /api/assets/:assetId
Authorization: Bearer <token>
```

**Response:** 204 No Content

### Serve Asset

```http
GET /api/assets/:assetId/raw       # Original file
GET /api/assets/:assetId/compressed # Compressed variant
GET /api/assets/:assetId/thumb     # Thumbnail (images only)
```

Asset downloads use direct paths (no signed URL system). Auth required for all asset endpoints.

**Response:** Binary file data with appropriate Content-Type

## Assistant

### Get Assistant Response

> **Status:** Not implemented. `/api/assistant` endpoint does not exist yet. Assistant is invoked internally by `src/assistant/service.ts` during message generation. This documentation is aspirational.

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "message": "Human readable error message",
    "code": "ERROR_CODE",
    "details": {} // Optional additional details
  }
}
```

Common error codes:

- `VALIDATION_ERROR`: Invalid request data
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `CONFLICT`: Resource conflict (e.g., duplicate username)
- `INTERNAL_ERROR`: Unexpected server error

## Rate Limiting

API endpoints may be rate-limited. When rate limited, the server responds with:

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMITED",
    "details": {
      "limit": 100,
      "remaining": 0,
      "reset": 1623456789000
    }
  }
}
```

Status code: 429 Too Many Requests

## Pagination

Endpoints that return lists of items support pagination using:

- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 50, max: 200)

Response includes pagination metadata:

```json
{
  "data": [...],
  "pagination": {
    "total": 137,
    "page": 1,
    "pageSize": 50,
    "totalPages": 3
  }
}
```
