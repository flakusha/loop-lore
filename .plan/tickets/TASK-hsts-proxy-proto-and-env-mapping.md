<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: HSTS proxy proto and env mapping

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

HSTS is default-off and emitted when the request URL scheme is `https:` or, when `server.trustProxy` is true, on a trusted `X-Forwarded-Proto: https` (`packages/core/src/config/sections/headers.ts:49-51`, `src/middleware/response-headers.ts:215-229`, `src/server/handler.ts:45-49`). The `headers.hsts.*` env keys DO exist: the recursive `add("headers", s.headers)` mapping (`packages/core/src/config/schema-class/env-map.ts:99`) generates them, with exact names in `schemas/env-map.snapshot.json`.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §1e/:123-124. `BUG-hsts-header-missing-from-response-policy.md` is Done; its Deployment caveat (:38-55) explicitly asks operators to file a follow-up adding proxy-header support before enabling HSTS in production. Edge HSTS exists at `deploy/Caddyfile:31` and `docs/ops/bare-metal/network.md:72-78`, so direct-TLS and custom-proxy deployments can enable it via the generated env keys.

## Scope

- Consult `X-Forwarded-Proto` when `server.trustProxy` is true; keep the raw-scheme path unchanged when false (spoofed headers must stay ignored).
- Add env mappings for hsts enabled/maxAge/includeSubDomains/preload following existing header env conventions.
- Keep `enabled: false` default; never emit on an actual plain-HTTP request.
- Document the terminator setup in the deployment docs.

## Acceptance Criteria

- [x] HSTS emitted behind a trusted TLS terminator that forwards `X-Forwarded-Proto: https`.
- [x] Spoofed `X-Forwarded-Proto` ignored when `trustProxy` is false.
- [x] Each hsts field set through its env variable.
- [x] Default behavior (off, plain HTTP) unchanged.
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification

- `bun test src/middleware/response-headers.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
