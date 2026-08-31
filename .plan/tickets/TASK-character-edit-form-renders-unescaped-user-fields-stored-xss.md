# TASK: Character edit form renders unescaped user fields (stored XSS)

**Status:** done
**Priority:** high
**Effort:** Medium

## Summary

src/routes/views/character-edit-form.ts:125,127 interpolates v.name/v.desc into value=/textarea without escapeHtml; imported character cards render attacker content in victim browser. Fix: wrap all v.* in escapeHtml. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (commit 5dd6ff40)

All `v.*` interpolations in `src/routes/views/character-edit-form.ts` (name, desc, systemPrompt, personality, welcome, scenario, mesExample, postHistory, avatarId) wrapped in `escapeHtml()`. New `src/routes/views/character-edit-form.test.ts` covers the 9 fields.
