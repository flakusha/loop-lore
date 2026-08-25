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
  swarms (federated instances) — **consumed by the `swarm-router` (dedicated VPS)** for cross-host federation; the in-host `local-swarm-router` remains a distinct axis.
- `epic-distributed-compute-sharing`: contributor **nodes over network** — **consumed by `swarm-router`** for federated compute; distinct from in-host decomposition.

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
- **V1** — ⚠️ Corrected: SQLite is **already** WAL. `getDatabase` runs `PRAGMA journal_mode = WAL` (`src/db/index.ts:54`), so the default is not non-WAL. The real, still-open hazard for the swarm topology is **concurrent multi-writer**: WAL permits only one writer, so N swarm processes each opening the same SQLite file and writing (no single-writer funnel, no advisory lock — see B2) still hit `SQLITE_BUSY` on overlapping writes. The `INSTANCE_COUNT` guard (B1) also does not cover N-process-same-file. Open decision is therefore **not** "enable WAL" (already done) but (a) single-writer `core` funnel + migration leadership (B2) vs (b) local Postgres. *Reproduction note*: the prior "WAL → 0 errs" result was measured against a non-WAL baseline that no longer exists in code; re-run against the current WAL baseline to validate the multi-writer claim.
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
- **local-swarm-router** (1, always-on, in-host): the "microservice-inside-microservice" dispatch layer. Manages / filters / load-balances the **local** swarm processes (`core` + workers) on one host; routes inbound requests / units-of-work to the correct instance by role + health + capacity; single entry the host reverse proxy (and `core`'s external HTTP surface) targets. Resolves "internal automatic routing between instances" for the local host. Decision 2026-08-26: preferred over core-side dispatch / front-proxy-only for future-proofing; higher impl cost accepted.
- **swarm-router** (dedicated VPS, 1+): federation router for **locally-running instances across hosts**. A separate VPS that federates many local swarms — peers local `local-swarm-router`s / instances over the network so locally-running deployments form a federated mesh. Distinct from the in-host `local-swarm-router`; consumes `epic-federation-swarm-sync` / `epic-distributed-compute-sharing` (network axes) rather than reinventing them. New decision 2026-08-26.

**Supervisor** (`src/swarm/`): manifest-driven
`{ name, entry, ports, healthUrl, minReplicas, maxReplicas, allocPolicy }`; generalizes
`ServerExternalManager` using `Bun.spawn` **with process groups** (fix B6) + health probes
(reuse `probes.ts`) + allocate/deallocate. Replaces/augments `start()`.

**`allocPolicy` (decision 2026-08-26; extended with incoming-load signal 2026-08-26)** — supervisor evaluates allocation signals per role via `allocate(name)` / `deallocate(name)`. Two axes:

**Scale-down (release resources):**
1. **idle / triggerability** — deallocate (toward `minReplicas`) any role that cannot be triggered or is triggered only rarely; keep `minReplicas` warm for always-on roles (`core`, `router`). Primary signal for resource rotation.

**Scale-up (provision capacity):**
2. **incoming load** — allocate additional replicas when there is a sustained backlog of **legitimate** requests (not DDoS, not inherently rate-limitable). Load-based scaling is distinct from rate-limiting / abuse mitigation: abusive or rate-limitable traffic is rejected at the limiter, not scaled out. Signal source: per-role request queue depth / latency, observed by the `local-swarm-router` and reported to the supervisor.
3. **GPU colocation** — when the host runs LLM/SD inference (`external-inference` / dedicated GPU apps) on the same machine, GPU availability is the **primary** gate for GPU-bound roles (`generation-worker`): do not allocate a GPU worker if the GPU is already owned by an inference instance; queue or fall back instead. Caps scale-up for GPU roles.
4. **cpu + load + ram** — last-priority capacity gate: bound allocation on host CPU load and available RAM when GPU is not the binding constraint. Caps scale-up for CPU/RAM roles.

Reads from a host-resource probe + router-reported load (extend `probes.ts` beyond `ServerExternalHost`/`LlamaCpp` to a generic host/instance interface — see TASK-swarm-supervisor AC).

**DB ownership decision (V1)** — pivotal, undecided: WAL is **already enabled** in `src/db/index.ts:54` (so "enable WAL" is not the open question). The undecided choice is whether to (a) keep SQLite behind a single-writer `core` funnel + migration leadership (B2) — WAL already allows concurrent readers + 1 writer, concurrency-safe for the read-mostly/single-writer shape — or (b) move to local Postgres for true multi-writer (what Epic 25/26 require). Either way the `INSTANCE_COUNT` guard (B1) must be extended to cover N-process-same-file.

## Steps

1. Add swarm config section (B8) + schema (incl. `allocPolicy` enum + router roles (local-swarm-router, swarm-router)).
2. Supervisor lib: generalize `ServerExternalManager` into `src/swarm/` (manifest +
   spawn/process-group/kill + probes + `allocPolicy` evaluation). → `TASK-swarm-supervisor`.
3. **local-swarm-router**: in-host routing layer (microservice-in-microservice) — manages /
   filters / load-balances local processes; single entry in front of `core` + workers;
   dispatches by role/health/capacity. Resolves internal automatic routing between local
   instances. → `TASK-swarm-local-router`.
4. **swarm-router (dedicated VPS)**: federation router that federates locally-running
   instances across hosts into a mesh; consumes `epic-federation-swarm-sync` /
   `epic-distributed-compute-sharing`. → `TASK-swarm-router-vps`.
5. `static` out (reuse headless epic).
6. `job-worker` out (read-only DB + API writes; memory decay/distillation/archive on idle).
7. `generation-worker` out — blocked on `epic-llm-queue`; per-worker providers or
   provider-gateway; GPU-colocation aware via `allocPolicy`.
8. DB ownership decision (V1) + migration leadership (B2) + singleton extraction
   (B3, B4, B5).
9. Update `docs/spec/build-deploy.md` (B9) + tests (B7).

## Testing Strategy

| Test      | Coverage                                                        | Files                          |
| --------- | --------------------------------------------------------------- | ------------------------------ |
| Unit      | supervisor spawn/kill process-group; manifest parse; probe     | `src/swarm/**`, `tests/`       |
| Integration | core + 1 worker boot; read-only worker + writer (WAL) no BUSY | `tests/integration/swarm/`     |
| e2e       | supervisor boots, deallocates a worker, core still serves       | `tests/e2e/swarm/`             |

## Open Questions

- **Memory-allocation improvement target** — the brief's "improvement on memory allocation" is
  not yet specified (per-process memory budget? shared buffer? GC/heap tuning?). Define a
  concrete target before steps 5–6.
- **Router SPOF / extra hop** — the `local-swarm-router` is a single in-host entry + one more
  network hop; accepted for future-proofing (2026-08-26) but needs a health/failover story
  (local-router pair or `core`-fallback) before production. The `swarm-router` (VPS) adds
  cross-host federation resilience but is itself a network SPOF for the mesh — needs its own
  HA story.

- **IPC / inter-process transport** — decision needed: how `core` ↔ `local-swarm-router` ↔ workers
  communicate (Unix domain sockets vs loopback TCP vs shared memory vs message bus). Gates
  security, latency, and resource caps. Currently undefined in the design.
- **Inter-process security / trust boundary** — decision + threat model needed: router→core auth,
  secret distribution to workers, `trustProxy`/`XFF` (B8) semantics across the router→core hop,
  localhost-only binding. Distinct from the existing `Security & Sandboxing` epic (app-level
  sandboxing, not the internal multi-process boundary).
- **Swarm config schema surface** — design needed (closes B8): per-role `min`/`maxReplicas`,
  `allocPolicy` params, resource caps, router topology, IPC choice. The epic says "add config
  section" but never designs the shape.
- **Cross-process resource accounting model** — design needed: per-user / per-chat accounting that
  survives process boundaries; generalizes Finding 4 (memory allocation) + B4 (rate-limit map).
  Properly closes the still-open Finding 4.
- **Graceful degradation / partial-outage UX** — product decision: what the user sees when a worker
  is deallocated or `core` is overloaded (queue vs 503 vs degraded mode). Currently silent.

## Future Improvements

Complementary work that pairs with the hot-module (allocatable/deallocatable) lifecycle.
Not in the initial Steps; candidates for later `TASK-swarm-*` tickets.

**Lifecycle completeness**
- **Drain-on-deallocate** — current kill is SIGTERM → 500ms → SIGKILL (`src/services/server-external-manager/lifecycle.ts`); no in-flight drain. Deactivate should finish current work first: `local-swarm-router` stops sending new work, worker drains, then exits.
- **Dependency-ordered bootstrap/shutdown DAG** — `start()` (`src/server/start.ts`) boots monolithically; with hot modules, order matters: `core` before workers, `external-inference` before `generation-worker`, on both bring-up and tear-down.
- **Rolling module swap (blue-green)** — upgrade a module by spawning the new replica, shifting traffic at `local-swarm-router`, retiring the old. Turns "hot" into "hot upgrade".

**Resilience**
- **Self-healing restart + backoff + flap suppression** — liveness probes already exist (`probes.ts`); add death → restart with exponential backoff and flap detection so a crashing module doesn't thrash.
- **Fault domains / blast-radius tests** — assert a module crash cannot take `core` down (inherent to separate processes); add a test + one-line design note.

**Resource** (feeds `allocPolicy`)
- **Per-process resource caps** — supervisor launches workers under cgroup v2 / rlimit on Linux; gives `allocPolicy`'s CPU/RAM/GPU gating real enforcement instead of advisory checks.
- **Shared registry/cache as a first-class process** — instead of per-process singletons (`B3` providers, `B4` rate-limit map, `B5` SSE), stand up one in-host `state`/`cache` process modules read from. Fixes B3–B5 at the source and makes modules share-explicit.

**Operability** (needed once there are N processes)
- **Dynamic config push / per-module hot-reload** — `applyEnvironmentOverrides` already exists in `start.ts`; extend so a config change propagates to a running module without respawn.
- **Unified tracing/telemetry bus** — merge per-process signals into one stream (reuse `src/routes/admin/aux-telemetry.ts`) so the swarm is observable as a whole.
- **Capability advertisement to router** — modules register "I serve generation on GPU 0" to `local-swarm-router`, so routing is by capability not just role.

**Transition & verification**
- **Monolith → supervisor cutover plan** — makes the "⬜ Not Started" epic executable: feature-flag
  the supervisor, run side-by-side with `start()`, dual-path, then remove `start()`. Distinct from
  `Script Migration to Modular Architecture` (scripts, not server bootstrap).
- **Multi-process test harness** — scopes building what the Testing Strategy table assumes: spawn
  supervisor + workers in integration/e2e, assert worker dealloc, core survives, drain behavior.
  `E2E & Integration Testing Reliability` exists but does not cover multi-process bootstrap.

Highest leverage, least new surface: **drain-on-deallocate**, **shared registry/cache process** (closes B3–B5), **per-process cgroup caps** (makes `allocPolicy` real).

## Related Epics

- `epic-deployment-topologies` (Epic 25) — host orchestration superset.
- `epic-multi-instance-reconciliation` (Epic 26) — migration leadership / drift /
  real-time bus (prereqs).
- `epic-headless-alternative-frontends` — frontend-serving separation (reuse).
- `epic-llm-queue` — generation-worker queue (prereq).
- `FEAT-swarm-mode-reconciliation` / `epic-federation-swarm-sync` — network CRDT peer
  swarm; **consumed by `swarm-router` (VPS)** for cross-host federation (distinct from in-host `local-swarm-router`).
- `epic-distributed-compute-sharing` — contributor nodes; **consumed by `swarm-router`** for federated compute.

## Linked Tasks

- `TASK-swarm-supervisor`
- `TASK-local-swarm-router-in-host-process-manage-filter-balance`
- `TASK-swarm-router-dedicated-vps-federation-of-locally-running-ins`
