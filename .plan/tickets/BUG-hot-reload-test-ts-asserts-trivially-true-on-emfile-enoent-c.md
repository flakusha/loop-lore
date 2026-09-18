# BUG: hot-reload.test.ts asserts trivially-true on EMFILE/ENOENT (coverage regression)

**Status:** ✅ Closed — stale premise verified (2026-09-18)

## Verification

`src/config/hot-reload.test.ts` already stubs `node:fs.watch` with a controllable `stubWatch` (lines 35-50), registers `mock.module("node:fs", …)`, and exercises the reload callback path with a domain config file change (test at line 93). Coverage is non-trivial; the trivially-true assertion concern is moot.
**Priority:** low
**Effort:** Medium

## Summary

In src/config/hot-reload.test.ts (staged rewrite), the reload lifecycle test early-returns on EMFILE/ENOENT and asserts trivially-true conditions instead of exercising reload. Acceptable for inotify-less CI but hot-reload coverage regressed. Revisit with a mock that does not require fs watch.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
