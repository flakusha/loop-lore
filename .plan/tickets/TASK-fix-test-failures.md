# TASK: Fix Unit Test Failures (7 fail, 1 error)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-continuous-improvement

## Summary

Fix 7 failing tests and 1 error in `bun test src/`. Current: 2029 pass, 7 fail, 1 error (2036 total).

## Failure Analysis

### 1. `character_world_traits` table missing (3 failures)

- `SQLiteError: no such table: character_world_traits`
- Tests create DB but schema doesn't include this table
- Fix: Add table to test DB schema in `src/test-utils/create-test-db.ts`

### 2. `db.updateTable is not a function` (1 failure)

- `src/generation/cancellation-actions.test.ts:108`
- Test mock DB doesn't implement Kysely's `updateTable` method
- Fix: Add `updateTable` to test DB mock

### 3. SQL syntax error (1 failure)

- `SQLiteError: near "from": syntax error`
- Likely malformed query in test fixture
- Fix: Check the test that triggers this query

### 4. `document.addEventListener` not a function (1 failure)

- `src/frontend/ui.ts:97`
- Frontend code running in Node/Bun test env without DOM
- Fix: Mock `document` or skip frontend tests in unit suite

### 5. Unhandled error between tests (1 error)

- Likely cascading from one of the above failures

## Execution Plan

1. Run `bun test src/ 2>&1 | grep -B5 'FAIL\|✗'` to get exact test names
2. Fix DB schema issue (add character_world_traits table)
3. Fix mock DB (add updateTable method)
4. Fix SQL syntax error
5. Add DOM mock or skip frontend tests
6. Verify: `bun test src/` passes 2036/2036

## Acceptance Criteria

- [ ] `bun test src/` exits 0 with 0 failures
- [ ] All 2036 tests pass
- [ ] No regressions in existing passing tests
- [ ] Coverage maintained ≥ 75%

## Files

- `src/test-utils/create-test-db.ts`
- `src/generation/cancellation-actions.test.ts`
- `src/generation/cancellation-tracker.ts` (mock reference)
- `src/frontend/ui.ts`
- `tests/setup-globals.ts`
