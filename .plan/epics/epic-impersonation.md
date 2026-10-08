<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Impersonation System

**Tags:** impersonation, persona, chat, prompt, slash-commands
**Overview:** Per-chat user identity: impersonate any participating character (`impersonate_actor_id`) or select an authored persona (`persona_id`), injected into the LLM prompt as `<user_persona>`. Enforced 1-per-(world, location) so two users can't play the same character in the same place.


**Status:** In Progress
**Status Note:** Implemented; location-scoped constraint done, timeline scope deferred (schema), memory isolation open (Low)
**Priority:** Medium
**Effort:** Med
**Type:** Feature Epic

## Summary

Character impersonation — 1 character can be impersonated once per world-location (except disconnected/private chats). Personas (user identities) can be selected per-chat. Both feed into LLM prompt as `<user_persona>`.

## Implementation Status

### ✅ Done

| Layer    | Component                             | File                                        | Notes                                                           |
| -------- | ------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| DB       | `impersonate_actor_id` column         | `schema-core.ts:605`                        | Nullable text on `chat_participants`                            |
| DB       | `persona_id` column                   | `schema-core.ts:606`                        | Nullable text on `chat_participants`                            |
| DB       | Migration                             | `db/migrations/001_init.ts:1712-1713`       | Columns + index exist                                           |
| API      | `PUT /api/chats/:id/impersonate`      | `routes/chats/extras.ts:150`                | Delegates to `updateImpersonation()`                            |
| API      | `PUT /api/chats/:id/persona`          | `routes/chats/extras.ts:120`                | Sets `persona_id`                                               |
| API      | `GET/POST/PATCH/DELETE /api/personas` | `personas/controller.ts`                    | Full CRUD + convert-to-character                                |
| Prompt   | `<user_persona>` section              | `assistant/prompt/sections/user-persona.ts` | Reads impersonated actor OR persona, injects into system prompt |
| Service  | `updateImpersonation()`               | `chat/service/participants.ts:30`           | Re-exported via `chat/service/index.ts`; enforces 1-per-(world, location) |
| Frontend | `toggleImpersonate()`                 | `frontend/alpine/chat-actions/impersonation.ts:13` | Toggles current-character impersonation via API            |
| Frontend | `loadImpersonationState()`            | `frontend/alpine/chat-actions/impersonation.ts:81` | Reads participants on chat load                           |
| Frontend | Chat settings persona/impersonation   | `frontend/alpine/chat-settings/persona.ts`  | `toggleImpersonation()`, `loadPersonas()`, `setPersona()`       |
| Frontend | Personas page                         | `frontend/alpine/personas.ts`               | Full CRUD via Alpine                                            |
| Commands | `/impersonate` and `/char`            | `assistant/commands/impersonate.ts`         | Returns `impersonate-toggle` / `impersonate-select` actions; listed in `command-parser.ts:67-69` |

### ❌ Gaps (Items below)

| Gap                    | Severity | Description                                                                                                                                    |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Command dispatch       | ✅ done  | `impersonate-toggle` + `impersonate-select` handled in `chat-actions/dispatch.ts:122-187` |
| Name→Actor resolution  | ✅ done  | `impersonate-select` resolves name via participants list (`dispatch.ts:149-153`) |
| De-duplication         | ✅ done  | `routes/chats/extras.ts:168` calls `updateImpersonation()` — no inline DB |
| 1-per-world constraint | ✅/⏳     | Location scope DONE: helper checks `(world_id, current_location_id)`, falls back to world-level when chat has no location. Timeline scope DEFERRED: `chats` carries no `timeline_id` (timelines live in `world_timelines`, unreferenced by chats) — needs schema migration; see epic-timeline-system. Private/disconnected chats (no `world_id`) remain exempt. |
| Memory isolation       | Low      | No special handling for impersonated character's memories (see epic-memory-isolation-design) |

## Refactored Task List

