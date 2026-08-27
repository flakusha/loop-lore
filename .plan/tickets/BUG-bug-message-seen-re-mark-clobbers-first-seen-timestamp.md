# BUG: BUG: message-seen re-mark clobbers first-seen timestamp

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/routes/message-seen.ts POST update path sets seen_at = now on every re-mark, and src/chat/service/seen.ts does the same in its onConflict doUpdateSet. Migration 070 comment states seen_at is set when state FIRST reaches seen/processing, but re-marking overwrites it, destroying first-seen semantics used by seen-title/ordering. Fix: only set seen_at when it is currently null (COALESCE / WHERE seen_at IS NULL).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
