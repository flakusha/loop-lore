# TASK: Character traits page injects unescaped goal into innerHTML (stored XSS)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/frontend/pages/characters-traits.ts:66 sets value equals a.goal inside innerHTML; a.goal is user trait text. Fix: wrap with escapeHtml. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
