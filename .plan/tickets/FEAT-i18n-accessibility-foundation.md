# FEAT: i18n & Accessibility Foundation

**Status:** 🟡 In Progress
**Priority:** high
**Effort:** Large
**Epic:** epic-i18n

## Summary

Server-side i18n module (req.t), ARIA pass, keyboard navigation, 10 locales. Client-side __() already exists, needs server-side middleware. High priority for user-facing work.

## Linked Tasks

| Task                            | Phase | Title                                | Status        |
| ------------------------------- | ----- | ------------------------------------ | ------------- |
| TASK-i18n-locale-completion     | 1     | Complete non-English locale files    | ✅ Complete   |
| TASK-i18n-reconciliation-script | 1.5   | Validate locale files, detect drift  | ✅ Complete   |
| TASK-i18n-route-adoption        | 2     | Wire ctx.t() into route handlers     | ✅ Complete   |
| TASK-i18n-template-adoption     | 3     | Replace hardcoded strings in views   | ✅ Complete   |
| TASK-i18n-alpine-client         | 4     | Add Alpine.js $t magic property      | ✅ Complete   |
| TASK-i18n-settings-wiring       | 5     | Wire locale switcher to re-render UI | ✅ Complete   |
| Frontend component strings      | 3.5   | Replace hardcoded strings in Alpine  | ✅ Complete   |

## Summary

All 10 locales complete at 1070 keys. Template adoption finished (layout `User` placeholder
wired to `common.user`). Frontend component strings closed: ~105 hardcoded toast/status/notification
strings across 31 Alpine components now resolve through `t()` against `__localeStrings`
(toasts.*, status.*, commands.*, notifications.type* namespaces + 207 new keys × 9 locales
translated). See `.plan/backlog/open.md` row 8.

## Acceptance Criteria

- [x] All 10 locales have complete catalogs (1070 keys each)
- [x] Route error messages use `ctx.t()` (no hardcoded English)
- [x] HTML templates use `{{ t() }}` (no hardcoded English)
- [x] Alpine.js `$t` magic property works
- [x] Settings locale switcher re-renders UI
- [x] Frontend Alpine components use `t()` (no hardcoded toast/status strings)
- [ ] ARIA pass complete
- [ ] Keyboard navigation works
- [x] `bun run check` passes (3 pre-existing failures unrelated to i18n: lint-ts debt, dprint debt, size-strict debt — see backlog A5/A6)
- [x] Tests passing (3378 unit tests, incl. 198 frontend Alpine tests)
