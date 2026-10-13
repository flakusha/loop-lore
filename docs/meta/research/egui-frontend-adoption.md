<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# egui frontend adoption: research findings

**Date:** 2026-10-13
**Branch:** `frontend-egui-adoption`
**Location:** `docs/meta/research/` — the existing flat, kebab-case convention
for dated research write-ups in this repo (see
`docs/meta/research/comfyui-graph-builder-frontend-plan.md`).
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`,
`docs/meta/code-practices-improvements/07-alternative-frontend-support.md`,
`.plan/epics/epic-terminal-ui.md`,
`.plan/epics/epic-precompiled-hot-binaries.md`,
`.plan/matrix-frontend-backend-integration.md`
**Question:** is `egui` (Rust) a viable way to add an experimental rich
desktop / TUI-adjacent client, and what can be REUSED from the existing
htmx + Alpine v1 frontend instead of rewriting?

All `src/...`, `native/...`, `.plan/...` paths verified to exist in the
`frontend-egui-adoption` worktree on 2026-10-13. External URLs carry an
"accessed 2026-10-13" note where the page is version-floating.

---

## 1. Current frontend inventory

### 1.1 What the web client actually is

Server-rendered HTML with no client-side framework router. Two layers:

- **htmx** drives *partial swaps* — the server re-renders an HTML fragment and
  the browser replaces a DOM subtree.
- **Alpine.js** owns *per-widget state* on top of the rendered DOM.

The dispatch is one branch in `src/routes/views/layout.ts:186-188`:

```ts
const body = isHtmx
  ? applyI18n(contentWithMounts, t)      // partial: raw content, no layout
  : wrapWithLayout(contentWithMounts, …); // full page: layout.html shell
