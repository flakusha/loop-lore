# BUG: nsfw: NsfwHook blocked-by-override and blocked-by-error paths omit actorId/chatId

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/hooks/nsfw-hook.ts lines 83-106: the blocked-by-override (line 85) and blocked-by-error (line 103) returns omit actorId and chatId from the data payload, unlike every other return path. Downstream resolveActorIdFromEvents misses these events and falls back to caller-provided fallback on the two most safety-critical paths. Fix: include actorId/chatId in those payloads.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in `c7c93393` (round 4): `blocked_by_override` and `blocked_by_error` data now include `actorId` and `chatId`, matching every other return path so `resolveActorIdFromEvents` never falls back on the two safety-critical paths. The same commit repaired a round-3 collateral regression: the LLM-escalation comparison used `levelToRating` (whose fail-closed `"none"` → EXTREME default outranked real LLM ratings), so it now compares via `NSFW_LEVEL_SEVERITY` (none=0..extreme=4). `src/generation/hooks/hooks.test.ts` asserts `actorId`/`chatId` on both blocked paths and the LLM classifier reaching intense/extreme.
