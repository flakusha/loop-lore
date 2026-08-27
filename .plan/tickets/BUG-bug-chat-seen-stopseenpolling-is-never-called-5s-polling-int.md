# BUG: BUG: chat-seen stopSeenPolling is never called; 5s polling interval leaks

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/frontend/alpine/chat-seen.ts startSeenPolling (called from chat-messages.ts loadMessages) sets a 5s setInterval that polls loadAllSeen. stopSeenPolling is defined and typed but has no caller, so the interval is never cleared on chat switch or component teardown, causing a leak and continued polling of a stale view. Fix: call stopSeenPolling on chat unmount / activeChat change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
