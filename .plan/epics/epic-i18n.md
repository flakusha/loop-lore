# Epic: Internationalization (i18n)

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** i18n, localization, l10n, accessibility, ux

## Overview

Full internationalization of loop-lore UI. Infrastructure is complete (custom i18n module, middleware, API, locale registry). Adoption is zero — all routes and templates use hardcoded English.

## Reference

- Design spec: `docs/frontend/internationalization.md` (4-layer architecture)
- Existing ticket: `FEAT-i18n-accessibility-foundation.md` (parent)
- i18n module: `src/i18n/` (types, registry, loader, translator, middleware)

## Current State

| Component                                 | Status                        |
| ----------------------------------------- | ----------------------------- |
| i18n module (types, loader, translator)   | ✅ Complete                   |
| Elysia middleware (`ctx.t`)               | ✅ Complete                   |
| API routes (`GET/PATCH /api/i18n/locale`) | ✅ Complete                   |
| `en.json` catalog (234 keys)              | ✅ Complete                   |
| Non-English locales (71/234 keys each)    | ⏸ 30% complete                |
| Route adoption (`ctx.t()` calls)          | 🔲 0% — all hardcoded         |
| Template adoption (`{{ t() }}` bindings)  | 🔲 0% — all hardcoded         |
| Alpine.js `$t` magic property             | 🔲 Not implemented            |
| Settings locale switcher wiring           | 🔲 Frontend doesn't re-render |

## Features

| Feature           | Ticket                      | Effort | Phase | Description                                        |
| ----------------- | --------------------------- | ------ | ----- | -------------------------------------------------- |
| Locale completion | TASK-i18n-locale-completion | Medium | 1     | Fill missing 163 keys × 9 non-English locales      |
| Route adoption    | TASK-i18n-route-adoption    | Large  | 2     | Wire `ctx.t()` into route error messages           |
| Template adoption | TASK-i18n-template-adoption | Large  | 3     | Replace hardcoded strings in 17 HTML views         |
| Alpine.js client  | TASK-i18n-alpine-client     | Medium | 4     | Add `$t` magic property for client-side reactivity |
| Settings wiring   | TASK-i18n-settings-wiring   | Small  | 5     | Wire locale switcher to re-render UI               |

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

- [ ] All 10 locales have complete 234-key catalogs
- [ ] Route error messages use `ctx.t()` (no hardcoded English in routes)
- [ ] HTML templates use `{{ t() }}` (no hardcoded English in views)
- [ ] Alpine.js `$t` magic property works for client-side reactivity
- [ ] Settings locale switcher re-renders UI without page reload
- [ ] `bun run check` passes
- [ ] Existing tests still pass
