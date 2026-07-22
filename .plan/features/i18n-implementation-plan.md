# i18n Implementation Plan

**Worktree:** `tree/i18n-implementation`
**Epic:** 2026-15 — i18n & Accessibility
**Phases:** 3 (server i18n → translation layer → accessibility basics)

---

## Design Decisions (from user)

| Decision           | Choice                                                      |
| ------------------ | ----------------------------------------------------------- |
| Scope              | All 3 phases in one worktree, verify after each             |
| Locales            | en, es, fr, de, ja, ko, zh, pt, ru, ar                      |
| Detection          | Accept-Language header → cookie → server default            |
| Fallback           | Configurable fallback map (ja→en, de→fr, etc.) in Alpine UI |
| Translation key    | Nested JSON, middleware helper `req.t("key")`               |
| Missing keys       | English fallback only, no LLM on-the-fly                    |
| Locale in context  | Required field on `RequestContext`                          |
| Middleware pattern | Follow existing Elysia `.derive()` pattern (not plugin)     |
| Accessibility      | Low-hanging fruit only (ARIA basics, keyboard nav)          |
| Testing            | Unit tests only; e2e/integration in separate epic           |

---

## Phase 1: Server-side i18n

### 1.1 — i18n Module (`src/i18n/`)

Create the core i18n infrastructure:

```
src/i18n/
├── index.ts          # Public API: createTranslator, loadLocale
├── types.ts          # Locale, TranslationMap, TranslatorFn types
├── translator.ts     # Translator implementation (nested key lookup)
├── locale-registry.ts # Locale metadata (name, direction, fallback chain)
└── __tests__/
    └── translator.test.ts
```

**Key types:**

```typescript
// src/i18n/types.ts
export type Locale = "en" | "es" | "fr" | "de" | "ja" | "ko" | "zh" | "pt" | "ru" | "ar";

export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

export type TranslatorFn = (key: string, params?: Record<string, string>,) => string;

export interface I18nConfig {
  defaultLocale: Locale;
  fallbackMap: Partial<Record<Locale, Locale>>;
  supportedLocales: Locale[];
}
```

**Translator:**

```typescript
// src/i18n/translator.ts
export function createTranslator(
  translations: TranslationMap,
  fallback: TranslationMap,
): TranslatorFn {
  return (key: string, params?: Record<string, string>,): string => {
    const value = resolveNestedKey(translations, key,) ??
      resolveNestedKey(fallback, key,) ??
      key;
    return params ? interpolate(value, params,) : value;
  };
}
```

### 1.2 — Locale Files (`src/public/locales/`)

One JSON file per locale, nested structure:

```json
// src/public/locales/en.json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirm": "Confirm",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "auth": {
    "login": "Log In",
    "logout": "Log Out",
    "register": "Register",
    "username": "Username",
    "password": "Password",
    "invalidCredentials": "Invalid username or password"
  },
  "chat": {
    "sendMessage": "Send Message",
    "noMessages": "No messages yet",
    "typing": "Typing..."
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "theme": "Theme"
  },
  "errors": {
    "notFound": "Not found",
    "unauthorized": "Unauthorized",
    "forbidden": "Forbidden",
    "serverError": "Internal server error",
    "validationFailed": "Validation failed"
  }
}
```

All 10 locale files start as copies of English; translations added incrementally.

### 1.3 — i18n Middleware (`src/middleware/i18n.ts`)

Detection priority:

1. `Cookie: ll_locale=xx` (set by frontend)
2. `Accept-Language` header (parse q-values)
3. Server default (`en`)

```typescript
// src/middleware/i18n.ts
import type { Locale, TranslatorFn, } from "../i18n/types";

export interface I18nContext {
  locale: Locale;
  t: TranslatorFn;
}

export function detectLocale(request: Request, config: I18nConfig,): Locale {
  // 1. Cookie
  const cookie = request.headers.get("Cookie",);
  const cookieMatch = /(?:^|;\s*)ll_locale=([a-z]{2})/.exec(cookie ?? "",);
  if (cookieMatch?.[1] && config.supportedLocales.includes(cookieMatch[1] as Locale,)) {
    return cookieMatch[1] as Locale;
  }

  // 2. Accept-Language header
  const acceptLang = request.headers.get("Accept-Language",);
  if (acceptLang) {
    const parsed = parseAcceptLanguage(acceptLang,);
    for (const lang of parsed) {
      if (config.supportedLocales.includes(lang as Locale,)) {
        return lang as Locale;
      }
      // Check fallback map
      const fallback = config.fallbackMap[lang as Locale];
      if (fallback && config.supportedLocales.includes(fallback,)) {
        return fallback;
      }
    }
  }

  // 3. Default
  return config.defaultLocale;
}
```

