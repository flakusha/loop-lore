# Impersonation & Persona Selection Spec

> Status: Implemented (v1) — see epic `.plan/epics/epic-impersonation.md`

## Overview

Two identity mechanisms affect how the user appears to the AI:

1. **Persona** — a user-authored identity (name, description, avatar). Defines who the user is.
2. **Impersonation** — the user plays as an existing character. The AI sees that character's identity in the `<user_persona>` prompt section.

Both are scoped per `chat_participants` row: one persona, one impersonation target per chat.

## Data Model

### `chat_participants` columns

| Column                 | Type  | Description                                |
| ---------------------- | ----- | ------------------------------------------ |
| `persona_id`           | text? | FK → `personas.id`; null = no persona      |
| `impersonate_actor_id` | text? | FK → `actors.id`; null = not impersonating |

Both are nullable and independent: a user can have a persona set AND be impersonating (impersonation takes precedence in prompt assembly).

### Prompt priority (in `user-persona.ts`)

```
if impersonate_actor_id → inject actor's display_name + description + personality
else if persona_id      → inject persona's name + description
else                    → no <user_persona> section
```

## API Endpoints

### Set impersonation

```
PUT /api/chats/:id/impersonate
Body: { "impersonateActorId": "actor-id" | null }
```

- Sets `impersonate_actor_id` on the caller's `chat_participants` row.
- Passing `null` or omitting stops impersonation.
- **1-per-world constraint**: in world chats, an actor can only be impersonated by one user at a time.
- Returns 400 if another user already impersonates that actor in the same world.

### Set persona

```
PUT /api/chats/:id/persona
Body: { "personaId": "persona-id" | null }
```

- Sets `persona_id` on the caller's `chat_participants` row.
- Passing `null` clears the persona (uses default user identity).

### Persona CRUD

```
GET    /api/personas          — list user's personas
POST   /api/personas          — create { name, description?, title?, avatarAssetId? }
GET    /api/personas/:id      — get one
PATCH  /api/personas/:id      — update fields
DELETE /api/personas/:id      — delete (also clears persona_id refs in chat_participants)
POST   /api/personas/:id/convert-to-character — creates an actor from persona data
```

## Chat Commands

### `/impersonate <character_name>`

- Resolves character by display name among chat participants.
- Calls `PUT /api/chats/:id/impersonate` with matched actor ID.
- If character not found in chat, shows warning toast.

### `/impersonate off` or `/impersonate stop`

- Clears impersonation by calling API with `null`.

### `/char <name>` — alias for `/impersonate`

## Frontend Integration

### Chat Actions (`chat-actions.ts`)

- `toggleImpersonate()` — toggles between current character impersonation and null.
- `loadImpersonationState()` — fetches participants on chat load, sets `impersonationActive` and `impersonatingActorId`.
- `dispatchCommandAction("impersonate-select", { characterName })` — resolves name → actor ID from participants list, calls API.
- `dispatchCommandAction("impersonate-toggle", { mode })` — off or toggle.

### Chat Settings (`chat-settings.ts`)

- `loadPersonas()` — fetches `/api/personas` for persona selector.
- `setPersona()` — sets persona on chat via API.
- `toggleImpersonation()` — sets/clears impersonation via API.
- `loadImpersonationState()` — reads participant state on settings open.

### Personas Page (`alpine/personas.ts`)

- Full CRUD for managing personas (create, edit, delete, set default).

## 1-Per-World Constraint

**Rule**: In a world-linked chat, the same character (`impersonate_actor_id`) can only be impersonated by one user at a time.

- Private/disconnected chats are exempt (no world_id).
- Enforcement: `updateImpersonation()` in `chat/service.ts` queries `chat_participants JOIN chats` on `world_id` before setting.
- Conflict returns `ServiceError { code: "bad_request" }` → HTTP 400.
- Clearing impersonation (null) always succeeds.

## Memory Implications

- When impersonating, the AI sees the character's memories (normal memory provisioning applies).
- User's persona description supplements the impersonated character in the prompt.
- No special memory isolation enforcement yet (future: memory shareability filters).
