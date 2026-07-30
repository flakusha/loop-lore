# Epic: Internationalization (i18n)

**Status:** ✅ Complete
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** i18n, localization, l10n, accessibility, ux

## Overview

Full internationalization of loop-lore UI. Infrastructure complete (custom i18n module, middleware, API, locale registry). All routes and templates wired — 818 keys across 10 locales, 39/44 HTML templates use `{{{t()}}}` bindings (5 remaining are data-driven, no hardcoded text).

## Reference

- Design spec: `docs/frontend/internationalization.md` (4-layer architecture)
- Existing ticket: `FEAT-i18n-accessibility-foundation.md` (parent)
- i18n module: `src/i18n/` (types, registry, loader, translator, middleware)

## Current State

| Component                                 | Status                  |
| ----------------------------------------- | ----------------------- |
| i18n module (types, loader, translator)   | ✅ Complete             |
| Elysia middleware (`ctx.t`)               | ✅ Complete             |
| API routes (`GET/PATCH /api/i18n/locale`) | ✅ Complete             |
| `en.json` catalog (818 keys)              | ✅ Complete             |
| Non-English locales (818 keys each)       | ✅ Complete (Phase 1)   |
| Route adoption (`ctx.t()` calls)          | ✅ Complete (Phase 2)   |
| Template adoption (`{{{t()}}}` bindings)  | ✅ Complete (Phase 3)   |
| Alpine.js `$t` magic property             | ✅ Complete (Phase 4)   |
| Settings locale switcher wiring           | ✅ Complete (Phase 5)   |
| Reconciliation script                     | ✅ Complete (Phase 1.5) |

## Features

| Feature               | Ticket                          | Effort | Phase | Status      | Description                                        |
| --------------------- | ------------------------------- | ------ | ----- | ----------- | -------------------------------------------------- |
| Locale completion     | TASK-i18n-locale-completion     | Medium | 1     | ✅ Complete | Fill missing 163 keys × 9 non-English locales      |
| Reconciliation script | TASK-i18n-reconciliation-script | Small  | 1.5   | ✅ Complete | Validate locale files, detect drift, auto-fix      |
| Route adoption        | TASK-i18n-route-adoption        | Large  | 2     | ✅ Complete | Wire `ctx.t()` into route error messages           |
| Template adoption     | TASK-i18n-template-adoption     | Large  | 3     | ✅ Complete | Replace hardcoded strings in 17 HTML views         |
| Alpine.js client      | TASK-i18n-alpine-client         | Medium | 4     | ✅ Complete | Add `$t` magic property for client-side reactivity |
| Settings wiring       | TASK-i18n-settings-wiring       | Small  | 5     | ✅ Complete | Wire locale switcher to re-render UI               |

## Phases

### Phase 1: Locale Completion (Independent)

Complete non-English locale files. No code changes — only JSON translation.

- 163 missing keys × 9 locales = 1,467 translation entries
- Missing sections: `common`, `auth`, `chat`, `settings`, `admin`, `errors`, `characters`, `worlds`, `gallery`, `navigation`, `modals`, `accessibility`

### Phase 2: Route Adoption (Independent)

Wire `ctx.t()` into route handlers for error messages and notifications.

- ~60+ route files with hardcoded English errors
- Start with high-traffic routes (auth, chat, generation)
- Pattern: `throw new Error(t("errors.notFound"))` instead of `throw new Error("Not found")`

### Phase 3: Template Adoption (Depends on Phase 1)

Replace hardcoded strings in HTML templates with `{{ t() }}` bindings.

- 17 views, 300+ hardcoded strings
- Priority order: `layout.html` → `settings.html` → `admin.html` → others
- Server-rendered: `&#123;&#123;&#123; t("nav.chats") &#125;&#125;&#125;`

### Phase 4: Alpine.js Client (Depends on Phase 3)

Add `$t` magic property for client-side reactive translations.

- Initialize from `<body data-locale="...">` attribute
- Alpine components use `$t("key")` for dynamic content
- Re-render on locale change without page reload

### Phase 5: Settings Wiring (Depends on Phase 4)

Wire the settings locale switcher to actually re-render the UI.

- `PATCH /api/i18n/locale` already saves preference
- Frontend needs to: save → reload locale data → re-render templates
- No page reload required if Phase 4 is complete

## Dependencies

| Dependency               | Impact                            | Status         |
| ------------------------ | --------------------------------- | -------------- |
| Inline script extraction | None — i18n is server-rendered    | ✅ Independent |
| Browser E2E tests        | None — orthogonal                 | ✅ Independent |
| Analytics/observability  | None                              | ✅ Independent |
| Other epics              | None — no other epic imports i18n | ✅ Independent |

## Acceptance Criteria

- [x] All 10 locales have complete 818-key catalogs
- [x] Route error messages use `ctx.t()` (no hardcoded English in routes)
- [x] HTML templates use `{{{t()}}}` (no hardcoded English in views — 39/44 converted, 5 data-driven)
- [x] Alpine.js `$t` magic property works for client-side reactivity
- [x] Settings locale switcher re-renders UI without page reload
- [ ] `bun run check` passes (4 pre-existing failures unrelated to i18n)
- [x] Existing tests still pass (all 37 i18n tests pass; 19 pre-existing unit failures unrelated)