- [x] DB: `impersonate_actor_id` and `persona_id` columns on `chat_participants`
- [x] API: Impersonate endpoint (`PUT /api/chats/:id/impersonate`)
- [x] API: Persona selection endpoint (`PUT /api/chats/:id/persona`)
- [x] API: Persona CRUD (`/api/personas/*`)
- [x] Backend: `updateImpersonation()` helper in chat/service/participants.ts
- [x] Backend: `<user_persona>` prompt section reads from `chat_participants`
- [x] Frontend: Chat settings persona + impersonation toggles
- [x] Frontend: `toggleImpersonate()` in chat-actions
- [x] Frontend: Personas page CRUD
- [x] Commands: `/impersonate` + `/char` register action types
- [x] **FIX**: Wire `impersonate-toggle` and `impersonate-select` actions in `dispatchCommandAction()`
- [x] **FIX**: Add name→actor ID resolution for `impersonate-select`
- [x] **FIX**: Route calls `updateImpersonation()` instead of inline DB (verified `extras.ts:168`)
- [x] **FIX**: Refine impersonation constraint from world-level to location scope (`participants.ts:48-59`)
- [ ] **DEFERRED**: Timeline-scoped constraint — requires adding `timeline_id` to `chats` (schema migration); coordinate with epic-timeline-system
- [x] Docs: `docs/spec/impersonation.md` is a full spec (data model, endpoints, commands, frontend, constraint)
- [ ] Docs/Memory: memory isolation for impersonated characters (Low; see epic-memory-isolation-design)

## Files

- `src/db/schema-core.ts` — `ChatParticipants` interface (columns at :605-606); `Chats.current_location_id` (:661)
- `src/db/migrations/001_init.ts` — columns (:1712-1713) + index (:2026)
- `src/routes/chats/extras.ts` — impersonate (:150) + persona (:120) endpoints
- `src/chat/service/participants.ts` — `updateImpersonation()` (:30); tests in `participants.test.ts`
- `src/personas/service.ts` — persona CRUD (convert-to-character in `convert.ts`)
- `src/personas/controller.ts` — persona REST routes
- `src/assistant/commands/impersonate.ts` — command registration
- `src/assistant/command-parser.ts` — command name list (:67-69)
- `src/assistant/prompt/sections/user-persona.ts` — prompt injection
- `src/frontend/alpine/chat-actions/impersonation.ts` — `toggleImpersonate()`, `loadImpersonationState()`
- `src/frontend/alpine/chat-actions/dispatch.ts` — `impersonate-toggle` (:122), `impersonate-select` (:139)
- `src/frontend/alpine/chat-settings/persona.ts` — persona/impersonation in settings
- `src/frontend/alpine/personas.ts` — personas page
- `src/views/personas.html` — personas template

## Integration Points

- **Slash-command dispatch** (`epic-frontend-chat-commands`): `/impersonate` + `/char` parse in `command-parser.ts`, return `impersonate-toggle`/`impersonate-select` actions, executed by `dispatchCommandAction()` in `chat-actions/dispatch.ts`.
- **Characters/personas** (`epic-character-core-system`, `epic-character-multi-personality`): impersonation target is an existing character actor; personas are user-authored identities convertible to characters via `POST /api/personas/:id/convert-to-character`.
- **Group chat** (`epic-group-chat`): 1-per-(world, location) constraint prevents two users playing the same character in one place; participant rows carry per-user identity.
- **Assistant/GM flows** (`epic-assistant-gm-flows`): `<user_persona>` prompt section feeds impersonated-actor/persona identity into LLM context alongside GM guidance.
- **Timelines** (`epic-timeline-system`): deferred timeline-scoped constraint — chats need `timeline_id` before same-character/different-timeline impersonation can be allowed.
- **Memory isolation** (`epic-memory-isolation-design`): impersonated character memories currently provisioned normally; no isolation filters yet.

## Related

- `.plan/epics/epic-frontend-chat-commands.md` — `/impersonate` dispatch wiring
- `.plan/epics/epic-character-core-system.md` — character actors (impersonation targets)
- `.plan/epics/epic-character-multi-personality.md` — persona-adjacent identity
- `.plan/epics/epic-group-chat.md` — multi-user chats where the constraint applies
- `.plan/epics/epic-assistant-gm-flows.md` — assistant/GM prompt flows
- `.plan/epics/epic-timeline-system.md` — deferred timeline-scoped constraint
- `.plan/epics/epic-memory-isolation-design.md` — open memory-isolation gap
- `docs/spec/character-spec.md` — character/persona model reference
- `docs/spec/impersonation.md` — full spec
