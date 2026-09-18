<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CORS middleware for external origins

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Open
**Priority:** medium
**Effort:** Medium
**Epic:** epic-headless-alternative-frontends
**Related:** `epic-headless-alternative-frontends.md` (line 220), `TASK-api-first-foundation.md`, `src/middleware/`

## Summary

The headless/alternative-frontends epic lists "Add CORS middleware for external
origins" as a required building block, but no `src/middleware/cors.ts` exists and
no ticket tracked it. External API consumers (headless mode, third-party
frontends, OpenAPI tooling) currently receive no `Access-Control-Allow-*`
headers, so browser-based cross-origin calls to `/api/*` will be blocked.

## Acceptance Criteria

- [ ] `src/middleware/cors.ts` implements a configurable CORS policy (allowed origins, methods, headers, credentials, max-age) sourced from `config`.
- [ ] Wired into the Elysia app (global `onRequest`/headers hook) for `/api/*` (and SSE where applicable).
- [ ] `OPTIONS` preflight handled.
- [ ] Headless-mode config can skip/limit CORS when frontend middleware is disabled.
- [ ] Unit tests for allowed-origin, disallowed-origin, preflight, and credentialed cases.
- [ ] `epic-headless-alternative-frontends.md` checklist item marked done.

## Notes

- Keep CORS config-driven (allowlist) — do not reflect arbitrary `Origin` blindly (security).
- Coordinate with `TASK-api-key-auth-middleware.md` (external consumers will need both CORS + API-key auth).
- Referenced previously (planned) in `TASK-api-first-foundation.md` and `docs/meta/code-practices-improvements/07-alternative-frontend-support.md`; those references should point here once created.

## Feasibility Review (2026-09-18)

Verdict: feasible; mechanism probe-verified against `elysia@^1.4.30` (throwaway Elysia probe, deleted after run).

Current gap (code-verified):

- No `Access-Control-*` producer exists anywhere in `src/`.
- `OPTIONS /api/*` falls into the `app.all("/*")` catch-all (`src/elysia-app.ts`) and 404s in `handleApiRequest` (`src/server/handler.ts`) — browser preflights fail today.
- Middleware to bypass on preflight: auth derive, CSRF plugin gate, idempotency `beforeHandle`, legacy dispatch.

Verified mechanism (matches the ACs):

- An `onRequest` hook short-circuits preflight **before** every derive/gate: return `204` with `Access-Control-Allow-Origin/Methods/Headers/Max-Age`; probe confirmed derive never ran for preflight.
- `set.headers` set in `onRequest` survive on ordinary cross-origin responses routed through the catch-all; requests without `Origin` get no CORS headers (same-origin unaffected).
- SSE: `set.headers` applies to streaming responses; `RouteKind "sse"` already exists in `ResponseHeaderPolicy` — no extra wiring.

Design sketch (fits existing plumbing):

- `src/middleware/cors.ts`: `onRequest` hook + `.options("/api/*")` 204 short-circuit; emits ACAO/ACAM/ACAH/Max-Age (+ `Access-Control-Allow-Credentials` when enabled). Mounted in `src/elysia-app.ts` before the auth derive.
- Config: extend the existing `headers` domain (`HeadersConfig`, `src/config/schema/headers.ts`) with a `cors` block: `{ enabled, origin: string[] (default ["*"]), methods, headers, credentials (default false), maxAge }`; defaults in `src/config/sections/headers.ts`; examples appended to `configs/config.headers.example.{toml,yaml}`. No new config domain needed.
- Warn-on-start: `validateCorsSafety` in `src/config/load/safety.ts` (same pattern as `validateAuthSafety`): `logger.warn` when `origin` contains `"*"`; refuse (or hard-warn) `credentials=true` combined with wildcard — spec-illegal, browsers reject the combination.

Frontend assessment (no FE code change required):

- Default deployment is single-origin: `feFetch`/`safeFetch` use relative URLs (`API_BASE = ""`, `src/frontend/fe-fetch.ts`) — CORS is a no-op there.
- External/alternative frontends trip preflight via non-simple headers the app already sends: `X-CSRF-Token` (`src/frontend/fe-fetch.ts`, `src/frontend/alpine/htmx.ts`), `Idempotency-Key` (`fe-fetch.ts`), `Authorization: Bearer` (`src/utils/safe-fetch/headers.ts`), htmx `HX-*`. The configured ACAH allowlist must include them.
- Credentialed requests exist (`credentials: "include"`, e.g. `src/frontend/e2e/recipient-pubkey.ts`): wildcard origin + credentials is browser-rejected, so credentialed external frontends require an explicit origin list (warn-on-start covers this).
- `safeFetch` itself needs no change; CORS is browser↔server negotiation only.

Adjacent finding: the @elysiajs/helmet adoption ticket is superseded by the landed response-headers engine (`src/middleware/response-headers.ts` + `src/config/sections/headers.ts`: CSP with per-request nonce, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy — config-driven and unit-tested).
