<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Serve view-models as JSON on Accept: application/json

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-experimental-egui-frontend`
**Tags:** frontend, api, content-negotiation, client-contract
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`, `.plan/tickets/TASK-frontend-view-model-extraction.md`, `.plan/tickets/FEAT-frontend-mode-config-accept-header-content-negotiation-cors.md`, `.plan/tickets/TASK-cors-middleware.md`, `.plan/epics/epic-api-first-foundation.md`
**Summary:** Extend the view-handler dispatch from two modes (htmx fragment vs full page) to three, returning the extracted view-model as JSON when the caller sends `Accept: application/json`.
**Context:** `docs/meta/code-practices-improvements/07-alternative-frontend-support.md:23-28` identifies the absence of content negotiation as gap #2: "htmx partials and JSON responses come from different endpoints … A SPA calling the same URL gets HTML, not JSON." Once `TASK-frontend-view-model-extraction.md` lands, each view handler already holds the plain object its template binds, so the JSON branch is a serialization of data that is already in hand — not a second query. The dispatch site is the existing branch at `src/routes/views/layout.ts:186-188`. `FEAT-frontend-mode-config-accept-header-content-negotiation-cors.md` covers this scope but was closed on 2026-09-19 as a duplicate of `epic-api-first-foundation.md`; no `frontend.mode` config and no negotiation middleware exist in `src/` as of 2026-10-13. This ticket fills the read-path gap only and leaves `config.frontend.mode` to its owning epic.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- One negotiation helper (e.g. `src/routes/views/negotiate.ts`) that decides
  `fragment | page | json` from `HX-Request` plus the `Accept` header, and is
  called by the view handlers migrated in `TASK-frontend-view-model-extraction.md`.
- The `json` branch returns the view-model the template received, with a
  `Content-Type: application/json` response.
- A test per migrated route asserting the three modes against one handler.

## Out of Scope

- CORS. `TASK-cors-middleware.md` owns it and is `Not Started`; an
  out-of-origin client needs both, in either order.
- `config.frontend.mode` (`htmx` / `spa` / `none`).
- New endpoints. This is the same URL with a different `Accept`, not a second
  surface to keep in sync.

## Acceptance Criteria

- [ ] `GET` on a migrated route with `Accept: application/json` returns the
  view-model the template bound to, and nothing else — no `<div>`, no layout.
- [ ] The same URL with `Accept: text/html` returns byte-identical HTML to the
  pre-change render, asserted by the golden-markup snapshot this ticket owns.
- [ ] The same URL with `HX-Request: true` returns byte-identical HTML to the
  pre-change render.
- [ ] A request with no `Accept` header, and one with `Accept: */*`, both fall
  back to the full-page HTML — the current default is preserved.
- [ ] `Accept: text/html` explicitly stated still wins over a wildcard
  `application/json;q=0.9`, per the q-value ordering; a test pins this.
- [ ] The three responses are asserted to be derived from one view-model object
  per request, not from three independent query paths.
- [ ] `bun run typecheck`, `bun run lint:eslint` and `bun test src/routes/views/`
  exit 0.

## Related Files

- `src/routes/views/layout.ts:186-188` — the dispatch branch to extend
- `src/routes/views/view-models/` — the seam (from
  `TASK-frontend-view-model-extraction.md`)
- `src/routes/views/view-serving.ts` — the migrated handlers
- `docs/meta/code-practices-improvements/07-alternative-frontend-support.md` —
  the gap statement this closes

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*