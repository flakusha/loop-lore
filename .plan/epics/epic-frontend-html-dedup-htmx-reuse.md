# EPIC: Frontend HTML Deduplication & HTMX AJAX Reuse

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Optimization Epic
**Tags:** frontend, htmx, partials, components, deduplication, ajax, reuse, views

## Summary

Server-rendered HTML across `src/views/`, `src/components/`, and `src/partials/` repeats
markup and htmx request patterns. This epic removes duplicated fragments by extracting
shared partials/components and establishes a single canonical htmx-ajax request path so
every interactive element reuses the same swap/lifecycle/OOB machinery instead of
re-implementing it per view.

## Problem

- `src/components/` (7 + 16 in `chat/` + 1 in `modals/`), `src/partials/` (characters 4,
  gallery 2, worlds 2), and `src/views/` (19) overlap in markup — repeated modals,
  headers, lists, and form shells are inlined rather than shared.
- htmx AJAX behavior lives in `src/frontend/alpine/htmx.ts` + `htmx-header.ts`, but views
  re-declare `hx-*` attributes (swap targets, OOB targets, error handling) ad-hoc instead
  of reusing configurable request helpers.

## Scope

1. **Audit duplication** — map repeated fragments across components/partials/views.
2. **Extract shared partials** — promote repeated markup (modals, headers, list rows,
   form shells) into reusable `src/partials/` / `src/components/`.
3. **Canonicalize htmx requests** — centralize `hx-*` request config (method, headers,
   swap, OOB, error handling) so views reference shared request helpers instead of
   re-declaring attributes.
4. **Wire lifecycle** — ensure AfterSwap → `Alpine.initTree()` and OOB handling reuse
   `htmx.ts` on all extracted fragments.
5. **Verify no regression** — browser e2e (htmx-alpine, chat-flow) stays green.

## Current State

- Repeated markup in `src/components/*`, `src/partials/*`, `src/views/*` (see dedup surface
  audit, step 1 — specific counts TBD).
- htmx ajax core: `src/frontend/alpine/htmx.ts`, `src/frontend/alpine/htmx-header.ts`.

## Linked Tasks

| Task                                    | Title                                                    | Priority | Status      |
| --------------------------------------- | -------------------------------------------------------- | -------- | ----------- |
| TASK-html-dedup-audit                   | Audit + map repeated frontend HTML fragments             | High     | Not Started |
| TASK-html-dedup-shared-partials         | Extract shared partials/components                       | High     | Not Started |
| TASK-htmx-ajax-request-helper           | Centralize htmx request config in shared helper          | High     | Not Started |
| TASK-htmx-migrate-views                 | Migrate views to shared partials + request helper        | Medium   | Not Started |
| TASK-htmx-reuse-e2e-verify              | Verify browser e2e green after refactor                  | Medium   | Not Started |

## Acceptance Criteria

- [ ] Duplication audit quantifies all repeated frontend HTML fragments
- [ ] Every audited duplicate now references one canonical shared partial/component
- [ ] A single htmx request helper composes the recurring request shape; views reuse it
- [ ] Views migrated to shared partials + request helper; per-view htmx request groups removed
- [ ] No regression: `bun run check` + browser e2e green after each migration task

## Related Epics

- `epic-frontend-component-architecture.md` — HTMX vs Alpine responsibility boundaries (adjacent, distinct scope)
- `epic-frontend-bundle-optimization.md` — JS bundle dedup (distinct from HTML dedup)
- `epic-frontend-backend-integration.md` — shared components list, wiring patterns
