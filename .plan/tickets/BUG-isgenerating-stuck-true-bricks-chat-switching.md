# BUG: isGenerating stuck true bricks chat switching

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/frontend/alpine/chat-send.ts:85 sets isGenerating=true before POST; if response action maps to non-generation handler (chat-actions/dispatch.ts:36,46) no SSE connects and flag never resets. checkGenerationStatus (chat-generations.ts:114) has zero callers — no recovery poll. selectChat refuses to switch while generating (src/frontend/alpine/chat/world.ts:59) -> UI bricked until reload. Fix: reset flag on all dispatch paths + wire recovery poll.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
