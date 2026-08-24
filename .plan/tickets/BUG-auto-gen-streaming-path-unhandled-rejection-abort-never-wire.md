# BUG: Auto-gen streaming path: unhandled rejection + abort never wired to provider stream

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/auto-gen/call-llm.ts:121 — .then() without .catch (unhandled rejection if processStreamingChunk throws); throwIfAborted() inside detached .then throws into discarded promise and never aborts the callWithFailover stream (no AbortController wired). Repetition/policy auto-cancel silently ineffective on auto-gen path. Also tracking?.attemptId ?? '' disables detection silently instead of failing loud.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
