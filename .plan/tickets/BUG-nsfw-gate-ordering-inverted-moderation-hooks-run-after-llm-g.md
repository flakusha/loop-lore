# BUG: NSFW gate ordering inverted: moderation hooks run after LLM generation

**Status:** ✅ Closed (commit 49731047 — fix(nsfw): gate correctness cluster)
**Priority:** high
**Effort:** Medium

## Summary

NSFW/moderation hooks execute post-LLM at src/generation/auto-gen/auto-generation.ts:148-163. callLlm fires first (full cost), then runContentHooks gates storage; any streaming/effects added later leak ungated content. Pre-generation middleware (checkNsfwWithConsent, checkChatNsfwAccess) wired to nothing in generation paths. Fix: resolve gate pre-LLM; post-hoc hooks only as defense-in-depth.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
