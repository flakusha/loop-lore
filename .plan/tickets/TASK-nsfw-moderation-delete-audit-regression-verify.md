# TASK: nsfw moderation delete audit regression verify

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** review-dev-2026-08-26-late-merges

## Summary

Regression test for BUG-nsfw-moderation-delete-destroys-audit-log landed in 58ba48dd (src/nsfw/moderation-service/data.test.ts, 221 lines). Asserts moderation_actions soft-deleted (deleted_at set, preserved), user-owned prefs plus reporter flags hard-deleted, audit log_entries row written, idempotent re-run, and exportUserData excludes soft-deleted actions. Verification task (not a fix): confirm the test FAILS on the pre-fix code path (guards the bug, not just green), and confirm BUG-nsfw-moderation-delete-destroys-audit-log is marked fixed or verified in .plan. Bugfix ownership is elsewhere.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
