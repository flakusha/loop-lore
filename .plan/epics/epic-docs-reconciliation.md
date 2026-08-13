# EPIC: Documentation Reconciliation & UX

**Status:** 🟡 In Progress
**Priority:** Medium
**Epic ID:** EPIC-2026-39
**Effort:** Medium
**Type:** Feature Epic / Docs Chore
**Tags:** docs, vitepress, guide, api, reconciliation, linkage

## Summary

Reconcile the stale `docs/` tree with the actual implementation, surface the
in-app vitepress docs from the app interface, and grow the user-facing guide
into practical how-tos. Ends the state where specs drift from `src/` and users
cannot discover the documentation from the running app.

## Current State (verified 2026-08-12)

- App serves the built vitepress docs at `/docs/` (`src/server/static-files.ts`,
  `DOCS_PATH`), but the web sidebar (`src/views/layout.html`) had **no Docs
  link** — documentation was unreachable from the UI.
- `docs/guide/` had only 3 thin pages (getting-started 713 bytes, installation,
  characters).
- Vitepress sidebar had **2 dead links**: `/spec/character-setup` (no file —
  actual is `character-spec.md`) and `/spec/tui` (actual is `terminal-ui.md`).
- Specs and the hand-written `docs/reference/api.md` drift from `src/`.

## Goals

1. **Endpoint linkage** — a Docs nav item in the app sidebar linking to the
   served `/docs/` endpoint, gated on the same `DOCS_ENABLED` condition that
   serves the docs.
2. **Better how-tos** — practical, implementation-grounded user guides for the
   main flows (first chat, characters, personas, worlds, gallery, settings).
3. **Reconciliation** — audit the most-cited specs and the API reference
   against `src/` and fix confirmed stale claims.
4. **No dead links** — every vitepress nav/sidebar target resolves.

## Features

| Feature                  | Ticket      | Status             | Description                                        |
| ------------------------ | ----------- | ------------------ | -------------------------------------------------- |
| Docs nav link in sidebar | TASK-docs-ui-endpoint-linkage.md | ✅ Shipped 2026-08-12 | `{{docsNav}}` injected in `layout.ts`, gated on `DOCS_ENABLED`; `navigation.docs` i18n key across 10 locales |
| Fix dead sidebar links   | TASK-docs-fix-dangling-links.md | ✅ Shipped 2026-08-12 | `character-setup`→`character-spec`; `tui`→`terminal-ui` |
| User how-tos             | TASK-docs-guide-how-tos.md | 🟡 In Progress | first-chat, personas, worlds, gallery, settings |
| Spec/API reconciliation  | TASK-docs-reconcile-implementation.md | 🟡 In Progress | audit most-cited specs + `reference/api.md` vs `src/` |

## Files (proposed/changed)

```
src/routes/views/layout.ts        ← docsNav injection + isDocsServed()
src/views/layout.html             ← {{docsNav}} placeholder
src/public/locales/*.json         ← navigation.docs (10 locales)
docs/.vitepress/config.mts        ← guide sidebar + dead-link fixes
docs/guide/first-chat.md          ← new
docs/guide/personas.md            ← new
docs/guide/worlds.md              ← new
docs/guide/gallery.md             ← new
docs/guide/settings.md            ← new
docs/guide/getting-started.md     ← rewritten (routes to first-chat)
docs/reference/api.md             ← reconciled (pending audit)
```

## Acceptance Criteria

- [ ] Sidebar shows a Docs link when docs are served, hidden when disabled
- [ ] All vitepress nav/sidebar links resolve to real files
- [ ] How-tos reflect the actual UI (verified against views + components)
- [ ] Most-cited specs/API reference updated to match `src/`

## Dependencies

- `docs/.vitepress/config.mts` — sidebar/nav source of truth
- `src/server/static-files.ts` — docs serving gate (`DOCS_ENABLED`)

## Related

- **Distinct from:** EPIC-2026-32 API Versioning (epic-api-versioning.md) —
  HTTP versioning, not docs content.
- `docs/meta/` — research/reference (drift tolerated; not in scope here).