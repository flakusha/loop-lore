# TASK: Wiring + dead-code check gate

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-e2e-integration-testing

## Summary

scripts/check-wiring.ts added to check-parallel.mjs: every routes/*.ts mounted in elysia-app.ts, every plugins/core+community plugin registered+loaded via register-plugins.ts, every service has >=1 importer; route-test coverage assertion; tighten knip (re-enable exports analysis) keeping documented ignoreDependencies.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
