# FEAT: i18n & Accessibility Foundation

**Status:** 🟡 In Progress
**Priority:** high
**Effort:** Large
**Epic:** epic-i18n

## Summary

Server-side i18n module (req.t), ARIA pass, keyboard navigation, 10 locales. Client-side __() already exists, needs server-side middleware. High priority for user-facing work.

## Linked Tasks

| Task                        | Phase | Title                                | Status         |
| --------------------------- | ----- | ------------------------------------ | -------------- |
| TASK-i18n-locale-completion | 1     | Complete non-English locale files    | ⬜ Not Started |
| TASK-i18n-route-adoption    | 2     | Wire ctx.t() into route handlers     | ⬜ Not Started |
| TASK-i18n-template-adoption | 3     | Replace hardcoded strings in views   | ⬜ Not Started |
| TASK-i18n-alpine-client     | 4     | Add Alpine.js $t magic property      | ⬜ Not Started |
| TASK-i18n-settings-wiring   | 5     | Wire locale switcher to re-render UI | ⬜ Not Started |

## Acceptance Criteria

- [ ] All 10 locales have complete 234-key catalogs
- [ ] Route error messages use `ctx.t()` (no hardcoded English)
- [ ] HTML templates use `{{ t() }}` (no hardcoded English)
- [ ] Alpine.js `$t` magic property works
- [ ] Settings locale switcher re-renders UI
- [ ] ARIA pass complete
- [ ] Keyboard navigation works
- [ ] `bun run check` passes
- [ ] Tests passing
