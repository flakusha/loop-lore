# Frontend Extensions — htmx / Alpine

Reference for htmx and Alpine.js extensions loop-lore loads. All scripts self-hosted from `node_modules/` → `dist/public/js/` during `build:frontend`. Versions pinned via `package.json`. Single include block in `src/views/layout.html`.

## Adopted

| Extension | Version | Purpose |
| --------- | ------- | ------- |
| **htmx core** | `htmx.org@2.0.10` | Navigation, form submits, OOB swaps |
| **Alpine.js core** | `alpinejs@3.14.9` | Reactivity (`x-data`, `$store`, `x-show`, `x-for`) |
| **`@alpinejs/morph`** | `3.14.9` | Morph primitive for alpine-morph. Loaded before Alpine core. |
| **htmx-ext-alpine-morph** | `2.0.0` | `hx-swap="morph"` backed by Alpine's morph. Preserves component state across swaps. |
| **htmx-ext-response-targets** | `2.0.4` | Error handling via `hx-target-error="#toast-container"` |
| **htmx-ext-sse** | `2.2.4` | Server-Sent Events for LLM streaming |

Enabled on `<body hx-ext="alpine-morph">`. Sidebar uses `hx-swap="morph"`; streaming generation keeps `innerHTML` (tokens append into `#stream-container`).

## Deferred (revisit when needed)

| Extension | Version | Why Deferred |
| --------- | ------- | ------------ |
| **idiomorph-ext** | `0.7.4` | Mutually exclusive with alpine-morph. Revisit if we need morphing outside Alpine components. |
| **htmx-ext-head-support** | `2.0.5` | `<head>` is static today. Revisit for per-route title/meta. |
| **htmx-ext-ws** | `2.0.4` | SSE already covers streaming. Revisit for bidirectional needs (presence, broadcast). If adopted, replace SSE consistently. |

## Constraints

- Pin exact versions; never `@latest` or `x.x` ranges
- One canonical include block in `layout.html` — single source of truth