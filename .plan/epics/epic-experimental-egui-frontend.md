<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Experimental egui Frontend (adoption decision + client-agnostic view-model layer)

**Tags:** api, frontend, research, testing
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** In Progress — experimental egui wasm frontend shipped on branch egui-wasm-frontend (unmerged); roadmap target 1 (JSON view-models on the gallery and chats dynamic endpoints) landed on branch egui-json-view-models (unmerged); htmx/Alpine parity roadmap drafted 2026-10-16, remaining targets ticketed, none implemented yet.
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

> **⚠️ Superseded framing.** This epic opened as research-only (see the
> verdict table below). A user directive dated 2026-10-16 reversed that: build
> egui as a separate experimental wasm frontend, integrated by JSON
> communication — not htmx fragments — with htmx → egui → htmx transfers and
> required context storage on the browser side. See
> *Decision update (2026-10-16)* below; the view-model layer stays the
> foundation, the parity roadmap is the new deliverable.

## Verdict (from `docs/meta/research/egui-frontend-adoption.md`, 2026-10-13)

| Option | Verdict | One-line why |
| ------ | ------- | ------------ |
| (a) egui native (eframe) | **Rejected near-term** | ~10% reuse of 21 templates + 51 Alpine components; reverses this repo's own no-prebuilt-binaries decision (`epic-precompiled-hot-binaries.md` §Distribution) |
| (b) egui→WASM canvas in htmx pages | **Rejected near-term** | technically mountable via `WebRunner::start(canvas, …)`, but a canvas island with no DOM interop and 4,389,649 transfer bytes measured on the shipped demo |
| (c) Client-agnostic view-model layer | **Adopted** | ~85% reuse; additive extraction; the htmx/Alpine client renders exactly what it renders today |
| (d) Extend the blessed TUI | **Kept as reference** | already a working non-htmx client (`src/tui/`), already tested, zero new machinery |

Four findings drove it, all sourced in the research doc:

1. **egui has no DOM interop.** It paints its own canvas and cannot emit an
   HTML fragment for htmx or read `x-data`. Upstream never uses that phrase;
   what the `eframe` README does say is that "`eframe` and egui compiles to
   Wasm using either WebGPU (when available) or WebGL2 for rendering, and
   almost nothing else from the web tech stack"
   (<https://github.com/emilk/egui/blob/main/crates/eframe/README.md>, read
   2026-10-13). The "cannot emit HTML / read `x-data`" half is an inference
   from that quote plus egui's emit surface carrying no markup — labelled as
   such, with its sources, in research §2.2. The v1 frontend's strongest
   property — one template serving both fragment and page via the `HX-Request`
   branch at `src/routes/views/layout.ts:186-188` — has no egui analogue.
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


## Decision update (2026-10-16)

The research verdict above was **superseded by a user directive** on
2026-10-16. What the directive changes, and what it deliberately does not:

**Changed.** egui is now an in-progress *experimental* frontend, not a
rejected option. The integration is by **JSON communication, not htmx
fragments**: the Rust client talks the same `/api/v1/*` endpoints and the same
view-models the templates bind to. Transfers between the two clients are a
versioned handoff (`{version, activeChatId, returnTo}`) persisted in browser
storage, so the browser carries the context across htmx → egui → htmx in both
directions.

**Unchanged.** The client-agnostic view-model layer stays the foundation — an
egui client must never scrape fragments. That is why option (c)'s ticket set is
still the base of the roadmap, and why the JSON-branch extension of the dynamic
endpoints (gallery, chat list) is the highest-priority server-side target.

**Shipped (unmerged, branch `egui-wasm-frontend`).** A wasm32 crate under
`native/loop-lore-egui`, a JSON API client, the standalone `/egui` host page
(no htmx/Alpine bundles in the document), the browser-side handoff context, and
a `build:egui` stage that skips with a notice when the Rust toolchain is absent
so the application build is never blocked by it.

**Status of the roadmap.** The targets below are drafted as tickets; none are
implemented beyond the shipped base above. The epic status moves to *In
Progress* on that basis.

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
- The parity roadmap in *Parity roadmap — next egui targets*: JSON view-models on
  the dynamic endpoints, SSE response streaming, `:shortcode:` emoji support,
  the command surface, and the gallery surface.

## Out of Scope

- Shipping an egui client **as production**: the experimental client stays
  experimental — behind the `/egui` host page, JSON-integrated, with the htmx
  frontend as the default surface. No template rewrite, no fragment scraping.
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


## Parity roadmap — next egui targets

Ordered by risk to the shipped base. Each row names the htmx/Alpine surface it
must match, the ticket that carries it, and the upstream reference the
implementation should be modelled on.

