<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Experimental egui Frontend (adoption decision + client-agnostic view-model layer)

**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Research / Feature Epic

## Summary

Answer one question with evidence — is `egui` (Rust) a viable second client for
loop-lore — and, whatever the answer, make the *server* the thing any client
consumes. The research is written and lands as
`docs/meta/research/egui-frontend-adoption.md`; this epic carries the decision
it produced and the two layers that follow from it.

Parent epic: `epic-headless-alternative-frontends.md`, which already scopes
"alternative frontends" as a coordination hub. This epic is **not** a rival to
it — it is the egui-specific verdict plus the client-agnostic extraction that
the hub's own sequencing (API-First Foundation → Shared Client SDK) depends on.

> **⚠️ Not a parallel-program epic.** The verdict is *do not adopt egui yet*.
> The only egui deliverable is one timeboxed spike
> (`TASK-egui-wasm-embed-spike.md`) whose output is measured numbers, not a UI.
> The shipping work is the view-model layer, which every alternative frontend
> — including a future egui one — consumes.

## Verdict (from `docs/meta/research/egui-frontend-adoption.md`, 2026-10-13)

| Option | Verdict | One-line why |
| ------ | ------- | ------------ |
| (a) egui native (eframe) | **Rejected near-term** | ~10% reuse of 21 templates + 51 Alpine components; reverses this repo's own no-prebuilt-binaries decision (`epic-precompiled-hot-binaries.md` §Distribution) |
| (b) egui→WASM canvas in htmx pages | **Rejected near-term** | technically mountable via `WebRunner::start(canvas, …)`, but a canvas island with no DOM interop and 4,389,649 transfer bytes measured on the shipped demo |
| (c) Client-agnostic view-model layer | **Adopted** | ~85% reuse; additive extraction; the htmx/Alpine client renders exactly what it renders today |
| (d) Extend the blessed TUI | **Kept as reference** | already a working non-htmx client (`src/tui/`), already tested, zero new machinery |

Four findings drove it, all sourced in the research doc:

1. **egui has no DOM interop.** It paints its own canvas and cannot emit an
   HTML fragment for htmx or read `x-data`. The v1 frontend's strongest
   property — one template serving both fragment and page via the
   `HX-Request` branch at `src/routes/views/layout.ts:186-188` — has no egui
   analogue.
