<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: chat-swipe-index-race test uses Promise.all (JS-thread serial, no real race)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Audit found test/messaging/swipe-race.test.ts uses Promise.all to exercise concurrent swipe index updates, but Promise.all on the JS event loop serializes async functions at the microtask checkpoint — only the database I/O runs concurrently. The test cannot reproduce a true concurrent race on the same row. Suggested: switch to bun:test --maxConcurrency with real DB locks, or use a separate worker thread, or assert via raw SQL after Promise.all settles. See audit .tmp/audit/batch-C-rbac-refactor.md finding HIGH-1.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
