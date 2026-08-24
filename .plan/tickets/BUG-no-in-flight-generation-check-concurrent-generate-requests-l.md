# BUG: No in-flight generation check — concurrent generate requests last-wins abort

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/generate-route/handler.ts:159 — no idempotency/in-flight check before startGenerationTracking; concurrent POST /generate for same chat → new attempt silently aborts old mid-stream, first client gets dead stream. hasInFlightGeneration() exists (cancellation-actions/inflight.ts:12) but never called. Fix: check per chatId before registering.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
