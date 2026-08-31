# TASK: Character traits page injects unescaped goal into innerHTML (stored XSS)

**Status:** done
**Priority:** high
**Effort:** Medium

## Summary

src/frontend/pages/characters-traits.ts:66 sets value equals a.goal inside innerHTML; a.goal is user trait text. Fix: wrap with escapeHtml. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (commit 5dd6ff40)

`renderAspirations()` in `src/frontend/pages/characters-traits.ts` now wraps `a.goal` in `escapeHtml()` before interpolating into `innerHTML`. New `src/frontend/pages/characters-traits.test.ts` covers the wrap.
