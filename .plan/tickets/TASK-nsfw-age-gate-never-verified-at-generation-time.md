# TASK: NSFW age gate never verified at generation time

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/auto-gen/content-hooks.ts:79 getEffectiveNsfw only checks chat/world/self-pref plus shadow; canAccessNsfw (age-gate accept, underage, auth) is never called on any generation path. Per-turn checkNsfwWithConsent has zero production callers. Enforcement relies solely on self-settable max_rating. Fix: call canAccessNsfw/checkNsfwWithConsent inside hook chain with requesting userId before rating enforcement. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
