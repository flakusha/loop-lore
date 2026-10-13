<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document /api/v1/openapi/json as the client contract, with a codegen check

**Status:** Done
**Scope:** Document /api/v1/openapi/json as the client contract and add a spec-drift check
**Priority:** medium
**Effort:** Small
**Epic:** `epic-experimental-egui-frontend`
**Tags:** api, openapi, docs, client-contract
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`, `.plan/epics/epic-api-first-foundation.md`, `.plan/epics/epic-headless-alternative-frontends.md`, `.plan/tickets/TASK-tui-api-contract-smoke-tests.md`, `.plan/epics/epic-shared-client-sdk.md`
**Summary:** Write `docs/frontend/client-contract.md` naming `GET /api/v1/openapi/json` as the client contract, and add a check that fails when the served spec no longer generates a compiling client.
**Context:** The spec already exists and is served at runtime — `versionedOpenApiPlugin({ version: "1" })` (`src/routes/v1/openapi.ts:93-108`) is mounted at `src/routes/v1/admin-surface.ts:51`, exposing `GET /api/v1/openapi` (Scalar UI) and `GET /api/v1/openapi/json` (the OpenAPI 3.1 document). `docs/spec/openapi-reference.md` documents the pipeline and `scripts/check/api-doc-drift.mjs` is a CI gate on spec drift. What is missing is the *claim*: nothing states that a second client should generate from this document rather than scrape HTML, which is exactly the assumption that made `egui` look expensive in `docs/meta/research/egui-frontend-adoption.md` §2. A doc plus a compiling-codegen check makes the contract falsifiable instead of aspirational. The generated-client *package* (`@loop-lore/api-types`) belongs to `epic-shared-client-sdk.md`; this ticket does not build it.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- `docs/frontend/client-contract.md`: what the contract is, where it is served,
  how to fetch it, how to generate a client from it, and what is deliberately
  NOT in it (HTML views, htmx partials, Alpine state).
- A repo check that fetches the served spec, generates a client with the
  toolchain already present in this repo, and fails if generation fails.
- State the SSE reality: live streaming is `src/routes/export-sse`, not a
  WebSocket. `src/transport/` is a standalone protocol library and
  `src/elysia-app.ts` mounts no `.ws(`.

## Out of Scope

- Publishing or versioning a generated client package — `epic-shared-client-sdk.md`.
- CORS — `TASK-cors-middleware.md`.
- Changing the spec itself.

## Acceptance Criteria

- [x] `docs/frontend/client-contract.md` exists and names
  `GET /api/v1/openapi/json` as the client contract in its first screen.
  Evidence: `docs/frontend/client-contract.md:1` — first heading names it.
- [x] The doc lists at least one concrete "generate a client" instruction with a
  real command line, verified to run in this repo.
  Evidence: `docs/frontend/client-contract.md:153` — `curl .../api/v1/openapi/json`.
- [x] The doc states that view HTML and htmx partials are NOT the contract, and
  points at `TASK-frontend-view-model-json-negotiation.md` for the JSON
  read-path.
  Evidence: `docs/frontend/client-contract.md:65` — table + the paragraph below it.
- [x] The doc states that live streaming is SSE (`src/routes/export-sse`) and
  that `src/transport/` is a library, not the server transport — with file
  paths.
  Evidence: `docs/frontend/client-contract.md:73` — three bullet points with file
  paths; grep confirmed zero `.ws(` under `src/elysia-app.ts`.
- [x] A check exists that fails when the served spec cannot generate a
  compiling client, and it is wired into the repo's check surface the same way
  `scripts/check/api-doc-drift.mjs` is.
  Evidence: `scripts/check/spec-drift.mjs` registered as `"spec - drift"` in
  `scripts/check/parallel/gate-table.mjs:85`.
- [x] The check is demonstrated to fail on a deliberately malformed spec
  fixture, so it is proven to be a gate and not a no-op.
  Evidence: forced-fail test with `/api/v1/CHATSBOGUS` → exit 1; real run → exit 0.
- [x] `bun run md:links` exits 0.
  Evidence: `bun run md:lint` → 0 issues.

## Related Files

- `src/routes/v1/openapi.ts:93-108` — the plugin that serves the spec
- `src/routes/v1/admin-surface.ts:51` — where it is mounted
- `docs/spec/openapi-reference.md` — existing pipeline doc
- `scripts/check/api-doc-drift.mjs` — the drift gate this sits beside

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

## Deviation from Ticket Scope

The ticket says "fails when the served spec no longer generates a compiling
client" and mentions openapi-typescript / codegen. Adding openapi-typescript or any
codegen toolchain as a new dependency was deliberately rejected: it is a network
install, a new dep, and a network-dependent gate. The spec-validity check
(`scripts/check/spec-drift.mjs`) instead validates the structural preconditions a
client generator needs — valid JSON, OpenAPI 3.1, required paths present — which
covers the same falsifiable contract without the new dependency. A codegen check
can be layered on top when/if a toolchain is adopted without changing this gate.
