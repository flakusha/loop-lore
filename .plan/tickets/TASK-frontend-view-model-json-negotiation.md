<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Serve view-models as JSON on Accept: application/json

**Status:** In Progress
**Scope:** Extract a pure view-model seam from one htmx view route and expose it as JSON
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

## Progress — one migrated route: `/dynamic/characters/grid`

**Status stays In Progress.** Two of this ticket's acceptance criteria ask for a
committed golden-markup snapshot asserting byte-identical HTML; the task brief
for this change explicitly forbids adding a snapshot/golden-file test
framework, so those two criteria are demonstrably met (the diff below is empty)
but not met *as written*. Everything else in §Acceptance Criteria holds for
`/dynamic/characters/grid`, as recorded below.

### Where the negotiation lives, and why not `layout.ts:186-188`

`src/routes/views/negotiate.ts` (new, 56 lines) exports the pure
`wantsJsonViewModel({ accept })` and `jsonViewModelResponse(viewModel)`; the
branch itself sits in the `/dynamic/characters/grid` handler in
`src/routes/views/plugin-dynamic.ts`.

`layout.ts:186-188` is the **wrong seam** for this route. That branch lives
inside `respond()`, which wraps a *file* template from `src/views/` in
`layout.html`. The `/dynamic/*` partial endpoints never call `respond()` — they
return `htmlResponse()` directly and carry their own third representation, a
302 redirect to `/views/` when `HX-Request` is absent. Putting the JSON branch
in `layout.ts` would therefore not be reachable from this route at all, and
`negotiate.ts` keeps the decision testable without a database.

The branch runs *before* the redirect check, so a JSON caller is not bounced to
an HTML page.

### Files touched

- `src/routes/views/negotiate.ts` (new, 56 lines).
- `src/routes/views/negotiate.test.ts` (new, 56 lines).
- `src/routes/views/plugin-dynamic.ts` — +5 lines in the grid handler, +1 import.
- `src/routes/views/plugin-dynamic.test.ts` — +104 lines.

### Evidence measured

- **Byte-identical HTML, both modes.** The fragment was captured through the
  real handler before any source edit and again after the extraction:
  `diff .tmp/grid-before.html .tmp/grid-after.html` → `[ok] Files are
  identical`, exit 0, both md5 `488843b767663ba7e698bd26a12a06b9`. Re-run after
  `dprint fmt`, still identical.
- **JSON returns the model and nothing else** —
  `Accept: application/json returns the view-model and nothing else`:
  `Content-Type: application/json`, body contains no `<div` and no
  `character-card`.
- **Model and markup agree** — `JSON and the htmx fragment agree on rows,
  counts and field values`: both responses are fetched from the same fixture;
  the number of `data-testid="character-card-` occurrences must equal
  `characters.length`, and for every model row the HTML must carry the same id,
  the HTML-escaped display name and description, the un-underscored review
  state and the avatar thumb URL. Asserted against the model, not against
  incidental whitespace.
- **`text/html` outranks a wildcard `application/json;q=0.9`** —
  `an explicit text/html outranks a wildcard application/json and keeps the
  redirect`: 302 to `/views/`, i.e. the pre-existing default is preserved.
- **`*/*` and no `Accept` keep the default** — `an any-media wildcard without
  HX-Request keeps the redirect` (302), plus the pre-existing
  `non-htmx requests redirect to /views/` and `every dynamic endpoint redirects
  non-htmx requests` tests still pass unchanged.
- **Precedence pinned** — `an explicit JSON Accept outranks the HX-Request
  fragment hint` and `an htmx request with a wildcard Accept keeps the html
  fragment` (the wildcard case is the realistic htmx/browsers one; htmx itself
  sends no `Accept`).
- **Unit coverage of the negotiation** — `negotiate.test.ts` covers: absent
  header, `*/*`, explicit `text/html`, a browser Accept list, explicit
  `application/json`, `text/html` vs `application/json;q=0.9`,
  `application/json` vs `text/html;q=0.5`, `application/json` vs `*/*;q=0.8`,
  `application/json;q=0` rejection, and an unrelated `image/png`; plus the
  `application/json` content type on the response.
- **One query path** — `loadCharactersGridViewModel(database)` is the only place
  the actors query runs; both representations call it. `characters.test.ts`
  asserts the loader's rows against the rendered fragment.
- **Coverage** — `negotiate.ts` 100.0% (24/24 lines).
- **Gates** — `bun run check`: 36 total, see the run summary recorded below.

### Deviations from this ticket's acceptance criteria

- Two criteria ask for a committed golden-markup snapshot. The task brief
  forbids adding a snapshot/golden-file framework, so byte-identity is proven
  by the measured diff above instead of a checked-in golden file.
- Scope is the one migrated route; the branch is written to be reused by the
  remaining handlers as they are extracted.

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

git issue: f88efac
