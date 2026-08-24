# TASK: Asset upload path traversal enables arbitrary file write

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

filename split on dot keeps slashes and dots; storage_path built from raw filename then writeFileSync escapes upload root. Any authenticated upload writes outside uploadDir. Fix: basename + strip separators; whitelist extension; assert resolved path within uploadDir. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
