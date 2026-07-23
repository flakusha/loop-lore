# TASK: Fix Crypto Test Isolation Issue

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Med
**Epic:** epic-testing-qa

## Summary

All 138 crypto/encryption tests pass in isolation but ~20 fail when run with the full suite. Classic shared state pollution — likely from `tree/chat-lifecycle/` tests or other global singletons.

## Current State

- **Isolated:** 138/138 pass (0 failures)
- **Full suite:** ~20 crypto failures (all in encryption tests)
- **Likely cause:** Another test file modifies global crypto state (key registry, encryption context, or DB connection) that persists across test files

## Investigation Steps

- [ ] Run crypto tests with `--isolate` flag — do they pass?
- [ ] Identify which test file, when run before crypto tests, causes the failures
- [ ] Binary search: run crypto tests after each test file to find the polluter
- [ ] Common suspects: provider registry, stream buffer, plugin registry, DB singleton

## Tasks

- [ ] Find the polluting test file(s) via binary search
- [ ] Fix the polluter: add `beforeEach`/`afterEach` cleanup, or reset shared state
- [ ] Verify crypto tests pass in both isolated and full suite modes
- [ ] Document the fix pattern for preventing future regressions

## Acceptance Criteria

- [ ] 138/138 crypto tests pass in full suite (not just isolated)
- [ ] Root cause documented
- [ ] Cleanup pattern applied to prevent recurrence

## Files

- `src/crypto/**/*.test.ts` — crypto test files
- `src/crypto/key-registry.ts` — potential shared state
- `src/encryption/**/*.test.ts` — encryption test files
