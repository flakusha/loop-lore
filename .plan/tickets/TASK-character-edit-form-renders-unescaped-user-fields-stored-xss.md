# TASK: Character edit form renders unescaped user fields (stored XSS)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/views/character-edit-form.ts:125,127 interpolates v.name/v.desc into value=/textarea without escapeHtml; imported character cards render attacker content in victim browser. Fix: wrap all v.* in escapeHtml. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
