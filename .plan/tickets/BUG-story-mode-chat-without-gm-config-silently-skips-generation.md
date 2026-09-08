# BUG: story-mode chat without gm_config silently skips generation

**Status:** ✅ Done
**Priority:** medium
**Effort:** Small

## Summary

src/generation/auto-gen/story-mode.ts:43-46: gm_config null -> warn+return; triggerAutoGeneration fire-and-forget (reply.ts:81-94) -> user message persisted, no reply, no error. Reachable: chats.test.ts:528 creates {mode:'story'} only. Fix: surface error via maybeAutoReply or auto-create default GM config.

## Resolution

Fixed in `triggerStoryModeGeneration` (`src/generation/auto-gen/story-mode.ts`): when `gm_config` is NULL, a minimal `GameMasterConfig` (`{ type: "llm" }`) is synthesized instead of returning early — `GameMasterService` falls back to LLM mode with defaults, so the fire-and-forget caller still produces a reply. The `log.warn` is kept (operators still see the missing-config signal).

Tests: `src/generation/auto-gen/story-mode.test.ts` (isolated gate via `mock.module` of `../../story`) asserts that with `gmConfig: null` the function constructs `GameMasterService` with `type: "llm"` and executes a turn — i.e. no early return. `npm_lifecycle_event=test:unit bun test src/generation/auto-gen/story-mode.test.ts`: 1 pass.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated