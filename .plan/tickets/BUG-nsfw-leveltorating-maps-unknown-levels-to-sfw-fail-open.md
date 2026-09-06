# BUG: nsfw: levelToRating maps unknown levels to SFW (fail-open)

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/hooks/nsfw-rating.ts lines 12-35: unknown level strings fall through to SFW (severity 0), the most permissive. Unrecognized LLM ratings pass as allowed. Fix: default unknown levels to the strictest rating (e.g. NSFW_EXTREME) or throw. Note: getEffectiveNsfw defaulting to enabled:true for missing prefs (overrides.ts line 52) is intentional opt-out per code comment and schema default, NOT a bug.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in `a71d784f` (round 3): `levelToRating` in `src/generation/hooks/nsfw-rating.ts` now defaults unknown level strings to `NSFW_EXTREME` (severity 4, fail-closed) instead of SFW. Detected at 2026-09-06: two existing LLM-classifier tests in `hooks.test.ts` regressed because the `"none"` detection level also mapped to EXTREME (severity 4) in the escalation comparison, making the LLM rating never beat keyword-clean content. Added `NSFW_LEVEL_SEVERITY` (none=0..extreme=4) for the hook's escalation comparison only — enforcement contracts keep the strict `levelToRating` default. All hooks tests green.
