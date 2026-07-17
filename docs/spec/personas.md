# Personas

Personas are user-authored identities that define how the user presents
themselves in chats: name, appearance, personality, backstory.

Personas are separate from characters — they live in a dedicated `personas`
table and are selected per-chat.

## Data Model

### Persona Table

| Column          | Type | Constraints               | Notes                             |
| --------------- | ---- | ------------------------- | --------------------------------- |
| id              | TEXT | PK, UUID                  |                                   |
| user_id         | TEXT | FK → users.id, NOT NULL   | Owner                             |
| name            | TEXT | NOT NULL                  | Display name in this persona      |
| avatar_asset_id | TEXT |                           | Profile picture                   |
| description     | TEXT |                           | Physical/mental traits, backstory |
| title           | TEXT |                           | Optional title (display only)     |
| is_default      | TEXT | DEFAULT "not_default"     | DefaultState enum                 |
| created_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                                   |
| updated_at      | TEXT | DEFAULT CURRENT_TIMESTAMP |                                   |

**Index**: `(user_id)` for user's persona list, `(user_id, is_default)` for default lookup.

`is_default` uses the `DefaultState` enum: `"default"` | `"not_default"`.

### Chat ↔ Persona Binding

Persona and impersonation are per-participant settings on `chat_participants`:

| Column               | Type | Constraints      | Notes                        |
| -------------------- | ---- | ---------------- | ---------------------------- |
| persona_id           | TEXT | FK → personas.id | Active user persona          |
| impersonate_actor_id | TEXT | FK → actors.id   | Character being impersonated |

Per-participant binding (not per-chat) supports group chats where different
users use different personas in the same chat.

**Impersonation flow:**

1. User selects "Impersonate" on a character
2. `chat_participants.impersonate_actor_id` is set to that character's actor ID
3. In prompt assembly, the impersonated character's fields replace the user's identity fields
4. Messages from the user are attributed to `impersonate_actor_id` in the prompt (but stored with the user's `actor_id` for permissions)
5. The UI shows the impersonated character's avatar and name for user messages

**Impersonation vs Persona:**

| Feature          | Persona                        | Impersonation                            |
| ---------------- | ------------------------------ | ---------------------------------------- |
| What it does     | Sets user's identity           | User plays as a character                |
| Stored in        | `chat_participants.persona_id` | `chat_participants.impersonate_actor_id` |
| Prompt injection | User's persona fields          | Character's fields in user slot          |
| Message author   | User's actor_id                | User's actor_id (permissions)            |
| UI display       | Persona name/avatar            | Character name/avatar                    |
| Can be changed   | Anytime (affects future msgs)  | Anytime (affects future msgs)            |

### Macro System

Macros resolve differently depending on context:

| Macro      | In Character Card        | In Persona                  | Meaning                 |
| ---------- | ------------------------ | --------------------------- | ----------------------- |
| `{{char}}` | Character's display_name | Chat partner's display_name | The "other" participant |
| `{{user}}` | User's display_name      | This persona's display_name | The "self" participant  |
| `<BOT>`    | Same as `{{char}}`       | Same as `{{char}}`          | Alias                   |
| `<USER>`   | Same as `{{user}}`       | Same as `{{user}}`          | Alias                   |

When impersonating, `{{user}}` resolves to the impersonated character's name in the prompt context.

## Prompt Assembly with Personas

When constructing the LLM prompt, persona and impersonation affect how identity fields are injected:

### Standard Chat (No Impersonation)

```
[System]
You are {{char}}. {{system_prompt}}

[Character Card — {{char}}]
Description: {{character.description}}
Personality: {{character.personality}}
Scenario: {{character.scenario}}

[User Persona — {{user}}]
Description: {{persona.description}}

[Chat History]
{{user}}: ...
{{char}}: ...

[Post-History Instructions]
{{post_history_instructions}}
```

### Impersonation Chat

```
[System]
You are {{char}}. {{system_prompt}}

[Character Card — {{char}}]
Description: {{character.description}}
Personality: {{character.personality}}
Scenario: {{character.scenario}}

[User Persona — {{user}}]
Name: {{impersonated_character.display_name}}
Description: {{impersonated_character.description}}
Personality: {{impersonated_character.personality}}

[Chat History]
{{impersonated_character}}: ...    ← user messages shown as character
{{char}}: ...

[Post-History Instructions]
{{post_history_instructions}}
```

## API Endpoints

| Method | Endpoint                                 | Description                  |
| ------ | ---------------------------------------- | ---------------------------- |
| GET    | `/api/personas`                          | List user's personas         |
| POST   | `/api/personas`                          | Create persona               |
| PATCH  | `/api/personas/:id`                      | Update persona               |
| DELETE | `/api/personas/:id`                      | Delete persona               |
| POST   | `/api/personas/:id/convert-to-character` | Convert persona to character |

### Chat Impersonation

| Method | Endpoint                     | Description                |
| ------ | ---------------------------- | -------------------------- |
| PUT    | `/api/chats/:id/persona`     | Set active persona         |
| PUT    | `/api/chats/:id/impersonate` | Set impersonated character |
| DELETE | `/api/chats/:id/impersonate` | Stop impersonating         |

## Implementation

### Source Files

| File                           | Purpose                |
| ------------------------------ | ---------------------- |
| `src/personas/service.ts`      | Persona CRUD           |
| `src/personas/controller.ts`   | Persona HTTP handlers  |
| `src/personas/service.test.ts` | Persona CRUD + default |

Persona routes are registered in `src/elysia-app.ts` via `personaRoutes()`.

Personas are created in the initial schema migration (`src/db/migrations/parts/001_users.ts`) alongside the users table.

### Entity Relationships

1. **Users** own many **Personas** (user-authored identities for chat participation)
2. **Users** own many **Actors** (when `actor_type='user'`)
3. **Users** own many **Characters** (as `owner` of actor records with `actor_type='character'`)
4. **Personas** connect to many **Chats** via `chat_participants.persona_id` — determines which identity is active in each chat
5. **Characters** connect to many **Chats** via the `chat_participants` junction table

## Related Documents

| Document                         | Covers                          |
| -------------------------------- | ------------------------------- |
| `docs/spec/characters.md`        | Character system, import/export |
| `docs/spec/schema.md`            | Database schema, all tables     |
| `docs/spec/actors.md`            | Actor data model, lorebooks     |
| `docs/frontend/characters.md`    | Character list and edit UI      |
| `docs/frontend/chat/overview.md` | Chat types, data model          |
