# TASK: Impersonation System

**Status:** 🟡 Partially Implemented
**Priority:** Medium
**Effort:** Low (remaining)
**Epic:** epic-impersonation

## Summary

Impersonation system: `impersonate_actor_id` on `chat_participants`, 1-per-world constraint, name→actor resolution from `/impersonate` command.

## Done

- [x] `impersonate_actor_id` + `persona_id` columns on `chat_participants`
- [x] `PUT /api/chats/:id/impersonate` with world constraint
- [x] `updateImpersonation()` service function
- [x] `/impersonate` + `/char` commands wired to dispatch actions
- [x] `impersonate-select` action resolves character name from participants
- [x] `<user_persona>` prompt section reads impersonated actor
- [x] Frontend toggle + state loading

## Remaining

- [ ] E2E tests
- [ ] Memory shareability filter for impersonated characters

## Acceptance Criteria

- [x] API returns 400 on 1-per-world conflict
- [x] `/impersonate <name>` resolves to actor ID and sets impersonation
- [x] `/impersonate off` clears impersonation
- [ ] Tests passing (e2e)
- [x] Documentation updated
