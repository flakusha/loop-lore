# BUG: E2E: actor-import and asset endpoints return 500 where 4xx validation expected

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Evidence 2026-08-25: after repairing an unrelated parse crash in src/generation/auto-gen/prepare-generation.ts (abandoned WIP), 194 e2e tests ran with 29 failures (165 pass): Import E2E rejects unsupported extension / missing file field / invalid JSON / actor without name all expect 400 but receive 500 (tests/e2e/flows/import.test.ts:95 et al); Assets E2E upload, list, link, share-body, delete fail similarly. Pattern indicates unhandled exceptions ahead of validation in multipart handling, possibly fallout from ownership-enforcement changes b6c232e5. None of these endpoints were touched by the hash-fix task. Repro: E2E_SAFEGUARD=1 bun run test:e2e. Fix direction: surface validation errors as 400 per endpoint contract; add regression asserts; re-run full suite.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
