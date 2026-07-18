# 07 — Alternative Frontend Support

## Current state (good parts)

- **REST API under `/api/` is the integration boundary.** TUI (`src/tui/`)
  is fully independent of the web UI and talks to the same API — a working
  proof that the server can serve non-htmx clients.
- **View serving is isolated** in `viewRoutes` + `handleNonApiRequest`
  (`src/server.ts` static + `src/elysia-app.ts` catch-all). The API and the
  HTML views are already separate *routes*; they just share one process.

## Gaps

### 1. Views and API are coupled at the dispatch layer
The catch-all `app.all("/*")` serves views for non-`/api/` paths. There is no
clean way to run loop-lore as **API-only** (for a React SPA, a mobile app, or
a native desktop client) without also shipping the htmx frontend.

### 2. No content negotiation
htmx partials and JSON responses come from different endpoints (or inline
`Accept` checks). A SPA calling the same URL gets HTML, not JSON. There is no
uniform `Accept: application/json` → JSON / `text/html` → htmx-partial
contract.

### 3. No CORS
Browser clients on a different origin (separate SPA deploy, third-party
integrations) are blocked. No `Access-Control-Allow-*` handling exists.

### 4. No `frontend.mode` config
There is no declarative switch for `htmx` (default) / `spa` (mount external
static dir) / `none` (API only). Operators must fork behavior in code.

## Recommendations

1. **Add `config.frontend.mode: "htmx" | "spa" | "none"`** (default `htmx`).
   - `htmx` → current behavior.
   - `spa` → serve an external built SPA from `config.frontend.spaDir`
     (single catch-all for non-`/api/` GET returning `index.html`); keep API.
   - `none` → drop `viewRoutes` + static view serving; API only.
2. **Content negotiation.** Standardize: every read endpoint inspects
   `Accept`. `application/json` → JSON envelope; `text/html` → htmx partial.
   Implement once as middleware so handlers stay unaware of transport.
3. **CORS middleware** (`src/middleware/`) driven by
   `config.cors.allowedOrigins`. Applied to `/api/*` only. Pair with the
   OpenAPI doc (`06`) so integrators have a contract + a CORS-enabled endpoint.
4. **Document the API as the integration surface.** Once `06` produces
   `/openapi.json`, the frontend contract is the spec, not the htmx partials.
   Alternative frontends generate clients from it.
5. **Keep TUI as the reference alt-client.** Its tests double as API contract
   smoke tests (extend in `05`).

## Suggested steps

- Edit `src/config/schema.ts`: add `frontend: { mode, spaDir? }` and
  `cors: { allowedOrigins: string[] }`.
- Edit `src/elysia-app.ts`: gate `viewRoutes` + `handleNonApiRequest` on
  `config.frontend.mode !== "none"`; add SPA fallback when `mode === "spa"`.
- Add `src/middleware/cors.ts`; register on `/api/*`.
- Add `src/middleware/negotiate.ts` (Accept → json|html) used by read routes.
- Update `docs/frontend/overview.md` + `06` to state: "API is the contract;
  htmx is one of N possible frontends."