### 1.4 — Integrate into Elysia `.derive()`

In `src/elysia-app.ts`, add locale detection alongside auth:

```typescript
.derive(async ({ request }) => {
  // ... existing auth logic ...

  // i18n: detect locale, create translator
  const locale = detectLocale(request, i18nConfig);
  const translations = await loadLocale(locale);
  const fallbackTranslations = await loadLocale(i18nConfig.defaultLocale);
  const t = createTranslator(translations, fallbackTranslations);

  return { userId, userRole, sessionId, locale, t };
})
```

**Note:** `RequestContext` in `src/middleware/types.ts` gains required `locale` and `t` fields. All existing code that destructures `RequestContext` must be updated to ignore these (they already do — no code reads them yet).

### 1.5 — Migrate Server Error Messages

Replace hardcoded strings in these files:

| File                         | Pattern to replace                                                            |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `src/routes/http-utils.ts`   | `notFoundResponse("Not found")`, `unauthorizedResponse("Unauthorized")`, etc. |
| `src/middleware/pipeline.ts` | `"Internal server error"` in errorBoundary                                    |
| `src/middleware/auth.ts`     | `"Missing or invalid Authorization header"`                                   |
| `src/admin/model-roles.ts`   | `throw new Error("Invalid model role...")`                                    |
| `src/assets/service.ts`      | `throw new Error("Upload directory...")`                                      |
| `src/config/load.ts`         | `throw new Error("Unknown config file extension...")`                         |

**Migration strategy:**

- `jsonError()` accepts `t` parameter: `jsonError({ message: t("errors.serverError"), ... })`
- Error classes (`NotFoundError`, `ForbiddenError`) gain optional `locale` + `translator` params
- `errorBoundary` catches errors and uses `context.t` if available

### 1.6 — Frontend Locale Sync

Update `src/frontend/alpine/app.ts`:

- `loadLocale()` also sets `Cookie: ll_locale=xx` (path=/, SameSite=Lax)
- On init, read cookie before fetch
- `setLocale()` updates cookie + fetches locale file

### 1.7 — Locale API Endpoint

`GET /api/i18n/locales` — returns list of supported locales with metadata:

```json
{
  "locales": [
    { "id": "en", "name": "English", "direction": "ltr" },
    { "id": "ja", "name": "日本語", "direction": "ltr" },
    { "id": "ar", "name": "العربية", "direction": "rtl" }
  ],
  "default": "en"
}
```

### 1.8 — Message Translation Schema

Store translations of chat messages separately (same message ID, different locale):

```typescript
// src/db/schema-core.ts addition
export interface MessageTranslations {
  id: Generated<string>;
  message_id: string; // FK → messages.id
  locale: string; // "ja", "de", etc.
  content: string; // translated text
  provider: string | null; // "manual", "google", "deepl"
  created_at: Generated<string>;
  updated_at: string | null;
}
```

Query pattern — get message in user's locale, fall back to original:

```typescript
const message = await db
  .selectFrom("messages",)
  .leftJoin("message_translations", (join,) =>
    join.on("message_translations.message_id", "=", "messages.id",)
      .on("message_translations.locale", "=", userLocale,),)
  .select([
    "messages.id",
    "messages.content",
    "message_translations.content as translated_content",
  ],)
  .where("messages.id", "=", messageId,)
  .executeTakeFirst();
```

Translation requested explicitly (Phase 2):

- `POST /api/messages/:id/translate` — triggers translation, stores in `message_translations`
- Frontend shows translated version if available, original otherwise
- UI indicator: "Translated from English" badge

### Phase 1 Verification

