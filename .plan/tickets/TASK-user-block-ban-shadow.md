# TASK: User Block, Ban & Shadow

**Status:** ⬜ Not Started
**Priority:** low (moderation — postpone)
**Effort:** High
**Epic:** EPIC-2026-36

## Summary

User block/ban primitives + shadow rendering.

## Scope

- Block users: prevent contact/chatting
- Bans: admin-level removal
- Shadow/collapse: hide messages for other viewers
- Permission checks for all actions

## Acceptance Criteria

- [ ] Block user functionality
- [ ] Ban user functionality
- [ ] Shadow/collapse rendering
- [ ] Permission checks
- [ ] Tests: all moderation actions

## Files

- `src/chat/moderation.ts` (new)
- `src/db/schema.ts` (modify)

## Related

- Epic 36 (Chat Lifecycle & Moderation)
