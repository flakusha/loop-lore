# TASK: Hook chain and moderation robustness in generation pipeline

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/hooks/registry.ts:51 — runHookChain no per-hook try/catch; one throwing hook rejects whole chain, remaining hooks skipped. Wrap execute() per hook. Also :19 module-level mutable registeredHooks shared across requests/tests (clearHooks nukes another's chain). moderation-hook.ts:65 — 'hate'/'rude'/'offensive' keyword severity suppresses fictional RP dialogue wholesale ('I hate you'); needs context-aware gating not term presence. Minor stream-to-client.ts:91 buffer.append re-appends full content every chunk → O(n²) memcpy on long streams; append delta instead.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
