# BUG: nsfw: levelToRating maps unknown levels to SFW (fail-open)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/hooks/nsfw-rating.ts lines 12-35: unknown level strings fall through to SFW (severity 0), the most permissive. Unrecognized LLM ratings pass as allowed. Fix: default unknown levels to the strictest rating (e.g. NSFW_EXTREME) or throw. Note: getEffectiveNsfw defaulting to enabled:true for missing prefs (overrides.ts line 52) is intentional opt-out per code comment and schema default, NOT a bug.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