| # | Target | htmx/Alpine parity source | Ticket | Upstream reference |
| - | ------ | ------------------------- | ------ | ------------------ |
| 1 | JSON view-models on the dynamic endpoints | `src/routes/views/negotiate.ts` (`wantsJsonViewModel`) wired at `/dynamic/characters/grid`, `/dynamic/gallery/grid`, `/dynamic/gallery/search`, `/dynamic/chats/list`, `/dynamic/chats/search` (branch `egui-json-view-models`, unmerged) | `TASK-json-view-models-for-gallery-and-chat-list-endpoints-egui-cl` | the option-(c) seam this epic established |
| 2 | SSE response streaming | `GET /api/v1/generation/stream/:chatId` + the Alpine consumer in `src/frontend/alpine/chat-generations.ts` (replay via `src/routes/stream-buffer/`) | `TASK-egui-sse-response-streaming-through-the-browser-bridge` | reqwest has no EventSource ([seanmonstar/reqwest#2677](https://github.com/seanmonstar/reqwest/issues/2677)) → bridge-owned `EventSource` |
| 3 | `:shortcode:` emoji support | registry + `renderShortcodes` in `src/frontend/alpine/chat-utils/emoji.ts`, autocomplete in `src/frontend/alpine/emoji-autocomplete.ts`, bubble render in `src/frontend/alpine/chat-utils/render.ts` | `TASK-egui-emoji-shortcode-support-registry-parity-autocomplete-bu` | the same registry served as JSON — no second Rust copy |
| 4 | Command surface | toolbar `src/frontend/alpine/command-buttons.ts` (12 all-user + 6 GM), slash parsing `src/frontend/alpine/chat-slash.ts`, palette `src/frontend/alpine/chat-actions/command-palette.ts` | `TASK-egui-command-surface-parity-palette-role-gated-commands-slas` | [egui demo library](https://docs.rs/egui_demo_lib/latest/egui_demo_lib/) widget + modal patterns |
| 5 | Gallery | `src/views/gallery.html` → `/dynamic/gallery/grid`, `/dynamic/gallery/search`, upload modal; REST `/api/assets`, `/api/assets/:id/thumb` | `TASK-egui-gallery-surface-grid-filters-thumbnails-upload` | egui's image-loading seam ([`egui::load`](https://docs.rs/egui/latest/egui/load/index.html), [`TextureLoader`](https://docs.rs/egui/latest/egui/load/trait.TextureLoader.html)) |
| 6 | htmx → egui → htmx handoff | the `/egui` host page + browser-storage context | **shipped on `egui-wasm-frontend`** | — |

Deliberately *not* on the roadmap yet: i18n and theming for the Rust client, VN
scene rendering, and any admin surface. Each is a parity conversation of its own
and none is needed to prove the JSON integration.


### Reference implementations (upstream)

| Reference | What it is applicable to |
| --------- | ------------------------ |
| <https://www.egui.rs/> + [`egui_demo_lib`](https://docs.rs/egui_demo_lib/latest/egui_demo_lib/) | the canonical widget catalogue — modal/overlay patterns for the command palette, scrolling list/grid layouts for chat and gallery, text rendering with an emoji font |
| <https://github.com/emilk/egui/tree/master/examples> | the examples index; its own README notes many examples apply to any egui integration, not just `eframe` — the closest thing to "reference web page implementations" upstream ships |
| [`egui::load`](https://docs.rs/egui/latest/egui/load/index.html) / [`TextureLoader`](https://docs.rs/egui/latest/egui/load/trait.TextureLoader.html) / [`egui::widgets::Image`](https://docs.rs/egui/latest/egui/widgets/struct.Image.html) | the image-loading seam the gallery uses on wasm: fetch through the JS bridge, decode, hand the texture to `Image` (which defers loading by design) |
| [seanmonstar/reqwest#2677](https://github.com/seanmonstar/reqwest/issues/2677) | grounds the SSE decision: no EventSource in reqwest, `reqwest-eventsource` unmaintained — the JS bridge owns every stream |
| <https://github.com/emilk/egui/blob/main/crates/eframe/README.md> | the wasm/WebGL2 constraint behind keeping the canvas outside every htmx swap target |

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
- [ ] The gallery grid/search and chats list/search endpoints return
  `application/json` view-models under `Accept` negotiation, with the
  `text/html` + `HX-Request` paths byte-identical.
- [ ] The egui client streams generation tokens over the bridge-owned SSE
  channel, resumes from replay on reconnect, and leaks no `EventSource` on
  chat switch or back-to-htmx.
- [ ] `:shortcode:` emoji rendering, the command surface, and the gallery
  surface reach documented htmx/Alpine parity, each pinned by a contract or
  conformance test rather than a screenshot.
- [ ] The `build:egui` stage stays non-blocking: `bun run build` and the
  server start succeed with the Rust toolchain absent, and `/egui` degrades to
  its status line.

## Linked Tasks

- [ ] `TASK-frontend-view-model-extraction.md` — the seam
- [ ] `TASK-frontend-view-model-json-negotiation.md` — the JSON branch
- [ ] `TASK-frontend-client-contract-doc.md` — OpenAPI as the contract
- [ ] `TASK-tui-api-contract-smoke-tests.md` — live drift detection
- [ ] `TASK-egui-wasm-embed-spike.md` — the measurement


### Parity roadmap tickets (2026-10-16)

- [ ] `TASK-json-view-models-for-gallery-and-chat-list-endpoints-egui-cl.md` —
  JSON branch on the dynamic endpoints (server-side parity base)
- [ ] `TASK-egui-sse-response-streaming-through-the-browser-bridge.md` —
  response streaming through the JS bridge
- [ ] `TASK-egui-emoji-shortcode-support-registry-parity-autocomplete-bu.md` —
  `:shortcode:` emoji support
- [ ] `TASK-egui-command-surface-parity-palette-role-gated-commands-slas.md` —
  command surface parity
- [ ] `TASK-egui-gallery-surface-grid-filters-thumbnails-upload.md` — gallery
  surface parity

Shipped on branch `egui-wasm-frontend` (unmerged, referenced by name because the
files are not on `dev` yet): the wasm32 crate + JSON client ticket, the
htmx → egui → htmx transfers-with-browser-side-context ticket, and the
`build:egui` optional-toolchain behaviour.

## Related Epics

- **epic-headless-alternative-frontends.md** — parent coordination hub
- **epic-api-first-foundation.md** — owns `config.frontend.mode` and the
  content-negotiation/CORS foundation this epic consumes
- **epic-terminal-ui.md** — the TUI this epic extends as the reference client
- **epic-precompiled-hot-binaries.md** — owns the Rust build/distribution
  policy that makes option (a) expensive
- **epic-realtime-transports.md** — owns real-time endpoints; `src/transport/`
  is a library, not the live server transport

git issue: a515b55
