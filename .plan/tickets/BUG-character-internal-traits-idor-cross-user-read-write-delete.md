# BUG: character internal traits IDOR cross-user read write delete

**Status:** done
**Priority:** high
**Effort:** Small

## Summary

Location: src/routes/character-internal-traits/index.ts (GET/PUT/DELETE /api/character-internal-traits?actorId=..., GET /prompt?actorId=...).

Symptom: Every handler calls requireUserId(ctx) (auth only) but the returned userId is never used to authorize. The operation targets the client-supplied ?actorId query param directly (svc().get/upsert/delete/buildPromptSection(actorId)). No checkActorOwnership / can(admin.character). Confirmed by direct source read. Result: ANY authenticated user can read, overwrite, and DELETE another user's character internal traits (aspirations, moral disposition, autonomy, coping, voice), and leak hidden aspirations via /prompt?includeHidden=true. Classic IDOR (CWE-639). Sibling character-* routes all use checkActorOwnership/requireActorAccess.

Root cause: this route group was added without the ownership check that the rest of the character module applies.

Fix: authorize actorId via checkActorOwnership(database, actorId, userId, role) (owner_id === userId || can(admin.character)) before each op, returning 403/404 on denial.

Acceptance: cross-actor access denied (404/403); owner/admin succeeds; regression test for cross-user read/write/delete added.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed by prior commits `06ca7e9d` (PUT/DELETE ownership check) and `f2f0eb26` (GET/prompt ownership check) on `dev`. All handlers in `src/routes/character-internal-traits/index.ts` now authorize `actorId` via ownership before each op.