2. **Bundle size is measured, not guessed.** `egui_demo_app_bg.wasm` at
   <https://www.egui.rs/> is 11,707,366 raw / 4,389,649 transfer bytes
   (brotli/gzip), read 2026-10-13. The maintainers' own figure for the same
   app is 5.9 MiB (glow) vs 8.3 MiB (wgpu), uncompressed
   ([emilk/egui#5889](https://github.com/emilk/egui/issues/5889)).
3. **The upside is already shipped.** loop-lore serves a live OpenAPI 3.1
   document at `GET /api/v1/openapi/json`
   (`src/routes/v1/admin-surface.ts:51` → `src/routes/v1/openapi.ts:93-108`),
   already ships Rust to production (`native/loop-lore-native/`, pinned
   `rust-toolchain.toml` 1.97.1, `package.json:16-21`, RustSec CI at
   `.github/workflows/audit.yml:35-46`), and already ships a WASM loader to
   the browser (`src/frontend/wasm-loader.ts`). Anything an egui client would
   consume, it already can.
4. **No license blocker.** egui is `MIT OR Apache-2.0`, matching this repo's
   dual `Apache-2.0 OR MIT` (`native/loop-lore-native/Cargo.toml:5`).

## Goals

- Make the *server* the client contract, so a second client (TUI, SPA, mobile,
  or a much-later egui app) is a consumer rather than a second implementation.
- Keep the extraction additive: the 21 templates in `src/views/`, the 51
  Alpine components in `src/frontend/alpine/index.ts:8-58`, and the 3 stores
  keep working unchanged.
- Turn the egui question from opinion into measurement — one spike, real
  numbers, no production wiring.

## Scope

- Server-side view-model extraction for the highest-traffic view handlers
  (`TASK-frontend-view-model-extraction.md`).
- `Accept: application/json` returning that same view-model from the same
  handler (`TASK-frontend-view-model-json-negotiation.md`).
- `/api/v1/openapi/json` documented as *the* client contract, with a codegen
  smoke check (`TASK-frontend-client-contract-doc.md`).
- The TUI extended into a live API-contract smoke suite
  (`TASK-tui-api-contract-smoke-tests.md`).
- One timeboxed egui→WASM embed spike producing measurements
  (`TASK-egui-wasm-embed-spike.md`).

## Out of Scope

- Shipping an egui client, in any of the three shapes. The spike's artifact is
  a measurement, not a screen.
- `TASK-cors-middleware.md` (already filed, `Not Started`, bound to
  `epic-headless-alternative-frontends.md`). CORS is a prerequisite for an
  out-of-origin client and this epic does not re-file it. Confirmed absent from
  `src/` as of 2026-10-13 — zero `Access-Control-*` matches under `src/`.
- `config.frontend.mode` (`htmx` / `spa` / `none`). Also absent from `src/`;
  proposed in `docs/meta/code-practices-improvements/07-alternative-frontend-support.md`
  §Recommendations and owned by `epic-api-first-foundation.md`.
- Any template rewrite. Views stay hand-written and dual-mode.
- `src/transport/` as a live client channel. It is a standalone protocol
  library, not the server's transport; `src/elysia-app.ts` mounts no `.ws(`,
  and live streaming is SSE (`src/routes/export-sse`). Real-time endpoint
  work belongs to `epic-realtime-transports.md`.
- The `Shared Client SDK` / `Framework SDKs` sub-epics under
  `epic-headless-alternative-frontends.md`.

## Design

### Where the seam goes

The v1 frontend already renders everything from server-side state. The
missing layer is the **query + projection underneath the templates** — the
thing that decides which rows a view shows. Today that logic is interleaved
with HTML construction, so it can only be consumed as HTML.

```
                    ┌──────────────────────────────┐
                    │  view handler (per route)    │
                    │  query → project → render    │
                    └──────────────┬───────────────┘
                                   │  buildViewModel()   ← the new seam
                    ┌──────────────┴───────────────┐
                    │  view-model (plain JSON-able) │
              ┌─────┴──────────────┬──────────────┴─────┐
              │                    │                    │
        HX-Request:true     Accept: text/html      Accept: application/json
              │                    │                    │
        bare fragment       layout.html shell        JSON view-model
        (today)             (today)                  (new — any client)
```

`buildViewModel()` is pure: it takes already-fetched data and returns a plain
object. The template keeps binding to it; nothing about `src/views/` changes.
The JSON branch is the only genuinely new surface, and it is the same bytes
the template already had.

### Why this makes a future egui client cheap

With the JSON branch live, an egui client is a Rust HTTP client generated from
`/api/v1/openapi/json` plus an `egui` view layer over the view-model — not a
re-implementation of 21 templates, 51 Alpine components, 10 locales and 10
themes. That is the difference between option (a)-as-written (rejected) and a
plausible later option (a). This epic does not build it; it makes it possible.

### Sequencing

1. **`TASK-frontend-view-model-extraction`** — the seam. Everything else
   depends on it.
2. **`TASK-frontend-view-model-json-negotiation`** — needs #1; delivers the
   first non-HTML consumer surface.
3. **`TASK-frontend-client-contract-doc`** + **`TASK-tui-api-contract-smoke-tests`** —
   run in parallel with #2; neither depends on it.
4. **`TASK-egui-wasm-embed-spike`** — independent, last. Its value is
   *informative even if the verdict stays no*, because it retires open
   question Q3 (wgpu compile-time and `cargo audit` surface).

## Files (proposed)

- `src/routes/views/view-models/` — new; one module per extracted route,
  each exporting a pure `build*ViewModel()`.
- `src/routes/views/layout.ts` — extend the `HX-Request` branch
  (`:186-188`) to a three-way `Accept`/`HX-Request` decision.
- `docs/frontend/client-contract.md` — the client-facing contract doc.
- `docs/meta/research/egui-frontend-adoption.md` — **shipped**, the evidence
  behind this epic. Spike scratch (if any) lives under gitignored `.tmp/` and
  is deleted when the spike closes.

## Open Questions

1. How much of the 154 KB `src/views/admin.html` / 82 KB
   `src/views/world-edit.html` is UI state versus presentation? Extraction size
   is a function of this ratio; not measured.
2. Does `Accept: application/json` on the existing view handlers collide with
   any current caller? Proposed as new in
   `docs/meta/code-practices-improvements/07-alternative-frontend-support.md:23-28`;
   not checked against live traffic.
3. What does `eframe` with its default `wgpu` backend cost in compile time and
   `cargo audit` surface on top of `native/loop-lore-native`? Deferred to
   `TASK-egui-wasm-embed-spike.md`.
4. Would a non-browser client need SSE replay / idempotency semantics? Export
   progress streams over SSE (`src/routes/export-sse`); the TUI polls. The
   stream contract is undocumented today.
5. Is CORS the only blocker for an out-of-origin client, or are CSRF
   double-submit / `credentials` gaps next? Only the missing
   `Access-Control-Allow-Origin` is confirmed.
6. Who maintains a second UI language? Option (c) keeps one; any Rust client is
   a second one with its own i18n and theming. Editorial call.

## Dependencies

- Present: Elysia + `@elysia/openapi`, the htmx/Alpine v1 frontend, the blessed
  TUI, `native/loop-lore-native/` (Rust 1.97.1 pinned), the pinned
  `rust-toolchain.toml` CI path.
- Required before an out-of-origin client: `TASK-cors-middleware.md` (not
  started).
- Related: `epic-realtime-transports.md` for anything streaming;
  `epic-shared-client-sdk.md` for generated clients (this epic deliberately
  does not build one).

## Testing Strategy

| Test | Coverage | Location |
| ---- | -------- | -------- |
| Parity | Same handler, three `Accept`/`HX-Request` modes return the same view-model | alongside each extracted handler |
| Regression | Rendered HTML byte-identical before/after extraction for every migrated route | golden-markup snapshot per migrated route |
| Contract | Generated client from `/api/v1/openapi/json` compiles | `TASK-frontend-client-contract-doc.md` |
| Live drift | TUI drives the real server end-to-end | `TASK-tui-api-contract-smoke-tests.md` |
| Spike | Build time + bundle bytes, `glow` vs `wgpu` | `TASK-egui-wasm-embed-spike.md` (recorded, not asserted) |

## Acceptance Criteria

- [x] Research doc landed at `docs/meta/research/egui-frontend-adoption.md` with
  a dated, source-URLed egui fact set, a four-option matrix, a recommendation
  and open questions.
- [ ] A view-model seam exists under `src/routes/views/view-models/`, with at
  least the highest-traffic view routes migrated and their rendered HTML
  unchanged.
- [ ] `Accept: application/json` on a migrated route returns the view-model
  the template received, and the `text/html` + `HX-Request` paths are
  byte-identical to before.
- [ ] `docs/frontend/client-contract.md` names `/api/v1/openapi/json` as the
  client contract, and a check fails when the spec no longer generates a
  compiling client.
- [ ] The TUI has a live contract smoke suite that fails when a `/api/v1/*`
  response shape drifts from what the TUI parses.
- [ ] The egui spike has recorded measured build time and bundle bytes for
  both backends, and a written DOM-interop verdict — and has shipped **no**
  egui UI into `src/views/`, `src/frontend/`, or the Elysia app.

## Linked Tasks

- [ ] `TASK-frontend-view-model-extraction.md` — the seam
- [ ] `TASK-frontend-view-model-json-negotiation.md` — the JSON branch
- [ ] `TASK-frontend-client-contract-doc.md` — OpenAPI as the contract
- [ ] `TASK-tui-api-contract-smoke-tests.md` — live drift detection
- [ ] `TASK-egui-wasm-embed-spike.md` — the measurement

## Related Epics

- **epic-headless-alternative-frontends.md** — parent coordination hub
- **epic-api-first-foundation.md** — owns `config.frontend.mode` and the
  content-negotiation/CORS foundation this epic consumes
- **epic-terminal-ui.md** — the TUI this epic extends as the reference client
- **epic-precompiled-hot-binaries.md** — owns the Rust build/distribution
  policy that makes option (a) expensive
- **epic-realtime-transports.md** — owns real-time endpoints; `src/transport/`
  is a library, not the live server transport