# TASK: Non-isolated bun test src/ red: shared-state contamination

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

bun test src/ (no --isolate) fails 45 tests; gate bun run test:unit (--isolate) green 5005/1. Residual 45 failures are SHARED-STATE (real DB/config/singletons mutated across files in one non-isolated process), proven: admin.test.ts + assets/metadata.test.ts PASS alone (19/0, 11/0) but FAIL in full suite. Mock-leak subset IS fixable via ISOLATED guard (5 files guarded, 8 failures fixed 53->45; 12 alpine ./htmx leakers still unguarded). Shared-state subset cannot be skipped without disabling most backend tests. Options: (A) use bun run test:unit locally, (B) bunfig.toml isolate=true (only robust fix but rejected earlier), (C) guard 12 alpine for mock-leak subset only. Decide tomorrow.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
