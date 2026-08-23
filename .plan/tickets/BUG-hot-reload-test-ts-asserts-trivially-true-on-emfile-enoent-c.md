# BUG: hot-reload.test.ts asserts trivially-true on EMFILE/ENOENT (coverage regression)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

In src/config/hot-reload.test.ts (staged rewrite), the reload lifecycle test early-returns on EMFILE/ENOENT and asserts trivially-true conditions instead of exercising reload. Acceptable for inotify-less CI but hot-reload coverage regressed. Revisit with a mock that does not require fs watch.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
