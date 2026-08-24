# TASK: Crafting uses shared sync connection causing database-is-locked

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/rpg/crafting/process.ts:36,160 upsertActorItem/consume compute ex.quantity + qty in JS inside trx; two overlapping attemptCraft on same actor share one bun:sqlite sync connection, so second BEGIN errors database is locked or both read same committed qty (lost update). Fix: serialize per-actor mutex, use SQL quantity=quantity+/-n, raise busy_timeout; one-connection txn model is fragile. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
