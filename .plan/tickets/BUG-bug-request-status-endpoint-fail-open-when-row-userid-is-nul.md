# BUG: BUG: request status endpoint fail-open when row userId is null

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/requests/status.ts guards ownership only inside if (row.userId !== null); when a request_results row has userId === null the check is skipped entirely and the row is returned to any caller who knows the id. Fix: when userId is null, return 404 (or require admin) rather than serving the row; do not default-allow.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
