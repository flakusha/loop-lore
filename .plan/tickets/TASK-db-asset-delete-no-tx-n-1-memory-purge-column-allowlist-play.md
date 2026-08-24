# TASK: DB: asset delete no tx, N+1 memory purge, column allowlist, playthrough ownership

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/assets/service/delete.ts:12-26 three deletes plus unlink with no transaction (orphan link/dangling file); src/memory/purge.ts:61,108,135 per-row UPDATE/DELETE inside loops (N+1); src/db/optimistic-locking.ts:90 builds sql.ref from updates keys without column allowlist (mass-assignment if body-sourced); src/rpg/replayability/service/playthrough.ts:139,170 UPDATE WHERE id only, no user_id ownership. Fix per .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
