# TASK: Regex safety: xml-utils tag unescaped, narrative greedy

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/assistant/xml-utils.ts:60-61 interpolates tag unescaped into new RegExp (breaks if tag dynamic); src/regex/narrative.ts:22 and story/quality/scorers/character-voice.ts:11 use greedy /\*.*\*/ (superlinear on long asterisk runs). Fix: escapeRegExp(tag); use lazy /\*.*?\*/. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
