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

## Progress — route 1 of 5: `/dynamic/characters/grid`

Status stays **In Progress**: §Scope names five handlers
(`serveView`, `serveWorldsList`, `serveWorldDetail`, `serveCharacterChatList`,
`serveCharacterChat`); exactly one is migrated so far.

Route chosen — `/dynamic/characters/grid` (`serveCharactersGrid`,
`src/routes/views/characters.ts`). Evidence for the choice: it is the only
non-admin candidate whose projection logic is fused into HTML construction —
the `review_state` → badge-class ternary, the avatar-present branch and the
empty-state branch were all inside the `Array.from(actors, ...)` template
literal, with no template file between them. It carries one Alpine binding
(`x-on:click="window.selectCharacterCard(id)"`) and zero `x-data` scopes, so
the fragment is decoupled from Alpine state. By contrast `serveWorldsListDb`
already splits query (`loadWorldListCards`) from render (`renderWorldCard`), so
extracting there would mostly rename existing boundaries, and it adds
`userId`/`userRole` permission coupling this route does not have.

### Files touched

- `src/routes/views/view-models/characters-grid.ts` (new, 55 lines) — pure
  `buildCharactersGridViewModel({ actors })`; no DB handle, no `ctx`, no
  `Response`, no template rendering.
- `src/routes/views/characters.ts` — query moved into
  `loadCharactersGridViewModel(database)`; `renderCharactersGrid(viewModel)`
  binds the markup to the view-model. 200 → 224 lines.
- `src/routes/views/view-models/characters-grid.test.ts` (new, 82 lines).
- `src/routes/views/characters.test.ts` — +28 lines.
- `src/validation/schema-fuzz.generated.test.ts` — regenerated; the module
  count comment moved 475 → 477 because two modules were added under
  `src/routes/`. No schema content changed.

### Evidence measured

- **Byte-identical HTML.** Captured the fragment through the real handler
  before any source edit, then again after the refactor:
  `bun .tmp/capture-grid.ts .tmp/grid-before.html` / `…-after.html` then
  `diff .tmp/grid-before.html .tmp/grid-after.html` → `[ok] Files are
  identical`, exit 0, both md5 `488843b767663ba7e698bd26a12a06b9`. Re-run after
  `dprint fmt`, still identical. The fixture covers all four review states,
  avatar present/absent, an empty description, HTML-escaping and a user-typed
  actor that must be excluded.
- **Tests.** `view-models/characters-grid.test.ts`: empty array, field
  projection, avatar thumb URL derivation, null-description normalisation,
  empty `review_state` → `pending_review`, row-order preservation, raw
  unescaped text. `characters.test.ts`: `loadCharactersGridViewModel returns
  the same rows the fragment renders` (covers the new export flagged by the
  test-gap gate).
- **Coverage.** `bun run scripts/check/coverage.mjs --floor=80 --files=…` —
  `view-models/characters-grid.ts` 100.0% (12/12), `negotiate.ts` 100.0%
  (24/24), `characters.ts` 100.0% (143/143), `plugin-dynamic.ts` 100.0%
  (139/139).
- `bun test src/routes/views/ --isolate` → 147 pass, 0 fail.

### Deviations from this ticket's acceptance criteria

- The first criterion asks for a module per handler named in §Scope; only one
  handler is migrated, so it is not yet satisfied.
- The byte-identity criterion asks for a committed golden-markup snapshot.
  The task brief forbids adding a snapshot/golden-file framework, so parity is
  proven by the measured diff above rather than by a checked-in golden file.

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

git issue: c5a9bf3
