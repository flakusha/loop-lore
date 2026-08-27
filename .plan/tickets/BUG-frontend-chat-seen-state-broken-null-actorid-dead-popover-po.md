# BUG: frontend: chat-seen state broken — null actorId, dead popover, polling leak

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/frontend/alpine/chat-seen.ts: currentActorId is never assigned (line 38 sends null to markSeen, server 400s, feature dead); initSeenPopover (lines 75-83) is never called so the seen popover UI is dead; stopSeenPolling (lines 94-99) is never called on component destroy, leaking a 5s setInterval per remount. Fix: assign currentActorId in bootstrap/userinfo, call initSeenPopover in lifecycle init, call stopSeenPolling in destroy.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
