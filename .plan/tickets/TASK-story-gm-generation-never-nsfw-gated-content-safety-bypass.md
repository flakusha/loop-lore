# TASK: Story/GM generation never NSFW-gated (content safety bypass)

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium

## Summary

src/generation/auto-gen/story-mode.ts:169 invokes runHookChain with eventTypes emotion_change only; registry skips NsfwHook (events nsfw_gate/privacy_check), so story/GM generation is never NSFW-gated and content is stored unfiltered. Fix: add nsfw_gate/privacy_check to story-mode eventTypes or build full context like runContentHooks. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
