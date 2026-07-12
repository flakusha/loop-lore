# Frontend Extensions — htmx / Alpine

Reference for which htmx and Alpine.js extensions loop-lore loads, why each
was adopted, and which were evaluated and deferred. Revisit the deferred list
when a concrete feature need appears.

All scripts are self-hosted — copied from `node_modules/` into `dist/public/js/`
during `build:frontend`. Versions are pinned via `package.json` (devDependencies).
The single canonical include block lives in
`src/views/layout.html` (every view route is wrapped with it). There is no
second entry point — `src/views/index.html` was removed as orphaned.

## Adopted

### htmx core (`htmx.org@2.0.10`)

Base library. Drives navigation, form submits, and OOB swaps into `#app-root`.

### Alpine.js core (`alpinejs@3.14.9`)

Reactivity for chat and panel UI (`x-data`, `$store`, `x-show`, `x-for`).

### `@alpinejs/morph` plugin (`3.14.9`)

Loaded **before** Alpine core. Registers `Alpine.morph`, the morphing
primitive that `htmx-ext-alpine-morph` hooks into. Without this plugin the
alpine-morph extension has nothing to call.

### htmx-ext-alpine-morph (`2.0.0`)

Registers the `morph` swap strategy (`hx-swap="morph"`), backed by Alpine's
morph. Chosen over `idiomorph-ext` (see deferred) because it preserves Alpine
component state across swaps — the chat view's `chatState()` scope survives
navigation instead of being destroyed and re-initialized. This is the native
way to keep Alpine interactivity without hand-maintained teardown.

Enabled on `<body hx-ext="alpine-morph">`. Sidebar navigation uses `hx-swap="morph"`;
streaming generation keeps `innerHTML` (tokens append into `#stream-container`).

Teardown of `chatState()` is handled by its own `MutationObserver`
(`src/frontend/alpine/chat.ts`) when `$el` leaves the DOM — no manual
`before-swap` destroy needed.

### htmx-ext-response-targets (`2.0.4`)

Error handling. Wired to `hx-target-error="#toast-container"` on `#app-root`
so non-2xx responses render into the toast region instead of replacing page
content. Already in use before this review.

### htmx-ext-sse (`2.2.4`)

Server-Sent Events for LLM token streaming. Unidirectional server→client,
which matches streaming generation. Already in use.

## Deferred (revisit when needed)

### idiomorph-ext (`0.7.4`)

DOM morphing algorithm authored by the htmx creator. It is a **mutually
exclusive alternative** to `htmx-ext-alpine-morph` — you pick one morph
provider, not both. We chose alpine-morph so Alpine state is preserved.

**Revisit if:** we want pure DOM-node reuse without depending on Alpine's morph
(e.g., morphing regions that are not Alpine components), or alpine-morph proves
unable to preserve a specific interaction. Do not load both extensions at once.

### htmx-ext-head-support (`2.0.5`)

Swaps `<head>` content (title, meta, injected links/scripts) via OOB swaps.

**Revisit if:** we introduce per-route `<head>` updates — dynamic `<title>`,
per-view CSS, or injected `<script>`/`<meta>`. Today `<head>` is static and
all navigation swaps `#app-root` with `innerHTML`, so this extension has no
effect.

### htmx-ext-ws (`2.0.4`)

WebSocket transport. Already covered by `htmx-ext-sse` for streaming. Adding
WS would introduce a second transport alongside SSE.

**Revisit if:** a concrete bidirectional need appears that SSE cannot meet —
server-push progress from background jobs, multi-user presence/broadcast, or a
cancellation channel. Cancellation is already a POST. If adopted, prefer
replacing SSE with WS consistently rather than running both.

## Constraints

- Pin exact versions; never `@latest` or `x.x` ranges (no stable SRI hash).
- One canonical include block in `layout.html`; keep it the single source of
  truth.
