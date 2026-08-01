# TASK: EPIC: Impersonation System

**Status:** 🟡 Partially Implemented
**Priority:** Medium
**Effort:** Low (remaining)
**Epic:** epic-impersonation

## Summary

Character impersonation — 1 character can be impersonated once per world (except disconnected/private chats). Personas (user identities) per-chat. Both inject into LLM prompt via `<user_persona>`.

## Implementation Status

### Done

- [x] DB: `impersonate_actor_id` + `persona_id` on `chat_participants`
- [x] API: `PUT /api/chats/:id/impersonate` with 1-per-world constraint
- [x] API: `PUT /api/chats/:id/persona`
- [x] API: Persona CRUD (`/api/personas/*`)
- [x] Service: `updateImpersonation()` with world constraint check
- [x] Service: `updateUserPersona()` helper
- [x] Prompt: `<user_persona>` section (impersonation > persona > none)
- [x] Frontend: Chat actions impersonation toggle + command dispatch
- [x] Frontend: Chat settings persona selector + impersonation toggle
- [x] Frontend: Personas page CRUD
- [x] Commands: `/impersonate` + `/char` with name→actor resolution
- [x] Participants endpoint enriched with actor display_name

### Remaining

- [ ] E2E tests for impersonation flow
- [ ] Memory isolation for impersonated characters

## Linked Epics

- `.plan/epics/epic-impersonation.md`
- `docs/spec/impersonation.md`
