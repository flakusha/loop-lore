# BUG: executeReversal and reviewAppeal do not exclude soft-deleted moderation_actions — deleted actions can be reinstated or re-appealed

**Status:** ✅ Done (worktree fix-nsfw-soft-deleted-exclusion)
**Priority:** medium
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

appeal-reversal.ts:62 executeReversal selects from moderation_actions WHERE id = appeal.action_id without filtering deleted_at IS NULL. appeals.ts:151 reviewAppeal UPDATE moderation_actions SET superseded_by WHERE id = appealRow.action_id with the same gap. deleteUserData.ts (added 2026-08-25) soft-deletes rows with .where('deleted_at', 'is', null,).without deleted_at filter, a soft-deleted action can be re-superseded or its reversal processed, violating audit integrity. Fix: add .where('deleted_at', 'is', null,) to both queries (applied in hardening-lowmed worktree).

## Acceptance Criteria

- [x] Implementation complete — no source change required; `appeals.ts:178` UPDATE and `appeals-reversal.ts:68` SELECT already filter `deleted_at IS NULL` (commit 7d725b49). The proposed SELECT filter on `moderation_appeals.deleted_at` is structurally impossible — the column does not exist in `schema-moderation.ts` / migration 021.
- [x] Tests passing — `appeals.test.ts` extended with 3 soft-deletion regression tests: (a) reviewAppeal does NOT update `superseded_by` when the underlying action is soft-deleted; (b) reviewAppeal still emits the `pending_reversal` audit row for audit integrity; (c) executeReversal throws on a soft-deleted action. `bun test src/nsfw/` → 82 pass / 0 fail.
- [ ] Documentation updated — not required; ticket body already describes the resolved invariant.
