# EPIC: Impersonation System

**Status:** 🟡 Partially Implemented (wiring gaps remain)
**Priority:** Medium
**Effort:** Med
**Type:** Feature Epic

## Summary

Character impersonation — 1 character can be impersonated once per world (except disconnected/private chats). Personas (user identities) can be selected per-chat. Both feed into LLM prompt as `<user_persona>`.

## Implementation Status

### ✅ Done

| Layer    | Component                             | File                                        | Notes                                                           |
| -------- | ------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| DB       | `impersonate_actor_id` column         | `schema-core.ts:163`                        | Nullable text on `chat_participants`                            |
| DB       | `persona_id` column                   | `schema-core.ts:164`                        | Nullable text on `chat_participants`                            |
| DB       | Migration                             | `db/migrations/008_chat_features.ts`        | Columns + indexes exist                                         |
| API      | `PUT /api/chats/:id/impersonate`      | `routes/chats.ts:634`                       | Sets `impersonate_actor_id`                                     |
| API      | `PUT /api/chats/:id/persona`          | `routes/chats.ts:606`                       | Sets `persona_id`                                               |
| API      | `GET/POST/PATCH/DELETE /api/personas` | `personas/controller.ts`                    | Full CRUD + convert-to-character                                |
| Prompt   | `<user_persona>` section              | `assistant/prompt/sections/user-persona.ts` | Reads impersonated actor OR persona, injects into system prompt |
| Service  | `updateImpersonation()`               | `chat/service/participants.ts:22`           | Re-exported via `chat/service/index.ts`                         |
| Frontend | `toggleImpersonation()`               | `frontend/alpine/chat-settings.ts:186`      | Saves impersonation on settings save; reads via `loadImpersonationState` |
| Frontend | `loadImpersonationState()`            | `frontend/alpine/chat-settings.ts:208`      | Reads participants on chat load                                 |
| Frontend | Chat settings persona/impersonation   | `frontend/alpine/chat-settings.ts:164-229`  | `toggleImpersonation()`, `loadPersonas()`, `setPersona()`       |
| Frontend | Personas page                         | `frontend/alpine/personas.ts`               | Full CRUD via Alpine                                            |
| Commands | `/impersonate` and `/char`            | `assistant/commands/impersonate.ts`         | Returns `impersonate-toggle` / `impersonate-select` actions     |
| Intent   | `impersonate` intent                  | `assistant/intent.ts:30`                    | Registered, no approval required                                |

### ❌ Gaps (Items below)

| Gap                    | Severity | Description                                                                                                                                    |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Command dispatch       | High     | `/impersonate <name>` returns `impersonate-select` action but `dispatchCommandAction()` doesn't handle it — command is a no-op from chat input |
| Name→Actor resolution  | High     | `impersonate-select` passes `{ characterName }` but no resolver maps name → actor ID                                                           |
| De-duplication         | Medium   | `routes/chats.ts` does inline DB update for impersonation instead of calling `chat/service.ts#updateImpersonation()`                           |
| 1-per-world constraint | Medium   | Spec says 1 impersonated character per world/group, no validation exists                                                                       |
| Memory isolation       | Low      | No special handling for impersonated character's memories                                                                                      |

## Refactored Task List

- [x] DB: `impersonate_actor_id` and `persona_id` columns on `chat_participants`
- [x] API: Impersonate endpoint (`PUT /api/chats/:id/impersonate`)
- [x] API: Persona selection endpoint (`PUT /api/chats/:id/persona`)
- [x] API: Persona CRUD (`/api/personas/*`)
- [x] Backend: `updateImpersonation()` helper in chat/service.ts
- [x] Backend: `<user_persona>` prompt section reads from `chat_participants`
- [x] Frontend: Chat settings persona + impersonation toggles
- [x] Frontend: `toggleImpersonate()` in chat-actions
- [x] Frontend: Personas page CRUD
- [x] Commands: `/impersonate` + `/char` register action types
- [ ] **FIX**: Wire `impersonate-toggle` and `impersonate-select` actions in `dispatchCommandAction()`
- [ ] **FIX**: Add name→actor ID resolution for `impersonate-select`
- [ ] **FIX**: Route should call `updateImpersonation()` instead of inline DB
- [ ] **FIX**: Validate 1-per-world constraint for group/world chats
- [ ] Docs: Expand `docs/spec/impersonation.md` from stub to full spec

## Files

- `src/db/schema-core.ts` — `ChatParticipants` interface (columns exist)
- `src/db/migrations/008_chat_features.ts` — migration with columns
- `src/routes/chats.ts` — impersonate + persona endpoints
- `src/chat/service.ts` — `updateImpersonation()` helper
- `src/personas/service.ts` — persona CRUD + convert-to-character
- `src/personas/controller.ts` — persona REST routes
- `src/assistant/commands/impersonate.ts` — command registration
- `src/assistant/prompt/sections/user-persona.ts` — prompt injection
- `src/frontend/alpine/chat-actions.ts` — `toggleImpersonate()`, `loadImpersonationState()`
- `src/frontend/alpine/chat-settings.ts` — persona/impersonation in settings
- `src/frontend/alpine/personas.ts` — personas page
- `src/views/personas.html` — personas template

## Related

- `.plan/epics/epic-impersonation.md`
- `docs/spec/character-setup.md` — character ↔ persona relationship, impersonation use cases
- `docs/spec/impersonation.md` — stub (needs expansion)
