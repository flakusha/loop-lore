<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# ADR: API version v1 (1.0.0 version pin and breaking-change policy)

**Status:** ACCEPTED — operator ruling 2026-11-19.
**Date:** 2026-11-19
**Decides:** TASK-decide-api-version-pin-and-adr, TASK-epic-release-1-0-0 open question 1 (API version pin / breaking policy)
**Ticket:** TASK-decide-api-version-pin-and-adr
**Related:** TASK-openapi-specification.md, src/routes/v1/index.ts, src/routes/middleware/version-resolver.ts, src/routes/middleware/deprecation-headers.ts

## Context

The server already exposes versioned routes under `/api/v1` with a version resolver and opt-in deprecation headers. The 1.0.0 release tracker still carried the API version pin and its breaking-change policy as an open decision. Without an explicit pin, an additive v1 change can silently become a breaking one and clients have no contract to rely on.

## Decision

1. **PIN:** release 1.0.0 pins the public HTTP API contract to `/api/v1`. New behavior ships as additional v1 routes or additive fields; a new major version gets a new prefix (`/api/v2`) registered beside v1.
2. **BREAKING CHANGE:** removing or renaming a path/method, removing or renaming a required request field, changing a response shape or status code, or tightening auth semantics under `/api/v1` is forbidden. Such changes require a new major prefix.
3. **ADDITIVE IS COMPATIBLE:** new optional request fields, new response fields, new endpoints, and new enum members consumed additively are allowed in v1. The flat error envelope (`{ error, code, meta }`) and the `NOT_IMPLEMENTED` code are part of the contract.
4. **DEPRECATION:** `API_V1_DEPRECATED=1` emits `Deprecation`/`Sunset` headers through the existing after-handle hook. Deprecation never changes behavior or removes a v1 route; removal is a v2 concern.
5. **RESERVED SURFACES:** planned-but-unimplemented v1 operations answer `501 NOT_IMPLEMENTED`, never 404, so the contract is discoverable without promising an implementation. Auth still runs first (401/403 before 501).

## Consequences

- Clients can pin `/api/v1` against 1.0.0 without a compatibility re-negotiation for additive changes.
- The OpenAPI document is generated from the live Elysia/TypeBox schemas; `openapi/validate`, `openapi/diff`, and `openapi/changelog` are reserved 501 stubs until that mechanism lands.
- A breaking change costs a new major prefix and parallel maintenance, which is intentional: it forces the decision to be visible.
- Deprecation headers are advisory only; no v1 route is removed in 1.0.x.

## Rejected alternatives

- Silent in-place evolution of v1 — rejected: breaks existing clients without a version boundary.
- Early `/api/v2` launch at 1.0.0 — rejected: no v2 consumers yet; an empty parallel surface adds cost with no benefit.
- Hiding reserved endpoints as 404 — rejected: makes the planned contract indistinguishable from a typo and invites clients to branch on 404.

## Compliance

- Versioned route registration: `src/routes/v1/index.ts`.
- Deprecation headers: `src/routes/middleware/deprecation-headers.ts` (opt-in via `API_V1_DEPRECATED`).
- Reserved 501 stubs: `src/routes/v1/governance-stubs.ts` (mounted from `governanceEndpoints()`).

## Open questions

- None. The breaking-change policy above is binding for 1.0.0.
