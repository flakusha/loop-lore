<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Local Process Swarm (Bun-Managed Multi-Process Decomposition)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Architecture Epic
**Tags:** architecture, deployment, processes, swarm, bun, supervisor

## Summary

Decompose the single Bun process (`src/server/start.ts`) into a set of separately-managed
Bun processes — a `core` API process plus on-demand workers (`static`, `generation`, `job`)
and a Bun-written supervisor — so components can be allocated/deallocated independently on
one host. Generalizes the existing `ServerExternalManager` subprocess primitive
(`src/services/server-external-manager/`) from "external AI servers" to "managed loop-lore
sub-apps".

## Problem

Ground truth (verified 2026-08-25 via source read + executed reproductions):

- `start()` in `src/server/start.ts` boots **everything** in one Bun process: logger,
  config, crypto/SMK, provider discovery + init, `runMigrations`, seed, HTTP+HTTPS serve,
  admin, telemetry, background services, plugin loading, asset compression,
  `ServerExternalManager`, liveness probes, graceful shutdown.
- `createApp(deps)` (`src/elysia-app.ts`) builds **one** Elysia app with the entire route
  surface via closure injection of `{ database, config, handleNonApiRequest }`.
- The subprocess primitive **already exists**: `ServerExternalManager` uses `bun:spawn`
  (`src/services/server-external-manager/start-llama.ts`) to launch llama.cpp/sd.cpp/
  llama-swap with start/health/stop lifecycle, 30s liveness probes, SIGTERM→SIGKILL
  (`lifecycle.ts`), `killAllSync` on exit.

**This is NOT covered by existing epics** (verified by scanning 1573 `.plan` markdown
files + `epics-index.md`):

- `epic-deployment-topologies` (Epic 25): multi-*host* K8s/Compose orchestration — a
  superset host, not the in-process decomposition.
- `epic-multi-instance-reconciliation` (Epic 26): leader-based migration leadership /
  drift / real-time bus — hard prerequisites this epic **consumes**.
- `epic-headless-alternative-frontends`: covers the frontend-serving **separation** slice
  (its "Headless API mode (no frontend serving)" == this epic's `static` process) —
  **REUSE, don't reinvent**.
- `FEAT-swarm-mode-reconciliation` / `epic-federation-swarm-sync`: **network** CRDT peer
  swarms (federated instances) — different axis.
- `epic-distributed-compute-sharing`: contributor **nodes over network** — different axis.

## Blocking prerequisites (all verified)

- **B1** — SQLite guard bypassed by topology: `validateDatabaseSafety`
  (`src/config/load/safety.ts:8-18`) only fires when `INSTANCE_COUNT > 1`; N swarm
  processes each default to `1` and pass while sharing one SQLite file. *Reproduced.*
- **B2** — No migration leader election: `runMigrations` (`src/db/migrate.ts:80`) →
  `migrator.migrateToLatest()` (line 94) with no advisory lock.
- **B3** — Provider registry module-scope singleton: `src/generation/providers/registry.ts:23`
  `const registry = new Map(...)`; `initializeProviders` populates in-process.
- **B4** — Rate limiter in-process heap: `src/middleware/rate-limit.ts:65` `createRateLimiter`
  builds `new Map` per instance.
- **B5** — SSE delivery per-process: `src/routes/activity-stream.ts:44` `export class
  ActivityStreamer` per-connection closure + own timer.
- **B6** — Supervisor kill PID-only → orphans: `src/services/server-external-manager/lifecycle.ts:15-21` kills direct PID only (and `killAllSync` at `:44-52` likewise targets `instance.pid`). *Reproduced*: grandchild survives child kill.
- **V1** — Default SQLite mode breaks read-only + writer: `new Database(path)`
  (`src/db/index.ts`) → `SQLITE_BUSY` under concurrency; WAL fixes it. *Reproduced*: WAL →
  0 errs, `integrity ok`.
- **B7** — Test-boot coupled to single process: 455 test files; 25 use `createApp`, 189
  `beforeAll`, 2 call `start()`, 1 e2e `createRequestHandler`.
- **B8** — No multi-process config: `src/config/sections/server.ts` exposes only
  `port`/`host`/`tls`.
- **B9** — Deploy doc single-process: `docs/spec/build-deploy.md` "one command, zero config".

## Design

Process roles:

- **core** (1): owns SQLite (or PG) + migration leadership; Elysia API, auth, SSE, all
  writes. Always-on. Maps to the current `createApp` surface.
- **static** (0–1): `/views`, `/docs`, public assets. Aligns with
  `epic-headless-alternative-frontends`.
- **generation-worker** (0–N): consumes generation tasks from a queue
  (`epic-llm-queue`, ⬜ Not Started); allocate/deallocate by GPU/load. Needs per-process
  `initializeProviders` or a provider-gateway.
- **job-worker** (0–1): telemetry retention, memory decay/distillation, archival,
  scheduled tasks. Deallocate when idle.
- **external-inference** (0–N): llama.cpp/sd.cpp/llama-swap — fold existing
  `ServerExternalManager` into the same supervisor.

**Supervisor** (`src/swarm/`): manifest-driven
`{ name, entry, ports, healthUrl, minReplicas, maxReplicas, allocPolicy }`; generalizes
`ServerExternalManager` using `Bun.spawn` **with process groups** (fix B6) + health probes
(reuse `probes.ts`) + allocate/deallocate. Replaces/augments `start()`.

**DB ownership decision (V1)** — pivotal, undecided: either (a) single-writer `core` owns
SQLite with **WAL enabled** (proven concurrency-safe) + workers read-only + API
write-funnel, or (b) local Postgres (what Epic 25/26 require for multi-instance).

## Steps

1. Add swarm config section (B8) + schema.
2. Supervisor lib: generalize `ServerExternalManager` into `src/swarm/` (manifest +
   spawn/process-group/kill + probes). → `TASK-swarm-supervisor`.
3. `static` out (reuse headless epic).
4. `job-worker` out (read-only DB + API writes).
5. `generation-worker` out — blocked on `epic-llm-queue`; per-worker providers or
   provider-gateway.
6. DB ownership decision (V1) + migration leadership (B2) + singleton extraction
   (B3, B4, B5).
7. Update `docs/spec/build-deploy.md` (B9) + tests (B7).

## Testing Strategy

| Test      | Coverage                                                        | Files                          |
| --------- | --------------------------------------------------------------- | ------------------------------ |
| Unit      | supervisor spawn/kill process-group; manifest parse; probe     | `src/swarm/**`, `tests/`       |
| Integration | core + 1 worker boot; read-only worker + writer (WAL) no BUSY | `tests/integration/swarm/`     |
| e2e       | supervisor boots, deallocates a worker, core still serves       | `tests/e2e/swarm/`             |

## Related Epics

- `epic-deployment-topologies` (Epic 25) — host orchestration superset.
- `epic-multi-instance-reconciliation` (Epic 26) — migration leadership / drift /
  real-time bus (prereqs).
- `epic-headless-alternative-frontends` — frontend-serving separation (reuse).
- `epic-llm-queue` — generation-worker queue (prereq).
- `FEAT-swarm-mode-reconciliation` / `epic-federation-swarm-sync` — network CRDT peer
  swarm (distinct).
- `epic-distributed-compute-sharing` — contributor nodes (distinct).

## Linked Tasks

- `TASK-swarm-supervisor`
