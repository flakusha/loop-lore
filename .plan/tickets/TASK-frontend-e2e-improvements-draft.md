# TASK: Frontend E2E Improvements (Draft)

**Status:** ⬜ Draft — investigate later
**Priority:** Low
**Effort:** High (estimated)

## Summary

Improve frontend E2E test coverage and reliability. Currently 12/158 e2e failures remain, mostly in browser-based tests.

## Current State

### Passing (146/158)

- Auth flows (login, demo, register)
- Chat operations (create, send, receive)
- Message operations (edit, delete, archive)
- Character CRUD
- World CRUD
- Asset upload/link
- Settings
- Gallery

### Failing (12/158)

| Area                              | Failures | Root Cause                                 |
| --------------------------------- | -------- | ------------------------------------------ |
| Assets (POST /api/assets)         | 4        | Multipart upload endpoint or asset service |
| Import (POST /api/actors/import)  | 6        | Import succeeds but GET returns non-ok     |
| Chat Full (asset upload)          | 1        | Same as Assets                             |
| Story (GET /api/worlds/:id/items) | 1        | Items endpoint returns falsy               |

### Browser Tests (Flaky)

| Test                 | Issue                                        |
| -------------------- | -------------------------------------------- |
| smoke.test.ts        | `data-testid` mismatches, chrome timeout     |
| auth-flow.browser.ts | `data-testid` mismatch                       |
| chat-flow.browser.ts | Only tests panel toggles, no message sending |

## Investigation Areas

### 1. Asset Upload Fixes

- [ ] Debug multipart upload endpoint
- [ ] Check asset service for missing dependencies
- [ ] Verify file system permissions in test environment

### 2. Import Flow Fixes

- [ ] Debug actor import endpoint
- [ ] Check GET /api/actors/:id after import
- [ ] Verify database state after import

### 3. Story Items Fixes

- [ ] Debug GET /api/worlds/:id/items
- [ ] Check items endpoint response format
- [ ] Verify world-actor relationships

### 4. Browser Test Stabilization

- [ ] Update `data-testid` selectors to match current UI
- [ ] Add explicit waits for async operations
- [ ] Implement proper page load detection
- [ ] Add retry logic for flaky assertions

### 5. Test Infrastructure

- [ ] Implement shared fixtures for browser tests
- [ ] Add proper cleanup between tests
- [ ] Implement test data factories
- [ ] Add screenshot capture on failure

## Future Enhancements

### Coverage Expansion

- [ ] Add tests for all CRUD operations
- [ ] Add tests for error states (400, 401, 403, 404, 500)
- [ ] Add tests for pagination
- [ ] Add tests for search/filter
- [ ] Add tests for bulk operations

### Performance

- [ ] Implement test parallelization
- [ ] Add test timing reports
- [ ] Optimize test data setup
- [ ] Reduce test file dependencies

### Reliability

- [ ] Add retry logic for network-dependent tests
- [ ] Implement proper state cleanup
- [ ] Add timeout handling
- [ ] Implement test isolation

## Success Criteria

- [ ] All 158 e2e tests pass consistently
- [ ] Browser tests stable (no flakiness)
- [ ] Test suite runs in < 5 minutes
- [ ] No shared mutable state between tests
- [ ] Proper cleanup after each test

## Risk

High — requires significant investigation and refactoring. May reveal deeper architectural issues.
