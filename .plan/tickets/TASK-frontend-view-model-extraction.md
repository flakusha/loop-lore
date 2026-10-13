<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extract client-agnostic view-models from view handlers

**Status:** In Progress
**Scope:** Extract a pure view-model seam from one htmx view route and expose it as JSON
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-experimental-egui-frontend`
**Tags:** frontend, refactor, api, client-contract
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`, `.plan/epics/epic-headless-alternative-frontends.md`, `.plan/epics/epic-api-first-foundation.md`, `docs/meta/research/egui-frontend-adoption.md`, `docs/meta/code-practices-improvements/07-alternative-frontend-support.md`
**Summary:** Pull the query + projection out of the HTML-building view handlers into pure `build*ViewModel()` modules, so the same data that feeds a template is available to any client.
**Context:** Option (c) of `docs/meta/research/egui-frontend-adoption.md` — the one option that keeps the 21 templates in `src/views/`, the 51 Alpine components in `src/frontend/alpine/index.ts:8-58` and the 3 stores in `src/frontend/stores/index.ts:19-33` working unchanged. Today the "which rows does this view show" logic is interleaved with HTML construction, so the only way to consume it is to consume HTML; that is what forces every second client to be a second implementation. `src/routes/views/layout.ts:186-188` already proves the dual-mode idea works — `isHtmx ? applyI18n(...) : wrapWithLayout(...)` serves the same template as fragment or page — but that branch selects a *wrapper*, not a *representation*. This ticket adds the missing layer underneath. `FEAT-frontend-mode-config-accept-header-content-negotiation-cors.md` was closed as a duplicate pointing here and at `epic-api-first-foundation.md`; nothing was delivered, so the seam does not exist.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- New directory `src/routes/views/view-models/`, one module per migrated
  route, each exporting a pure `build*ViewModel()` that takes already-fetched
  data and returns a plain JSON-able object.
- Migrate the highest-traffic view handlers first. Pick them by what the
  clients already exercise: `serveView` (the `/views/:name` catch-all,
  `src/routes/views/view-serving.ts:17`), `serveWorldsList` (`:89`),
  `serveWorldDetail` (`:108`), `serveCharacterChatList` (`:43`),
  `serveCharacterChat` (`:67`).
- Each migrated template keeps binding to the same keys it binds today.

## Out of Scope

- Adding the JSON branch — that is `TASK-frontend-view-model-json-negotiation.md`.
- Rewriting any template. Templates stay hand-written and dual-mode.
- `config.frontend.mode`; owned by `epic-api-first-foundation.md`.

## Acceptance Criteria

- [ ] `src/routes/views/view-models/` exists and contains at least one module
  per handler named in §Scope.
- [ ] Every `build*ViewModel()` is pure: no database handle, no `ctx`, no
  `Response`, no template rendering inside it. A unit test per module calls it
  with a fixture and asserts on the returned object.
- [ ] For every migrated route, the HTML response bytes are **identical**
  before and after the extraction. Verified by a golden-markup snapshot
  recorded from the pre-change render, not by reading the diff.
- [ ] The `HX-Request: true` fragment path and the full-page path still differ
  only by `wrapWithLayout` (`src/routes/views/layout.ts:186-188`), unchanged.
- [ ] No file under `src/views/` and no file under `src/frontend/alpine/`
  changes behaviour. A behaviour change there is a review failure, not a
  follow-up.
- [ ] `bun run typecheck`, `bun run lint:eslint` and `bun test src/routes/views/`
  exit 0.

## Related Files

- `src/routes/views/layout.ts:186-188` — the existing htmx/page branch
- `src/routes/views/view-serving.ts:17,43,67,89,108,136,164` — the handlers
- `src/routes/views/plugin-pages.ts`, `src/routes/views/plugin-dynamic.ts` — route wiring
- `src/views/worlds.html`, `src/views/world-detail.html`,
  `src/views/character-chat-list.html`, `src/views/chat.html` — the templates

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*