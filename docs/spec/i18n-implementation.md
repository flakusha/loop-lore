# i18n Implementation Plan

Build plan for locale/multilingual support. Companion to `docs/frontend/internationalization.md` (high-level design).

## Current State

| Layer                       | Coverage                         | Files                                        |
| --------------------------- | -------------------------------- | -------------------------------------------- |
| Client `__()` function      | ✅ Defined, wired into bundles   | `src/frontend/alpine/i18n.ts`                |
| Translation catalog         | 36 keys (~100 needed)            | `src/public/locales/en.json`                 |
| Locale selector UI          | Dropdown exists, English-only    | `src/views/settings.html:57-61`              |
| Locale persistence          | `localStorage` key `"locale"`    | `src/frontend/ui.ts:97-101`                  |
| `__()` call sites           | 4 calls in 1 file                | `src/components/sidebar/sidebar.html`        |
| Server-side i18n            | ❌ None                          | All routes + views                           |
| TUI i18n                    | ❌ None                          | `src/tui/app.ts`, `chat.ts`, `asset-view.ts` |
| Locale middleware           | ❌ None                          | —                                            |
| DB locale column            | ❌ None                          | `users.settings` JSON unused                 |
| Config locale field         | ❌ None                          | `src/config/schema.ts`                       |
| Hardcoded strings remaining | ~90-100 unique                   | HTML, TS templates, TUI, route errors        |

## Implementation Phases

### Phase 1 — Server-Side i18n Infrastructure

**New files:**
- `src/i18n/index.ts` — i18n service: `t()`, `ensureLocale()`, `loadDefaultLocale()`, `getSupportedLocales()`
- `src/middleware/locale.ts` — locale middleware (X-Locale header → Accept-Language → "en")

**Modified files:**
- `src/middleware/types.ts` — add `locale: string` to `RequestContext`
- `src/server.ts` — wire locale middleware into pipeline
- `src/routes/views.ts` — pass locale through `wrapWithLayout()`, inject `lang` attr + locale data script
- `src/views/layout.html` — add `{{{localeData}}}` placeholder, dynamic `lang`
- `src/frontend/alpine/i18n.ts` — read `i18n-data` script on init
- `src/frontend/alpine/htmx.ts` — send `X-Locale` header on htmx requests

### Phase 2 — Key Extraction & Template Migration

**Expand `src/public/locales/en.json`** from 36 to ~100+ keys by namespace: nav, chat, message, generation, common, characters, settings, login, gallery, worlds, newChat, characterEdit, asset, error, tui.

**Upgrade `__()`** with interpolation support (`params`).

**Migrate HTML templates** — replace hardcoded strings with `x-text="__('key')"` or `{{ __("key") }}`:

| File                                | Changes |
| ----------------------------------- | ------- |
| `src/views/chat.html`               | ~25     |
| `src/views/settings.html`           | ~20     |
| `src/views/login.html`              | ~5      |
| `src/views/characters.html`         | ~5      |
| `src/views/gallery.html`            | ~3      |
| `src/views/worlds.html`             | ~5      |
| `src/views/new-chat.html`           | ~10     |
| `src/views/character-edit.html`     | ~5      |
| `src/views/world-detail/edit.html`  | ~5      |
| `src/views/character-chat-list.html`| ~2      |
| `src/components/sidebar/sidebar.html`| ~2     |

**Migrate `src/frontend/page-loaders.ts`** — replace all hardcoded UI strings (~30+ changes).

### Phase 3 — Client Completion

- `src/frontend/alpine/app.ts` — read saved locale on init, data-driven locale list
- `src/views/settings.html` — data-driven locale dropdown
- `src/views/login.html` — add locale selector

### Phase 4 — TUI i18n

Replace hardcoded strings in `src/tui/app.ts` (~10), `src/tui/asset-view.ts` (~16), `src/tui/chat.ts` (~8).

### Phase 5 — Route Hardcoded Strings

**Option B (recommended)**: Use error codes (`CHAT_NOT_FOUND`, etc.) in API responses, let client translate. Add `ErrorCode` enum to `src/routes/http-utils.ts`.

## Implementation Order (7 sprints)

| Sprint | Focus                      | Files Changed |
| ------ | -------------------------- | ------------- |
| 1      | Foundation (service, middleware, views) | 7 new/modified |
| 2      | Key expansion + interpolation | 3           |
| 3      | HTML template migration     | ~11           |
| 4      | JS template migration       | 1             |
| 5      | Client completion           | 2             |
| 6      | TUI migration               | 3             |
| 7      | API error standardization   | ~25           |

## Acceptance Criteria

