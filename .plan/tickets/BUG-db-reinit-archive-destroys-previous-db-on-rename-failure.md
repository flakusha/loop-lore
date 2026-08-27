# BUG: db reinit archive destroys previous db on rename failure

**Status:** ✅ Resolved (commit 19d136b8 — archive previous database before reinit instead of deleting)
**Priority:** high
**Effort:** Large
**Epic:** review-dev-2026-08-26-security-data-integrity-merges

## Summary

src/db/reinit.ts archiveFile() falls back to unlinkSync(p) on ANY renameSync failure (catch-all). On cross-device rename (EXDEV) or permission errors, the previous database is DELETED instead of preserved - defeating the archive-instead-of-delete feature (commit 19d136b8). If rename throws, the fallback unlinkSync is uncaught (reinit crashes); on EACCES the unlink also throws uncaught. Fix: on rename failure, copyFileSync to backup then unlinkSync source; never unlink unless a copy succeeded.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
