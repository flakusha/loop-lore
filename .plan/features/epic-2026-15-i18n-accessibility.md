# Epic 2026-15: i18n & Accessibility

**Status:** Not Started (P2)
**Priority:** High
**Source:** docs/meta/backlog.md

## Summary

Server-side i18n module, ARIA pass, keyboard nav, 10 locales.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-009 | Server-side i18n middleware (req.t) | Medium | Not Started |
| FEAT-2026-016 | Auto-Translation Layer Implementation | Medium | Not Started |

## Implementation Plan

### Phase 1: Server-side i18n
- [ ] i18n module (`src/i18n/index.ts`)
- [ ] i18n middleware (`src/middleware/i18n.ts`)
- [ ] Locale files (10 languages)
- [ ] Translate all server error messages

### Phase 2: Translation Layer
- [ ] Translation middleware
- [ ] LLM-based fallback translation
- [ ] External provider integration (Google/Deepl)
- [ ] UI translation indicator

### Phase 3: Accessibility
- [ ] ARIA landmark roles
- [ ] ARIA labels on interactive elements
- [ ] Focus management
- [ ] Skip-to-content link
- [ ] Keyboard navigation
- [ ] Focus-visible styling

## Files

- `src/i18n/index.ts` — i18n module
- `src/i18n/types.ts` — i18n types
- `src/i18n/translator.ts` — translation service
- `src/i18n/translation-middleware.ts` — middleware
- `src/middleware/i18n.ts` — i18n middleware
- `src/public/locales/*.json` — locale files
- `src/views/*.html` — ARIA updates
- `src/frontend/alpine/focus.ts` — focus management
