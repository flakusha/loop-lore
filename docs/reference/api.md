# API Reference

## Authentication

All API endpoints (except public endpoints) require authentication via JWT tokens passed in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## Base URL

All API endpoints are prefixed with `/api/`.

## Users

### Get Current User

```http
GET /api/users/me
Authorization: Bearer <jwt_token>
```

Returns the currently authenticated user's information.

**Response:**

```json
{
  "id": "user_123",
  "username": "johndoe",
  "email": "john@example.com",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Update User Profile

```http
PATCH /api/users/me
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "username": "newusername",
  "email": "newemail@example.com"
}
```

**Response:** Updated user object

### Get User by ID

```http
GET /api/users/:userId
Authorization: Bearer <jwt_token>
```

**Response:** User object

## Sessions

### Get Current Session

```http
GET /api/sessions/me
Authorization: Bearer <jwt_token>
```

Returns the current session information.

### Create Session (Login)

```http
POST /api/sessions
Content-Type: application/json

{
  "username": "johndoe",
  "password": "password123"
}
```

**Response:**

```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_123",
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

### Delete Session (Logout)

```http
DELETE /api/sessions/:sessionId
Authorization: Bearer <jwt_token>
```

**Response:** 204 No Content

## Chats

### Get User's Chats

```http
GET /api/chats
Authorization: Bearer <jwt_token>
```

**Response:** Array of chat objects

### Create Chat

```http
POST /api/chats
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My Adventure",
  "description": "A fantasy roleplay adventure"
}
```

**Response:** Created chat object

### Get Chat by ID

```http
GET /api/chats/:chatId
Authorization: Bearer <jwt_token>
```

**Response:** Chat object with messages and participants

### Update Chat

```http
PATCH /api/chats/:chatId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Adventure Name",
  "description": "Updated description"
}
```

**Response:** Updated chat object

### Delete Chat

```http
DELETE /api/chats/:chatId
Authorization: Bearer <jwt_token>
```

**Response:** 204 No Content

## Messages

### Get Messages for a Chat

```http
GET /api/chats/:chatId/messages
Authorization: Bearer <jwt_token>
```

**Query Parameters:**

- `limit`: Number of messages to return (default: 50)
- `offset`: Number of messages to skip (default: 0)
- `before`: Get messages before this timestamp
- `after`: Get messages after this timestamp

**Response:** Array of message objects

### Send Message

```http
POST /api/chats/:chatId/messages
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "content": "Hello, world!",
  "characterId": "char_123"  // Optional, for character messages
}
```

**Response:** Created message object

### Update Message

```http
PATCH /api/messages/:messageId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "content": "Updated message content"
}
```

**Response:** Updated message object

### Delete Message

```http
DELETE /api/messages/:messageId
Authorization: Bearer <jwt_token>
```

**Response:** 204 No Content

## Characters

### Get Character

```http
GET /api/characters/:characterId
Authorization: Bearer <jwt_token>
```

**Response:** Character object

### Create Character

```http
POST /api/characters
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Gandalf",
  "description": "A wise old wizard",
  "avatar": "url_to_avatar_image"
}
```

**Response:** Created character object

### Update Character

```http
PATCH /api/characters/:characterId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Gandalf the White",
  "description": "An even wiser wizard"
}
```

**Response:** Updated character object

### Delete Character

```http
DELETE /api/characters/:characterId
Authorization: Bearer <jwt_token>
```

**Response:** 204 No Content

## Assets

### Upload Asset

```http
POST /api/assets
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

file: <binary file>
alt_text: "Description of the image"
```

**Response:**

```json
{
  "id": "asset_123",
  "filename": "portrait.png",
  "mime_type": "image/png",
  "asset_type": "image",
  "size_bytes": 123456,
  "urls": {
    "raw": "/api/assets/asset_123/raw",
    "compressed": "/api/assets/asset_123/compressed",
    "thumbnail": "/api/assets/asset_123/thumb"
  }
}
```

### List Assets

```http
GET /api/assets?entity_type=character&entity_id=char_123&label=portrait
Authorization: Bearer <jwt_token>
```

**Response:** Array of asset objects

### Link Asset to Entity

```http
POST /api/assets/:assetId/link
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "entity_type": "character",
  "entity_id": "char_123",
  "label": "portrait"
}
```

**Response:** 201 Created

### Unlink Asset from Entity

```http
DELETE /api/assets/:assetId/link
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "entity_type": "character",
  "entity_id": "char_123"
}
```

**Response:** 204 No Content

### Delete Asset

```http
DELETE /api/assets/:assetId
Authorization: Bearer <jwt_token>
```

**Response:** 204 No Content

### Serve Asset

```http
GET /api/assets/:assetId/raw       # Original file
GET /api/assets/:assetId/compressed # Compressed variant
GET /api/assets/:assetId/thumb     # Thumbnail
```

**Response:** Binary file data with appropriate Content-Type

## Assistant

### Get Assistant Response

```http
POST /api/assistant
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "I need help creating a character",
  "context": {
    "chatId": "chat_123",
    "characterIds": ["char_123", "char_456"],
    "recentMessages": [
      { "content": "Hello", "role": "user" },
      { "content": "Hi there!", "role": "assistant" }
    ]
  }
}
```

**Response:**

```json
{
  "type": "suggestion",
  "content": "Consider giving your character a unique background story...",
  "confidence": 0.85
}
```

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

- `limit`: Number of items to return (default: 50, max: 100)
- `offset`: Number of items to skip (default: 0)

Response includes pagination metadata:

```json
{
  "items": [...],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 137,
    "hasMore": true
  }
}
```
