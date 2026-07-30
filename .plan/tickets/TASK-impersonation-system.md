# TASK: Impersonation System

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-impersonation

## Summary

Character impersonation — 1 character can be impersonated once per world (except disconnected/private chats). Memories and isolation implications. From `epic-impersonation.md`.

## Scope

### Impersonation Model

- `chat.impersonate_id` column
- Impersonation rules (once per world, not in private chats)
- Memory implications

### Impersonation API

- Start/stop impersonation endpoints
- Impersonation state management
- Context isolation

### Impersonation UI

- Impersonation controls in chat
- Visual indicator of impersonation
- Impersonation history

## Linked Epics

- `epic-impersonation.md`

## Acceptance Criteria

- [ ] Impersonation model with `chat.impersonate_id`
- [ ] Impersonation rules (once per world, not in private chats)
- [ ] Memory implications for impersonated character
- [ ] Start/stop impersonation API endpoints
- [ ] Context isolation for impersonated character
- [ ] UI controls for impersonation
- [ ] Visual indicator of impersonation state
- [ ] Unit tests for impersonation logic
- [ ] Integration tests for impersonation workflow

## Notes

- Reference `epic-impersonation.md` for full system design
- Consider memory sharing/isolation between characters
- Balance impersonation power vs. game balance