```

`isHtmx` comes from `HX-Request: true` on the incoming request
(`src/routes/views/plugin-pages.ts:163`). So **every** view template is dual-mode:
the same file renders as a bare htmx fragment or as a full page, with no
second template to maintain. That is the single most reusable property of
the v1 frontend.

Route registration chain:

| Layer | Site |
| ----- | ---- |
| HTML page routes | `src/app/register-plugins.ts:66` → `viewRoutes(database)` |
| Config menu routes | `src/app/register-plugins.ts:67` → `configMenuRoutes(database)` |
| JSON API | `src/elysia-app.ts:229` → `v1Routes({ database, config, asyncStore })` |
| Redirects (`/`, `/chat`, `/register`) | `src/elysia-app.ts:267-269` |
| Non-API catch-all (static, views, docs) | `src/elysia-app.ts:272-291` → `handleNonApiRequest` |

Named view routes (`src/routes/views/plugin-pages.ts`):

- Full-page-capable *and* htmx-capable: `/character/:slug`,
  `/character/:slug/edit`, `/character/:slug/:chatId`,
  `/characters/:id/edit`, `/worlds`, `/worlds/:id`, `/worlds/:id/edit`, and
  the generic `/views/:name`.
- Dual-mode like the rest, but guarded: `/views/admin` behind
  `.guard({ beforeHandle: adminViewGuard })` (`plugin-pages.ts:132`, handler at
  `:133`), and `/views/nsfw-moderation` behind `nsfwGuard` (`:142`, handler at
  `:143`). Both handlers still read `isHtmx` and pass it to their serve
  function, so they are fragment-capable, not page-only.
- Explicit partial-only endpoints: four `/dynamic/*` routes in
  `src/routes/views/plugin-dynamic.ts` (characters grid + search, worlds list,
  gallery search) which redirect non-htmx callers to `/views/`.
- `/api/v1/*` — JSON, composed from seven Elysia surfaces in
  `src/routes/v1/index.ts`.

### 1.2 Templates and assets (sizes)

`src/views/` holds 21 templates plus `partials/`. Sizes on disk:

| Template | Size | Note |
| -------- | ---- | ---- |
| `src/views/admin.html` | 154.1 KB | largest single template |
| `src/views/world-edit.html` | 82.1 KB | tabbed editor (general/autonomy/explore/fractal/edges/NPCs) |
| `src/views/settings.html` | 32.4 KB | many nested `x-data` scopes |
| `src/views/world-detail.html` | 18.7 KB | |
| `src/views/quests.html` | 15.0 KB | |
| `src/views/layout.html` | 12.8 KB | shell; `{{{content}}}` filled by `wrapWithLayout()` (`layout.ts:50-93`) |

All hand-written mustache-style templates. **No generator script emits any
view** — `scripts/build-frontend.mjs` only bundles JS, and `src/build/compress.ts`
minifies (clean-css, html-minifier-terser), strips `data-testid`, hashes, and
compresses. So a template rewrite is a *human* cost, not a codegen one.

`src/views/partials/` — three files: `character-journey.html`,
`planning-todo.html` (htmx `hx-post` to `/api/v1/plans/:id/advance`),
`character-growth-editor.html` (Alpine editor). Included via `{{> partial }}`.

`src/public/`:

- CSS — `app.css` (83.9 KB) plus `story.css`, `vn.css`, `gallery.css`,
  `mobile-keynav.css`, `info-bubble.css`, `theme-base.css` and 10 theme
  variants (`theme-default/light/bright/colorful/monochrome/no-icons/dracula/
  nord/github-dark/material`).
- Locales — 10 JSON bundles in `src/public/locales/` (`ar de en es fr ja ko
  pt ru zh`), ~62–77 KB each. i18n is applied server-side during render
  (`applyI18n` in `src/routes/views/layout.ts`), not in the browser.
- Icons — 10 SVGs in `src/public/img/icons/` (attach, close, copy, delete,
  edit, retry, search, send, settings, upload), plus 2 character placeholders
  in `src/public/img/characters/` and `src/public/favicon.svg`.
- **No `.js` in `src/public/`.** All browser JS is bundled from
  `src/frontend/` into `dist/public/` by `scripts/build-frontend.mjs` (Bun
  bundler only — no Webpack/Vite/Rollup).

### 1.3 Alpine surface

- 51 component modules registered by side-effect import in
  `src/frontend/alpine/index.ts:8-58` (actor-emotion-avatars, admin, app,
  chat, comfyui-builder, gm-panel, model-manager, npc, personas, rpg-stats,
  settings, story-controls, theme, world-edit, world-lore, …).
- 3 stores — `sidebar`, `chat`, `ui` (`src/frontend/stores/index.ts:19-33`).
  The `ui` store is by far the largest: `uiStoreDefinition` spans
  `src/frontend/stores/ui-store.ts:17-78` (the file is 78 lines end to end) and
  owns panels, modals and branch/merge/transition state. Its exact key count
  was not counted for this document.
- Bootstrap: `src/frontend/alpine-init.ts` (6.0 KB) → `initAlpineStores()`,
  component side-effects, `globalThis.htmx`/`globalThis.Alpine`, the
  `alpine-morph` + SSE htmx extensions, then `Alpine.start()`.
- **Vendored, not CDN** — `alpinejs@^3.17.4` in `package.json:151`, bundled to
  `dist/public/alpine-init.js` (`scripts/build-frontend.mjs:29`), loaded by
  `src/views/layout.html:39`.
- `src/frontend/alpine/` holds 279 top-level `.ts` modules plus a
  `transports/` subdirectory, alongside
  `src/frontend/pages/`, `src/frontend/vn/`, `src/frontend/battle/`,
  `src/frontend/effects/`, `src/frontend/scene/`, `src/frontend/components/`.

### 1.4 The TUI

`src/tui/` — `app.ts` (5.8 KB), `chat/`, `asset-view.ts` (6.1 KB),
`harness/`, `nsfw-filter.ts` (3.4 KB), blessed + blessed-contrib.

- Screens: chat (`blessed.list` + `blessed.textbox`), asset sidebar
  (`blessed.box`, right 30%), harness run browser (full overlay), status bar.
- Transport: **HTTP only**, `API_BASE` from
  `LOOP_LORE_API_BASE_URL` (`src/tui/chat/api.ts:7`) via `safeFetch`, session
  token as `auth: { sessionToken }`.
- Shares exactly one module with the web frontend, and only through the
  barrel: `src/tui/chat/api.ts:4` and `src/frontend/fe-fetch.ts:24` both import
  `safeFetch` from `src/utils.ts`, which re-exports it from
  `src/utils/safe-fetch/` (`src/utils.ts:27`). Everything else in the TUI is
  blessed + terminal.

This is the load-bearing prior art: **the TUI is a working non-htmx client of
the same server.** `docs/meta/code-practices-improvements/07-alternative-frontend-support.md:8-13`
already records this as the working parts of the v1 frontend.

### 1.5 Reuse assets a foreign client can already reach

- **OpenAPI 3.1, served at runtime.** `versionedOpenApiPlugin({ version: "1" })`
  (`src/routes/v1/openapi.ts:93-108`) is mounted in
  `src/routes/v1/admin-surface.ts:51`, exposing `GET /api/v1/openapi` (Scalar
  UI) and `GET /api/v1/openapi/json` (the spec). Any client — Rust, mobile,
  script — can generate a typed client from that URL today.
- **A WASM loader already ships to the browser.** `src/frontend/wasm-loader.ts`
  (8.7 KB) consumes the feature-split `blake3.wasm` / `zstd.wasm` produced by
  the Rust crate in `native/loop-lore-native/`.
- **Rust is already a first-class build citizen of this repo.** See §2.6.
- **No CORS middleware.** `Access-Control-Allow-Origin` has zero matches under
  `src/`. A client on another origin is blocked today.
- **`src/transport/` is NOT the live server transport.** It is a standalone
  protocol library (peer table, Accept/Accept-Encoding negotiation, upgrade
  helpers, `federation/gossip.ts`). `createProtocol` is called only from its
  own tests and from config defaults (`src/config/schema-class/transport.ts`);
  `src/elysia-app.ts` mounts **no** `.ws(`. Live streaming is SSE
  (`src/routes/export-sse`, mounted in `admin-surface.ts:17`). A third-party
  client must plan for HTTP + SSE, not WebSocket.

---

## 2. egui facts

All external facts below were read on **2026-10-13**.

### 2.1 License, maturity, health

| Fact | Value | Source |
| ---- | ----- | ------ |
| License | `MIT OR Apache-2.0` (dual, both license files in-tree) | <https://crates.io/api/v1/crates/egui>, <https://github.com/emilk/egui/blob/main/LICENSE-MIT> |
| Latest `egui` / `eframe` | `0.36.2`, published 2026-09-08 | <https://crates.io/api/v1/crates/eframe> |
| Total downloads | `egui` 26,063,751 · `eframe` 20,273,829 · `egui-winit` 22,006,635 | crates.io API, as above |
| Maintenance cadence | Release 0.36.2 five weeks before this document; repo actively shipped 2026 | <https://github.com/emilk/egui/releases> |

`MIT OR Apache-2.0` is compatible with loop-lore's own dual
`Apache-2.0 OR MIT` (`native/loop-lore-native/Cargo.toml:5`) — **no license
blocker**.

**The stale-crate trap.** `egui_web` — the crate older tutorials name for
"compile egui into a web page" — is frozen at `0.17.0`, last published
**2022-02-22** (<https://crates.io/api/v1/crates/egui_web>). Any plan that
says `egui_web` is describing a four-year-dead API. Web support now lives
inside `eframe` itself under the `wasm32` target.

### 2.2 WASM build story

WASM dependencies are target-gated, so no feature flag is needed to opt in —
`crates/eframe/Cargo.toml` `[target.'cfg(target_arch = "wasm32")'.dependencies]`
pulls `wasm-bindgen`, `js-sys`, `web-sys` (with a long explicit feature list),
`bytemuck`, `image` (png), `send_wrapper`, `percent-encoding`, `web-time`
(<https://github.com/emilk/egui/blob/main/crates/eframe/Cargo.toml>).
One hard requirement: on web you must enable exactly one of `glow` or `wgpu`
or the crate fails to compile —
`crates/eframe/src/web/mod.rs` → `compile_error!` (`emilk/egui@b25d2d45`, read
2026-10-13).

**Embedding in an existing page is technically supported.**
`eframe::WebRunner::start(canvas: web_sys::HtmlCanvasElement, web_options,
app_creator)` takes a caller-supplied canvas
(`crates/eframe/src/web/web_runner.rs` → `WebRunner::start`,
`emilk/egui@b25d2d45`, read 2026-10-13), so a WASM build can be mounted into
one element inside an htmx page. The maintainers know this is a real scenario:
`focus_without_scroll` exists precisely "when the app is embedded in a larger
scrollable page" (`crates/eframe/src/web/mod.rs` → `focus_without_scroll`,
same commit, citing [emilk/egui#8295](https://github.com/emilk/egui/issues/8295)).

**What you do not get: DOM interop.** Upstream never uses that phrase. What it
does say — the `eframe` README's "Limitations when running egui on the web"
section — is that `eframe` and egui "compiles to Wasm using either WebGPU (when
available) or WebGL2 for rendering, and almost nothing else from the web tech
stack", and that "you cannot search an egui web page like you would a normal
web page" (<https://github.com/emilk/egui/blob/main/crates/eframe/README.md>,
read 2026-10-13).

**Inference from that quote plus the two sources below — not an upstream
statement:** a page whose contents are not searchable is not a page whose
contents are DOM-addressable, and egui cannot emit an HTML fragment for htmx
to insert, cannot render into an htmx-swapped subtree, and cannot read Alpine
`x-data` state. No source states this outright.

- `egui::FullOutput` is documented as "What egui emits each frame from
  `Context::run_ui`", and its entire field set is `platform_output`,
  `textures_delta`, `shapes`, `pixels_per_point` and `viewport_output` —
  geometry, textures, cursor/IME/window events and native viewport handles. No
  field carries markup (<https://docs.rs/egui/0.36.2/egui/struct.FullOutput.html>,
  read 2026-10-13). The inference rests on the absence of a DOM emit surface;
  upstream never writes "egui cannot emit HTML".
- The shipped demo's `index.html` is a bare `<canvas id="the_canvas_id">` plus a
  loading `<div>`; the only DOM writes in it are the panic handler replacing
  `#center_text`'s `innerHTML` after a crash
  (<https://www.egui.rs/index.html>, read 2026-10-13). Nothing in the page
  mutates DOM on the app's behalf.

Consequence for htmx: any page embedding egui gets an isolated canvas island
beside the server-rendered DOM, and every state handoff crosses a
Rust↔JS boundary (`wasm_bindgen` externs, or a JS bridge).

### 2.3 Bundle size — measured, 2026-10-13

The shipped demo at <https://www.egui.rs/>:

| Asset | Raw bytes | Transfer bytes (brotli/gzip) |
| ----- | --------: | ---------------------------: |
| `egui_demo_app_bg.wasm` | 11,707,366 | 4,389,649 |
| `egui_demo_app.js` (wasm-bindgen glue) | 175,615 | 26,249 |

Backend matters and is currently tuned the expensive way: `eframe`'s default
is **wgpu**, and the `Cargo.toml` comment reads "Switching from `wgpu (the
default)` to `glow` can significantly reduce your binary size (including the
`.wasm` of a web app)". The maintainers' own measurement when they made that
switch ([emilk/egui#5889](https://github.com/emilk/egui/issues/5889), closed):
`build_demo_web.sh --release` → **5.9 MiB** (glow) vs `--wgpu` → **8.3 MiB**.
Uncompressed, and for the *full demo app* — a real product build with a
handful of screens would be smaller, but not by an order of magnitude.

**Interpretation:** a 4.4 MB brotli-compressed wasm is roughly three orders of
magnitude above what an htmx page swap costs, and ~40× the raw size of
`src/public/locales/en.json` (64.4 KB). Any real-world deployment must lazy-load
the canvas behind an explicit opt-in — which means an egui client never
participates in a first paint.

### 2.4 Accessibility

`accesskit` is in `eframe`'s **default** features; on web, `web_screen_reader`
maps to `web-sys/SpeechSynthesis` (`crates/eframe/Cargo.toml:93`, see also
<https://github.com/emilk/egui/blob/main/docs/accessibility.md>). Not a
regression relative to the htmx stack, but neither is it as mature as plain
semantic HTML, which the v1 frontend gets for free from real `<button>`,
`<label>` and `<form>` elements.

### 2.5 Webview harness (desktop option)

Embedding egui in a native window needs a GL context host: `winit` +
`egui_glow`/`egui-wgpu` natively, or a webview shell via `wry`/Tauri. **This
research pass did not find a maintained first-class `egui`↔`wry` bridge**, and
the webview route inherits the known Linux WebKitGTK/NVIDIA graphics problems
documented by Tauri at <https://tauri.app/develop/debug/linux-graphics>. Treat
"egui desktop" as *self-hosted window + renderer*, not "wrap the existing web
frontend".

### 2.6 The one thing that changes the calculus: Rust is already here

This is the finding that most distinguishes loop-lore from a typical
bun-only repo:

- `native/loop-lore-native/` is a real Rust crate — `Cargo.toml` (license
  `Apache-2.0 OR MIT`), `rust-toolchain.toml` pinned to **1.97.1** with
  `clippy` + `rustfmt` + `rust-analyzer`, `rustfmt.toml`,
  `[lints.clippy] all + pedantic`, `missing_docs = "warn"`.
- `package.json:16-21` — `lint:native`, `test:native`, `format:native`,
  `format:native:check`, `update:native`, `update:native:check`, all
  `--manifest-path native/loop-lore-native/Cargo.toml`.
- CI already audits Rust deps: `.github/workflows/audit.yml:35-46` runs
  `rustsec/audit-check@v2`.
- The established pattern is exactly the one an egui client would need:
  `cdylib` + `rlib`, `#[no_mangle]` C ABI, a packed `VERSION` ABI int the
  loader gates on (`native/loop-lore-native/src/lib.rs:32`), feature-gated
  split builds, and a TS fallback when the artifact is missing
  (`src/native/loader.ts` via `bun:ffi`). `.tool-versions` is empty — the pin
  lives in `rust-toolchain.toml`, not asdf.

So the "rust toolchain in a bun repo" objection is **largely already paid**.
What is *not* paid: `eframe`'s default wgpu backend pulls a far larger
dependency tree than `blake3` + `zstd`, and that is a real (unmeasured — see
§6 Q3) compile-time and audit-surface cost on top of an existing Rust
footprint.

---

## 3. Option matrix

Effort, reuse, risk and reversibility are **planning judgments**, not
measurements. "Reuse %" is the fraction of the existing v1 frontend's
behaviour that carries over to the new client.

| Option | Effort | Reuse % | Risk | Reversibility | Grade |
| ------ | ------ | ------: | ---- | ------------- | ----- |
| **(a) egui native (eframe, own window)** | High | ~10% | High — new distributable per platform, new window/GL path, largest dep tree, no webview bridge found | Low — ships as its own binary/crate; deletable without touching the web client | experimental |
| **(b) egui→WASM canvas embedded in htmx pages** | Medium | ~35% | High — 4.4 MB brotli, no DOM interop, dual state model, canvas island | Medium — a script tag + one canvas + one wasm artifact; deletable | experimental |
| **(c) Client-agnostic view-model / partial layer** | Medium | ~85% | Low — pure refactor inside the server; the web client keeps rendering exactly what it renders today | High — additive extraction, no template rewrites | production-safe |
| **(d) Nothing new — extend the blessed TUI** | Low | ~15% (of the web UI) | Low — already shipped, already tested, already an alt-client | n/a (no change) | production-safe |

Read the reuse column carefully: **(a)** and **(d)** score low on *web-frontend*
reuse because neither renders HTML at all; that is not a defect of the
options, it is what "reuse" means here. **(c)** is the only row where the
existing 21 templates, 51 Alpine components and 3 stores keep working
unchanged.

### (a) egui native (eframe) — experimental

Every one of the 21 templates and all 51 Alpine components must be
re-expressed as immediate-mode Rust widgets, plus a second implementation of
i18n (10 locales), theming (10 themes), and asset/gallery rendering. Ship
shape is a per-platform native binary — a distribution problem this repo has
explicitly *declined* for Rust (`epic-precompiled-hot-binaries.md` §
"Distribution": build-stage compile only, binaries gitignored, never
committed; per-platform prebuilt matrix is future work). Adopting (a) means
reversing that decision for a second Rust crate. Not recommended.

### (b) egui→WASM inside htmx — experimental, and the weakest of the four

Viable in the narrow sense: `WebRunner::start` takes a canvas, and the
maintainers already handled the embedded-in-a-scrollable-page focus case. But
it buys a canvas island that shares nothing with the surrounding DOM, costs
4.4 MB compressed before any product code, requires a Rust→wasm-bindgen
pipeline the repo does not currently have (the existing `native/` crate is
C-ABI-for-`bun:ffi`, not wasm-bindgen), and gives back none of the 51 Alpine
components. **The honest read: (b) is (a) with a worse build story.** If the
question is "can egui live in our web pages", the answer is technically yes
and practically no.

### (c) Extract a client-agnostic view-model / partial layer — production-safe

The v1 frontend already has the hard half of this: every view renders from
server-side state, and one `HX-Request` branch decides fragment-vs-page
(`layout.ts:186-188`). What is missing is the layer *underneath* the
templates — the query + projection that produces the data a template binds.
Extract that, and:

- the htmx/Alpine client keeps working byte-for-byte;
- `Accept: application/json` on the same handler returns the same view-model
  instead of HTML, which is exactly gap #2 in
  `docs/meta/code-practices-improvements/07-alternative-frontend-support.md`;
- the TUI, a future SPA, a mobile app, **or an egui client** all consume the
  same projection without any of them needing each other.

This is the option that makes an egui experiment cheap *later*, because the
client would be a consumer of a stable contract rather than a second
implementation of the product.

### (d) Extend the blessed TUI — production-safe, zero new machinery

Already the reference alt-client (`src/tui/`, `epic-terminal-ui.md`). Its
known limits are real (HTTP-only, no SSE, no theming, blessed's widget set),
but it costs nothing new, is already covered by tests, and shares
`safeFetch` (via the `src/utils.ts` barrel) with the web client. Correct default when the goal
is "a second client" rather than "a desktop app".

---

## 4. Recommendation

**Adopt (c). Do not adopt egui as a loop-lore frontend, at any of its three
shapes, in the near term.**

The deciding facts are not aesthetic — they are the ones in §2:

1. **egui's web story does not compose with htmx.** It paints a canvas; it
   cannot emit HTML fragments or read Alpine state (§2.2, sourced). The v1
   frontend's strongest property — one template serving both fragment and page
   — has no egui analogue, so adopting it means paying for a second
   implementation of every screen.
2. **The price of entry is 4.4 MB compressed** for the demo app alone, against
   a 154 KB largest template, on a page whose entire point is instant htmx
   swaps.
3. **The upside is gated behind something cheaper.** loop-lore already ships
   a live OpenAPI 3.1 document (`GET /api/v1/openapi/json`), already ships
   Rust to production with a pinned toolchain and CI audit, and already ships
   a WASM loader to the browser. Anything egui could consume, it already
   consumes.
4. **Rust is not the obstacle people expect it to be — and that cuts both
   ways.** The toolchain cost is already paid, which removes the usual
   argument against egui. It does not create a reason: (a) still means
   reversing the repo's own no-prebuilt-binaries decision and owning a second
   distributable, and (b) still costs the bundle.

So: ship (c) so that *any* second client is cheap, keep (d) as the reference
implementation of a non-web client, and leave egui as an explicitly
deferred spike (`TASK-egui-wasm-embed-spike.md`) whose only deliverable is
**measured** numbers — build time, bundle bytes with `glow` vs `wgpu`, and a
DOM-interop verdict — rather than a second UI to maintain.

If egui is adopted later, adopt it as (a) *after* (c) has landed, when the
client contract is the OpenAPI document and the Rust build story is already
in the repo's CI. That is a decision the epic explicitly defers, not one it
forbids.

---

## 5. What is experimental-grade vs production-safe

| Claim | Grade |
| ----- | ----- |
| egui is MIT/Apache-2.0, actively maintained, 0.36.2 (2026-09-08) | production-safe (verified) |
| egui can mount into a `<canvas>` inside an existing page | experimental (API verified, product fitness unverified) |
| A loop-lore egui client can serve the existing screens | rejected on effort (§3a) |
| egui→WASM is viable *inside* an htmx page | experimental, likely not viable (§3b) |
| A Rust client can be generated against `/api/v1/openapi/json` | production-safe (verified — spec is served) |
| The v1 templates/Alpine components survive option (c) unchanged | production-safe (verified — additive extraction) |
| The TUI is a working non-htmx client today | production-safe (verified — `src/tui/`, `epic-terminal-ui.md`) |

---

## 6. Open questions

1. **How much of the 154 KB `admin.html` / 82 KB `world-edit.html` surface is
   genuinely UI state versus presentation?** A (c) extraction's size is a
   function of this ratio, and it was not measured in this pass.
2. **Does `Accept: application/json` on the existing view handlers collide
   with anything?** `docs/meta/code-practices-improvements/07-alternative-frontend-support.md:23-28`
   proposes it as new; whether any current caller already sends that `Accept`
   against a view route was not checked.
3. **What does `eframe` with the default `wgpu` backend cost in compile time
   and in `cargo audit` surface** on top of the existing
   `native/loop-lore-native` crate? Not measured — deliberately deferred to
   `TASK-egui-wasm-embed-spike.md`, which must record real numbers rather than
   inherit these estimates.
4. **Would a Rust client need SSE replay/idempotency semantics?** Export
   progress streams over SSE (`src/routes/export-sse`); the TUI currently
   polls instead. A richer client probably needs the stream contract, and
   that contract is not documented anywhere today.
5. **Is CORS the only thing blocking an out-of-origin client**, or are there
   other middleware gaps (CSRF double-submit, `credentials`) that a separate
   SPA or desktop client would hit immediately after? Only the absence of
   `Access-Control-Allow-Origin` was confirmed here.
6. **Who maintains a second UI language?** Option (c) keeps one UI; any
   Rust client is a second one with its own i18n (10 locales) and theming
   (10 themes). Whether loop-lore wants that ongoing cost is an editorial
   decision this research cannot make.
