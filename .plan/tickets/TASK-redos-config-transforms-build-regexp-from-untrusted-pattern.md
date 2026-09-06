# TASK: ReDoS: config transforms build RegExp from untrusted pattern

**Status:** ✅ Resolved (already fixed on dev)
**Priority:** high
**Effort:** Medium

## Summary

src/generation/transforms.ts:47 does new RegExp(t.pattern, t.flags) from config transforms applied to LLM output via match/replace; no backtracking guard. Adversarial shared preset or untrusted config causes ReDoS. Fix: safe-compile plus timeout; treat transform patterns as untrusted. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Bookkeeping (bugfix-round-7 audit): `src/generation/transforms.ts` already compiles transform patterns via `compileSafeRegExp` with an explicit untrusted-source comment; non-compiling patterns are skipped. Verified present on dev 2026-09-06; ticket was stale.
