<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Centralize HTMX AJAX Request Helper

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-html-dedup-htmx-reuse
**Tags:** frontend, htmx, ajax, reuse

## Summary

Establish a single canonical way to declare htmx requests (method, headers, swap target,
OOB, error handling) so views reference one configurable helper instead of re-declaring
`hx-*` attributes per call site.

## What to Do

1. Inventory ad-hoc `hx-*` attribute groups across views from the audit.
2. Define a shared request helper (in or beside `src/frontend/alpine/htmx.ts`) that
   composes the recurring request shape (auth via `apiFetch`/`feFetch`, 401 redirect,
   swap/OOB target, confirm/disable, error toast).
3. Migrate views to the helper; keep a thin escape hatch for genuinely one-off requests.
4. Ensure CSRF/session headers and the 401 redirect path are applied uniformly (no
   per-view drift).

## Acceptance Criteria

- [ ] One request helper composes the common htmx request shape
- [ ] Views use the helper; the majority of inline `hx-*` request groups removed
- [ ] Auth/CSRF headers and 401 redirect applied identically across all migrated views
- [ ] `htmx-alpine.browser.ts` `htmx-alpine` + `chat-flow.browser.ts` still pass

## Files

- `src/frontend/alpine/htmx.ts` — request helper (extend/add)
- `src/views/**`, `src/components/**` — migrate to helper
- `tests/e2e/flows/browser/htmx-alpine.browser.ts`, `chat-flow.browser.ts` — regression gate

## Related

- `TASK-html-dedup-audit` — htmx-attribute inventory
- `TASK-htmx-migrate-views` — consumer migration
