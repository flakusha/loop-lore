# EPIC: Impersonation System

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med–High
**Type:** Feature Epic

## Summary

Character impersonation — 1 character can be impersonated once per world (except disconnected/private chats). Memories and isolation implications.

## Scope

- Character impersonation per world
- Memory implications (impersonated character's memories)
- Isolation (impersonated character's context)
- Disconnected/private chat exceptions
- Impersonation controls (start, stop, switch)

## Design

### Rules

| Scenario          | Impersonation Allowed   |
| ----------------- | ----------------------- |
| World chat        | 1 character per world   |
| Private chat      | No limit (disconnected) |
| Disconnected chat | No limit                |
| Group chat        | 1 character per world   |

### Memory Implications

- Impersonated character's memories are shared with user
- User's persona affects impersonated character's context
- Impersonation history tracked per world

## Tasks

- [ ] Impersonation model (`chat.impersonate_id`)
- [ ] Impersonation API endpoints
- [ ] Impersonation UI controls
- [ ] Memory sharing logic
- [ ] Isolation enforcement
- [ ] Impersonation history

## Files

- `src/db/schema-chats.ts` — impersonation columns
- `src/routes/chats.ts` — impersonation endpoints
- `src/frontend/alpine/chat.ts` — impersonation UI
- `src/assistant/prompt/sections/` — impersonation context

## Linked Tasks

- TASK-impersonation.md
