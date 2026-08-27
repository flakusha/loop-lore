# BUG: NSFW gate fail-open: DB error and missing prefs default to allowed

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/hooks/nsfw-hook.ts:68 bare catch{} around getEffectiveNsfw falls through to policy check on DB failure (fail-open). src/nsfw/moderation-service/overrides.ts:52 prefs?.nsfwEnabled ?? true defaults NSFW enabled when missing/corrupt. Length bypasses: nsfw-hook.ts:46 skips gate for content <=20 chars, moderation-hook.ts:110 skips scan <=10 chars (trivial evasion). Fix: fail-closed defaults (nsfwEnabled ?? false), no length exemption.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
