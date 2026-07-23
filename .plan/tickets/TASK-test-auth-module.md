# TASK: Add unit tests for auth module (2 files, 0 tests)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-logic-reconciliation

## Summary

The `src/auth/` module has 2 source files and 0 test files. Authentication is security-critical.

## Files to Test

| File       | Lines | Key Functions          |
| ---------- | ----- | ---------------------- |
| `jwt.ts`   | ~100  | `signJwt`, `verifyJwt` |
| `index.ts` | ~50   | Auth entry point       |

## Acceptance Criteria

- [ ] JWT signing/verification tested
- [ ] Invalid token handling tested
- [ ] Expired token handling tested
- [ ] All tests pass: `bun test src/auth/`
