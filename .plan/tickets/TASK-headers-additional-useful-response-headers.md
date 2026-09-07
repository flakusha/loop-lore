<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: additional useful response headers (Origin-Agent-Cluster, DNS-prefetch, api no-store, statusText, Report-To)

**Status:** open
**Epic:** epic-http-protocol-features

**Priority:** medium
**Effort:** Small

## Summary

`src/middleware/response-headers.ts` (`ResponseHeaderPolicy`, FExBE) already covers Referrer-Policy, nosniff, X-Frame-Options, CORP/COOP/COEP, Permissions-Policy, CSP (+nonce, report-only), HSTS (HTTPS-only), Reporting-Endpoints, NEL, Accept-CH/Critical-CH/Save-Data, Link preload, Timing-Allow-Origin, and immutable augmentation for hashed assets. Review found six small gaps worth closing in one pass (verified against `src/middleware/response-headers.ts` and the `createRequestHandler` fetch-boundary wiring in `src/server/handler.ts`, which already covers every Elysia route including `v1Routes`):

1. `apply()` re-wraps via `new Response(body, { status, headers })` and drops `statusText` (e.g. 404 Not Found becomes generic). Preserve it.
2. `CANONICAL_HEADER_NAMES` lacks `strict-transport-security` and `report-to` (consistency-only cleanup — the `Headers` API is already case-insensitive and addition keys are canonical literals, so no double-set is possible; `X-Request-Id` needs no entry, it is set unconditionally by `createRequestHandler`).
3. No `Origin-Agent-Cluster: ?1` on html (cheap process-isolation hardening, pairs with COOP/COEP).
4. No `X-DNS-Prefetch-Control: off` default on html/api (privacy default; routes can still opt in).
5. No `Report-To` legacy-compat header alongside `Reporting-Endpoints` (older Chromium/Safari only read `Report-To`); emit it from the same `reportingEndpoints` map when non-empty.
6. API JSON responses carry no default `Cache-Control: no-store` — authenticated payloads are one misconfigured proxy away from being cached. Scope the default to `application/json` responses only (NOT all `/api/*`: asset bytes served under `/api/assets` may legitimately carry cache directives), and only when the route omitted `Cache-Control` (additive rule already guarantees precedence). Verify asset routes set explicit `Cache-Control` before landing.

Out of scope: deprecation headers (`Sunset`/`Deprecation`, owned by `src/routes/middleware/deprecation-headers.ts`), 429 `Retry-After` (BUG-429 ticket), CSP directive tuning.

## Acceptance Criteria

- [ ] `apply()` preserves `statusText` on re-wrap (minor: HTTP/2 drops reason phrases; matters for HTTP/1.1 clients)
- [ ] Canonical map covers `strict-transport-security`, `report-to` (consistency cleanup, no behavior change)
- [ ] html responses emit `Origin-Agent-Cluster: ?1` and `X-DNS-Prefetch-Control: off` unless route set them
- [ ] Non-empty `reportingEndpoints` emits both `Reporting-Endpoints` and legacy `Report-To`
- [ ] `application/json` api responses default to `Cache-Control: no-store` when route omitted it (asset bytes excluded; asset routes verified)
- [ ] Unit tests in `response-headers.test.ts` cover each addition; `bun run check` green
