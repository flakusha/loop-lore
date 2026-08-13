# TASK: Docs UI endpoint linkage

**Status:** ✅ Done
**Priority:** high
**Effort:** Low
**Epic:** epic-docs-reconciliation.md

## Summary

Add a Docs nav item in the app sidebar linking to the in-app vitepress docs
endpoint (`/docs/`), gated so it only appears when docs are actually served.

## Acceptance Criteria

- [x] `src/routes/views/layout.ts` injects `{{docsNav}}` via a new
      `isDocsServed()` helper matching the `DOCS_ENABLED !== "false"` gate in
      `src/server/static-files.ts`
- [x] `src/views/layout.html` renders the Docs nav item (📚) with
      `data-testid="nav-docs"` when served, hidden otherwise
- [x] `navigation.docs` i18n key added to all 10 locale files
- [x] `bun test src/routes/views.test.ts` passes (27/27)

## Notes

Gating uses the same env condition as the serving handler, so the link can
never point at a disabled `/docs/` endpoint. No config threading required.