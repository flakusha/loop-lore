# TASK: NSFW Gate & Moderation Events

**Status:** ⬜ Not Started
**Priority:** low (moderation — postpone)
**Effort:** Medium
**Epic:** EPIC-2026-36

## Summary

NSFW enable/disable + non-public moderation events.

## Scope

- Per-chat, per-user, per-world NSFW toggle
- Non-public audit of NSFW gate decisions
- Integration with moderation pipeline

## Acceptance Criteria

- [ ] NSFW toggle per chat/user/world
- [ ] Audit log for gate decisions
- [ ] Tests: toggles work, audit logged

## Files

- `src/middleware/nsfw-gate.ts` (new)
- `src/db/schema.ts` (modify)

## Related

- Epic 36 (Chat Lifecycle & Moderation)
