# TASK: Solo-user cold-start race caches phantom uid

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/auth/solo-user.ts:55-95 getOrCreateSoloUserForAuth: concurrent calls both miss cache, both try insert; loser insert fails unique constraint (caught) but soloId stays the phantom uid, then cache.set(id: phantom). All later solo auth uses non-existent user until resetSoloUserCache(). Fix: on insert failure re-SELECT real id before caching, or INSERT ON CONFLICT and re-read. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
