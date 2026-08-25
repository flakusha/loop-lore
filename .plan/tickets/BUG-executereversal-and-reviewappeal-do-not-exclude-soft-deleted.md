# BUG: executeReversal and reviewAppeal do not exclude soft-deleted moderation_actions — deleted actions can be reinstated or re-appealed

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

appeal-reversal.ts:62 executeReversal selects from moderation_actions WHERE id = appeal.action_id without filtering deleted_at IS NULL. appeals.ts:151 reviewAppeal UPDATE moderation_actions SET superseded_by WHERE id = appealRow.action_id with the same gap. deleteUserData.ts (added 2026-08-25) soft-deletes rows with .where('deleted_at', 'is', null,).without deleted_at filter, a soft-deleted action can be re-superseded or its reversal processed, violating audit integrity. Fix: add .where('deleted_at', 'is', null,) to both queries (applied in hardening-lowmed worktree).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
