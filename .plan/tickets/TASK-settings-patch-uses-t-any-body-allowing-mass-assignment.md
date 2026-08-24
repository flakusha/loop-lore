# TASK: Settings PATCH uses t.Any body allowing mass assignment

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/settings.ts:133 declares body: t.Any() and merges arbitrary fields into user settings. Fix: attach strict SettingsUpdateBody schema. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