```bash
bun run check                    # typecheck + lint + format
bun test src/i18n/               # unit tests for translator, locale detection
bun test src/middleware/          # middleware tests with locale in context
# Manual: verify Accept-Language header detection
# Manual: verify cookie persistence across page loads
```

---

## Phase 2: Translation Layer

### 2.1 — Translation Provider Interface

```typescript
// src/i18n/providers/types.ts
export interface TranslationProvider {
  name: string;
  translate(text: string, from: Locale, to: Locale,): Promise<string>;
}
```

### 2.2 — Static Translation Export

`src/i18n/export.ts` — CLI tool to extract all `t("key")` calls from source and produce translation CSV/JSON for external translators.

### 2.3 — Translation Management UI

Settings page additions:

- Current locale display
- Fallback chain editor (drag to reorder: ja→en, de→fr, etc.)
- "Request translation" button (marks key as needing translation)

### Phase 2 Verification

```bash
bun run check
bun test src/i18n/                # provider tests
# Manual: verify fallback chain works
# Manual: verify export produces correct keys
```

---

## Phase 3: Accessibility Basics

### 3.1 — ARIA Pass on Views

Add to each HTML file in `src/views/`:

| Element  | Addition                                     |
| -------- | -------------------------------------------- |
| `<main>` | `role="main"` (already in layout)            |
| `<nav>`  | `aria-label="Primary"` (already in layout)   |
| Forms    | `aria-label` on each `<form>`                |
| Buttons  | `aria-label` where icon-only                 |
| Inputs   | `aria-describedby` for error messages        |
| Modals   | `role="dialog"`, `aria-modal="true"`         |
| Lists    | `role="list"` where semantic `<ul>` not used |

### 3.2 — Skip-to-Content Link

Add as first child of `<body>` in `layout.html`:

```html
<a href="#main-content" class="skip-link">Skip to content</a>
```

CSS:

```css
.skip-link {
  position: absolute;
  left: -9999px;
  z-index: 999;
}
.skip-link:focus {
  left: 0;
  top: 0;
}
```

### 3.3 — Focus-Visible Styling

```css
:focus-visible {
  outline: 2px solid var(--color-focus, #4a90d9);
  outline-offset: 2px;
}
```

### Phase 3 Verification

```bash
bun run check
# Manual: tab through all views, verify focus indicators
# Manual: verify skip-to-content link works
# Manual: verify modals trap focus
```

---

## File Impact Summary

| Phase | New Files                                                                                                                                                                                | Modified Files                                                                                                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `src/i18n/index.ts`, `types.ts`, `translator.ts`, `locale-registry.ts`, `__tests__/translator.test.ts`, `src/middleware/i18n.ts`, `src/public/locales/*.json` (10), `src/routes/i18n.ts` | `src/db/schema-core.ts` (add MessageTranslations), `src/middleware/types.ts`, `src/elysia-app.ts`, `src/frontend/alpine/app.ts`, `src/routes/http-utils.ts`, `src/middleware/pipeline.ts`, `src/middleware/auth.ts`, `src/admin/model-roles.ts`, `src/assets/service.ts`, `src/config/load.ts` |
| 2     | `src/i18n/providers/types.ts`, `src/i18n/providers/static.ts`, `src/i18n/export.ts`                                                                                                      | `src/views/settings.html`                                                                                                                                                                                                                                                                      |
| 3     | —                                                                                                                                                                                        | `src/views/layout.html`, `src/views/login.html`, `src/views/register.html`, `src/views/chat.html`, `src/views/settings.html`, `src/views/admin.html`, + 10 more view files                                                                                                                     |

---

## Risk Assessment

| Risk                                              | Mitigation                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `RequestContext` type change breaks existing code | Add `locale` and `t` as required; TS compiler catches all call sites |
| Locale file load latency on cold start            | Cache loaded translations in memory (Map<Locale, TranslationMap>)    |
| Nested key lookup performance                     | Flatten at load time, cache as flat Map<string, string>              |
| Accept-Language header parsing edge cases         | Use proven parser (or implement q-value splitter)                    |
| RTL locales (ar)                                  | Phase 3 only; add `dir="rtl"` to `<html>` when locale is RTL         |
