# TASK: ReDoS: config transforms build RegExp from untrusted pattern

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/transforms.ts:47 does new RegExp(t.pattern, t.flags) from config transforms applied to LLM output via match/replace; no backtracking guard. Adversarial shared preset or untrusted config causes ReDoS. Fix: safe-compile plus timeout; treat transform patterns as untrusted. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
