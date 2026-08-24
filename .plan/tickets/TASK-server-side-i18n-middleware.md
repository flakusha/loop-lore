<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Server-Side i18n Middleware

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-i18n (see epic-i18n.md for the 6 sub-tasks, all complete)

## Summary

Server-side i18n middleware: `ctx.t` translator function, locale detection
(Cookie → Accept-Language → default), translation file loading, server-side
rendering of translated content.

## Implementation

- `src/middleware/i18n.ts` — `detectLocale()`, `createI18nContext()`,
  `parseAcceptLanguage()`; loads primary + fallback locales, builds translator.
- `src/elysia-app.ts` — wired inline via `.derive()` alongside auth guard:
  detects locale on every request (including auth-failure path) and spreads
  `i18n` (`t`, `locale`) into the Elysia context for all downstream routes.
- `src/i18n/` module (types, registry, loader, translator) — complete.
- `src/routes/views/layout.ts` — consumes `ctx.t` for template rendering.
- Tests: `src/i18n/__tests/middleware.test.ts`.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (epic-i18n.md tracks all 6 sub-tasks as ✅)
