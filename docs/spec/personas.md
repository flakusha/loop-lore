# Personas

User-authored identities for chat: name, appearance, personality, backstory.
Separate from characters — dedicated `personas` table, selected per-chat.

## Data Model

### Personas Table

| Column          | Type | Constraints               | Notes                    |
| --------------- | ---- | ------------------------- | ------------------------ |
| id              | TEXT | PK, UUID                  |                          |
| user_id         | TEXT | FK → users.id, NOT NULL   | Owner                    |
| name            | TEXT | NOT NULL                  | Display name             |
| avatar_asset_id | TEXT |                           | Profile picture          |
| description     | TEXT |                           | Traits, backstory        |
| title           | TEXT |                           | Optional display title   |
| is_default      | TEXT | DEFAULT "not_default"     | DefaultState enum        |
| created_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                          |
| updated_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                          |

Indexes: `(user_id)`, `(user_id, is_default)`.

`is_default` uses `DefaultState` enum: `"default"` | `"not_default"`.

### Chat ↔ Persona Binding on `chat_participants`

| Column               | Type | Constraints      | Notes                        |
| -------------------- | ---- | ---------------- | ---------------------------- |
| persona_id           | TEXT | FK → personas.id | Active user persona          |
| impersonate_actor_id | TEXT | FK → actors.id   | Character being impersonated |

Per-participant binding supports group chats with different personas per user.

### Impersonation vs Persona

| Feature          | Persona                        | Impersonation                            |
| ---------------- | ------------------------------ | ---------------------------------------- |
| Purpose          | User's identity                | User plays as character                  |
| Stored in        | `chat_participants.persona_id` | `chat_participants.impersonate_actor_id` |
| Prompt injection | User's persona fields          | Character's fields in user slot          |
| Message author   | User's actor_id                | User's actor_id (permissions)            |
| UI display       | Persona name/avatar            | Character name/avatar                    |

## Macro Resolution

| Macro      | In Character Card  | In Persona                  |
| ---------- | ------------------ | --------------------------- |
| `{{char}}` | Character's name   | Chat partner's name         |
| `{{user}}` | User's name        | This persona's name         |
| `<BOT>`    | Same as `{{char}}` | Same as `{{char}}`          |
| `<USER>`   | Same as `{{user}}` | Same as `{{user}}`          |

When impersonating, `{{user}}` resolves to impersonated character's name.

## API Endpoints

| Method | Endpoint                                 | Description                  |
| ------ | ---------------------------------------- | ---------------------------- |
| GET    | `/api/personas`                          | List user's personas         |
| POST   | `/api/personas`                          | Create persona               |
| PATCH  | `/api/personas/:id`                      | Update persona               |
| DELETE | `/api/personas/:id`                      | Delete persona               |
| POST   | `/api/personas/:id/convert-to-character` | Convert to character         |
| PUT    | `/api/chats/:id/persona`                 | Set active persona           |
| PUT    | `/api/chats/:id/impersonate`             | Start impersonating          |
| DELETE | `/api/chats/:id/impersonate`             | Stop impersonating           |

## Source Files

| File                         | Purpose               |
| ---------------------------- | --------------------- |
| `src/personas/service.ts`    | Persona CRUD          |
| `src/personas/controller.ts` | HTTP handlers         |
| `src/personas/service.test.ts` | CRUD + default tests |

Routes registered in `src/elysia-app.ts` via `personaRoutes()`. Schema created in initial migration (`src/db/migrations/parts/001_users.ts`).

## Entity Relationships

- Users own Personas (chat identities), Actors (user type), Characters (actor records with `actor_type='character'`)
- Personas connect to Chats via `chat_participants.persona_id`
- Characters connect to Chats via `chat_participants` junction
