# BUG: NsfwModerationService missing getOrCreateOwn wiring — block/ban/shadow all return 400

**Status:** [OK] Resolved (class now binds getOrCreateOwn via arrow-field dispatcher; regression test in preferences.test.ts verifies the binding; bun test src/nsfw/ — 60 pass / 0 fail)
**Priority:** high
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

mod-actions.ts (changed 2026-08-25) calls thisL.getOrCreateOwn(targetUserId) in blockUser and banUser, but NsfwModerationService class in index.ts only wires getPreferences and updatePreferences from preferences.ts. The getOrCreateOwn export is never imported. The double-cast (this as unknown as NsfwModerationServiceContext) silences the type checker. Result: every POST /api/nsfw/moderation/{block,ban,shadow} throws TypeError: thisL.getOrCreateOwn is not a function and returns 400. Test actions.routes.test.ts:133 fails (expects 200, got 400). Fix: import getOrCreateOwn from preferences.ts and add a class method delegate identical to getPreferences.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
