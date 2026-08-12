# TASK: E2E browser reliability hardening

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-e2e-integration-testing

## Summary

Web-first polling (replace fixed sleeps); promote trackPageErrors/assertNoPageErrors to default harness so every browser test fails on pageerror/console.error; per-test try/finally page isolation (kill failure cascade); decide @playwright/test runner adoption or drop dead playwright.config.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
