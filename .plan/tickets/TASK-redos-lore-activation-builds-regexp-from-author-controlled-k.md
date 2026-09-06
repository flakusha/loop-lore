# TASK: ReDoS: lore activation builds RegExp from author-controlled key

**Status:** ✅ Resolved (already fixed on dev)
**Priority:** critical
**Effort:** Medium

## Summary

src/assistant/prompt/sections/lore-activation.ts:45 does new RegExp(key,'i') from lore keys (key_type regex) which are author/imported-character-card controlled, then runs .test on scanned conversation per message. No backtracking guard; malicious card freezes every chat turn. Fix: validate with safe-regex/RE2, cap length, reject nested quantifiers, run in worker with timeout. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Bookkeeping (bugfix-round-7 audit): `compileKeyRegex` in `src/assistant/prompt/sections/lore-activation.ts` already routes through `compileSafeRegExp`, which rejects catastrophic-backtracking shapes; invalid patterns are treated as no-match. Verified present on dev 2026-09-06; ticket was stale.
