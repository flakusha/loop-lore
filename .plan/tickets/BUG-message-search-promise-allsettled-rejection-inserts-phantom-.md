# BUG: message-search Promise.allSettled rejection inserts phantom row

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

In src/routes/message-search/index.ts (commit e8e7a23d), the rejected-path stub in the Promise.allSettled handler (lines ~179-189) constructs a result with messageId='unknown', chatId='unknown', createdAt=epoch-zero. This inserts a phantom row into the response that does not correspond to any DB row, breaks client pagination (the phantom row counts toward hasMore/total), and leaks 'unknown' as a foreign-key-like value that downstream UIs may try to dereference.

Correct behavior: skip the rejected row entirely (don't push), or attach the original row's id+chatId with content='[Encrypted — unable to decrypt]' so the client can correlate. The original  variable is in scope inside the .map() callback, so the closure is available.

Severity: medium (correctness + UX).

Fix: rewrite the .map() callback to return {row, resolvedContent} tuples, then push the result with original ids on success and skip (or use original ids with placeholder content) on failure. Also: keep counts honest — the failure-path row should not bump the page size past the requested limit.

Tests: regression covering a 1-row search where that row's resolveMessageContent throws — assert results.length === 0 OR results[0].messageId matches the original DB id, never 'unknown'.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
