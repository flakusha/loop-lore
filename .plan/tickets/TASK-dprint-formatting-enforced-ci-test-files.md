# TASK: dprint formatting enforced ci test files

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** review-dev-2026-08-26-late-merges

## Summary

8703abb3 is a pure dprint reformat of src/nsfw/moderation-service/data.test.ts (78 insertions / 78 deletions, no logic). This churn indicates new test files are not consistently dprint-formatted before merge. Follow-up: ensure the dprint formatting gate or pre-commit hook covers new test files so formatting drift is caught automatically rather than as a separate cleanup commit. Tooling hygiene, not a code fix.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
