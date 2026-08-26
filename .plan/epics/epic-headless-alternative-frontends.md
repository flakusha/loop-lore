<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Headless Mode & Alternative Frontends

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High (split into 5 sub-epics)
**Type:** Feature Epic

## Summary

Headless mode, alternative frontend solutions, OpenAPI spec, WebSocket/WebTransport support. Enable non-browser clients and alternative UIs.

> **⚠️ This epic is a coordination hub.** Work has been split into 5 sub-epics. Each sub-epic delivers independently shippable value; this file keeps only the shared cross-cutting interfaces and sequencing.

## Sub-Epics

| Sub-Epic                      | Epic File                            | Scope                                                                                                    | Priority |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------- |
| **API-First Foundation**      | `epic-api-first-foundation.md`       | OpenAPI spec from Elysia routes, headless mode config, API versioning, CORS + API-key auth, `packages/server/`, API docs | Medium   |
| **Realtime Transports**       | `epic-realtime-transports.md`        | WebSocket endpoint support, WebTransport endpoint support, real-time state contracts                     | Medium   |
| **Shared Client SDK**         | `epic-shared-client-sdk.md`          | `@loop-lore/api-types` (generated), `@loop-lore/client` (retry/auth/errors), CSS design tokens, monorepo workspace, type tests | Medium   |
| **Framework SDKs**            | `epic-framework-sdks.md`             | React/Preact/Svelte/Vue/Next/Nuxt packages, per-target build pipelines, usage docs (Next/Nuxt/Vue deferrable) | Medium   |
| **Fresh Alternative Frontend**| `epic-fresh-alternative-frontend.md` | Fresh.js starter repo, core-endpoint handlers, islands, Tailwind, Deno/npm bridge, Deno Deploy/Docker/static targets | Medium   |

## Sequencing

1. **API-First Foundation** first — everything else consumes the generated spec and the importable server package.
2. **Shared Client SDK** next — types are generated from the spec; client + tokens feed all UI layers.
3. **Framework SDKs** and **Fresh Alternative Frontend** run in parallel on top of the shared layer.
4. **Realtime Transports** is independent at the endpoint level and may proceed in parallel; its event envelopes must be coordinated with the shared client before stabilization.

## Shared Cross-Cutting Interfaces

### Layering: Shared vs. Framework-Specific

| Layer            | Shared                                              | Framework-Specific               |
| ---------------- | --------------------------------------------------- | -------------------------------- |
| API types        | OpenAPI + TypeScript types (`@loop-lore/api-types`) | N/A                              |
| State management | API client (`@loop-lore/client`)                    | React hooks, Svelte stores, etc. |
| UI components    | Design tokens, CSS variables                        | React/Preact/Svelte components   |
| Build config     | Vite config, tsconfig                               | Framework-specific Vite plugins  |

Per-layer detail lives in the owning sub-epic (`epic-shared-client-sdk.md`,
`epic-framework-sdks.md`).

### Shared State Contracts

All SDKs consume the same OpenAPI-generated types and use the shared
`@loop-lore/client` under the hood. State management patterns:

| Concern        | Pattern                                          |
| -------------- | ------------------------------------------------ |
| Data fetching  | React Query / SWR (React), Svelte Query (Svelte) |
| Auth           | API key → JWT, stored in httpOnly cookies        |
| Real-time      | WebSocket / SSE for live updates (see `epic-realtime-transports.md`) |
| Caching        | In-memory + localStorage for offline             |
| Error handling | Structured error types from API                  |

## Files

- `src/elysia-app.ts` — app configuration
- `src/routes/` — API routes
- `docs/spec/api-routes.md` — API documentation
- `docs/spec/architecture.md` — architecture spec
- `packages/api-types/` — shared TypeScript types
- `packages/client/` — shared API client
- `packages/react/` — React SDK
- `packages/preact/` — Preact SDK
- `packages/svelte/` — Svelte SDK
- `packages/vue/` — Vue SDK
- `packages/next/` — Next.js SDK
- `packages/nuxt/` — Nuxt module

## Linked Tasks

- TASK-headless-alternative-frontends.md

## Related Epics

- **epic-api-library-distribution.md** — SDK packages depend on API-first foundation and library distribution
- **epic-transport-expansion.md** / **epic-transport-layer-expansion.md** — transport layer underpinning realtime endpoints
