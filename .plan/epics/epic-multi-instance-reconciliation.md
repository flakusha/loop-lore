# Epic 26: Multi-Instance Reconciliation — Implementation Plan

**Status:** Draft — description under `tree/chore-docs-reconcile` (docs chore)\
**Proposed Epic Branch:** `epic/26`\
**Owner:** TBD\
**Blocks:** Epic 25 (Deployment Topologies), Epic 27 depends on its config guards

---

## Current State Assessment

| Area                   | File(s)                              | State | Notes                                                                           |
| ---------------------- | ------------------------------------ | ----- | ------------------------------------------------------------------------------- |
| Kysely Migrator runner | `src/db/migrate.ts`                  | ✅    | Runs on **every** boot. **No leader election** — N replicas race.               |
| Schema manifest        | `src/db/schema-manifest.ts`          | ✅    | `verify()` diffs declared vs actual schema. **Test-only** — not run at startup. |
| Schema sync test       | `src/db/schema-sync.test.ts`         | ✅    | Proves `verify()` works; no startup enforcement.                                |
| Data transforms        | `data_migrations` table              | ✅    | Tracks `from_version → to_version` rewrites, separate from DDL.                 |
| Session state          | `src/db/schema-core.ts` (`sessions`) | ✅    | Persisted in DB — instances stateless, scalable in principle.                   |
| Real-time (SSE)        | `src/routes/activity-stream.ts`      | ✅    | **Per-process** — clients on other replicas don't get events.                   |
| Advisory lock / leader | —                                    | ❌    | No `pg_advisory_lock`, no wait-for-ready.                                       |
| Startup drift check    | —                                    | ❌    | `SchemaManifest.verify()` not invoked at boot.                                  |
| Load balancer config   | —                                    | ❌    | No routing strategy, no health checks, no instance discovery.                   |
| Auto-scaling           | —                                    | ❌    | No scaling triggers, no metrics-based scaling.                                  |

---

## Problem Statement

architecture.md claims multi-user = "reverse proxy + multiple Bun workers or container instances." That is **not yet safe**:

1. **Migration race.** Cold deploy: every replica runs the Migrator. Concurrent DDL corrupts SQLite; errors/double-applies on Postgres.
2. **Schema drift.** A stale instance on an older image can serve against a migrated DB. `SchemaManifest.verify()` detects it but is unused at boot.
3. **Real-time is per-process.** SSE (implemented in `src/routes/activity-stream.ts`) only reaches clients on the same replica.
4. **No load balancing strategy.** No routing algorithm, no session affinity, no health-based routing, no auto-scaling.

This epic makes multi-instance boot deterministic, drift-safe, and horizontally scalable.

---

## Implementation Phases

### Phase 1 — Migration Leadership

**Goal:** Exactly one instance migrates; others wait for schema-ready.

| Task                                                                 | Files                                  | Effort |
| -------------------------------------------------------------------- | -------------------------------------- | ------ |
| Postgres advisory-lock leader (`pg_advisory_lock`); non-leader waits | `src/db/migrate.ts`                    | Med    |
| SQLite single-instance guard (refuse multi-instance boot)            | `src/db/migrate.ts`, `src/db/index.ts` | Low    |
| `waitForSchemaReady()` poll + exponential backoff + timeout          | `src/db/migrate.ts`                    | Med    |
| Boot order: acquire lock → migrate → release → serve                 | `src/db/index.ts` / `src/server.ts`    | Low    |

### Phase 2 — Schema Drift Detection & Reconciliation

**Goal:** No instance serves against a schema disagreeing with `SchemaManifest`.

| Task                                                                | Files                                            | Effort |
| ------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| Run `SchemaManifest.verify()` at startup on every instance          | `src/db/schema-manifest.ts`, `src/db/index.ts`   | Low    |
| Policy `strict` (refuse serve) vs `repair` (solo/SQLite auto-apply) | `src/config/sections/database.ts`                | Med    |
| Structured log + `/health/schema` reporting drift state             | `src/routes/health.ts` (Epic 25), `src/logger/*` | Med    |
| Unit + integration tests against deliberately broken schema         | `src/db/schema-sync.test.ts` (extend)            | Med    |

### Phase 3 — Cross-Instance Real-Time (optional)

**Goal:** SSE activity reaches clients on any replica.

| Task                                                                   | Files                                | Effort |
| ---------------------------------------------------------------------- | ------------------------------------ | ------ |
| Optional Redis pub/sub behind `REALTIME_BUS=redis`                     | `src/routes/activity-stream.ts`      | Med    |
| Sticky-session fallback documented (`ip_hash`) for `REALTIME_BUS=none` | `docs/guide/deployment.md` (Epic 25) | Low    |
| Per-process SSE retained when bus absent (backward compatible)         | `src/routes/activity-stream.ts`      | Low    |

### Phase 4 — Load Balancing & Horizontal Scaling

**Goal:** Production-grade multi-instance deployment with intelligent routing, health checks, and auto-scaling.

| Task                                                                     | Files                                            | Effort |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ------ |
| Define load balancing routing strategies (round-robin, least-conn)       | `docs/guide/load-balancing.md` (new)             | Low    |
| Session affinity strategy (sticky sessions for SSE, JWT stateless)       | `docs/guide/load-balancing.md`                   | Low    |
| Health check endpoint (`/health/live`, `/health/ready`)                  | `src/routes/health.ts` (extend)                  | Low    |
| Instance discovery via DNS SRV or Kubernetes headless service            | `docs/guide/deployment.md` (Epic 25)             | Med    |
| Graceful shutdown with connection draining                               | `src/server.ts`                                  | Med    |
| Graceful rolling upgrade with readiness gate                             | `docs/guide/deployment.md`                       | Med    |
| Auto-scaling triggers (CPU > 70%, memory > 80%, request latency > 100ms) | `docs/guide/deployment.md`, `src/metrics/*`      | High   |
| Load testing for multi-instance (10k+ concurrent sessions)               | `tests/integration/multi-instance.test.ts` (new) | High   |
| Blue-green deployment strategy                                           | `docs/guide/deployment.md`                       | Med    |

#### Load Balancing Routing Strategies

| Strategy             | Algorithm           | Best For                | Session Affinity    |
| -------------------- | ------------------- | ----------------------- | ------------------- |
| Round Robin          | Sequential          | Even load               | No (stateless APIs) |
| Least Connections    | Pick lowest active  | Variable request times  | Optional            |
| IP Hash              | Hash client IP      | Sticky sessions         | Yes (SSE)           |
| Weighted Round Robin | Weighted sequential | Heterogeneous instances | No                  |

#### Session Affinity Strategy

| Concern                  | Strategy                                    |
| ------------------------ | ------------------------------------------- |
| API requests (stateless) | No affinity — JWT in header                 |
| SSE connections          | Sticky sessions (`ip_hash` or cookie-based) |
| WebSocket connections    | Sticky sessions required                    |
| Asset uploads            | No affinity — direct to object storage      |

#### Health Check Endpoints

```typescript
// src/routes/health.ts
GET /health/live  → 200 OK (process is running)
GET /health/ready  → 200 OK (schema verified, DB connected, ready to serve)
GET /health/schema  → 200 OK + drift report (Phase 2)
GET /health/metrics  → Prometheus metrics (CPU, memory, active connections)
```

#### Auto-Scaling Triggers

| Metric                 | Threshold           | Action                   |
| ---------------------- | ------------------- | ------------------------ |
| CPU utilization        | > 70% for 2 min     | Scale up by 1 instance   |
| Memory utilization     | > 80% for 2 min     | Scale up by 1 instance   |
| API p95 latency        | > 100ms for 30s     | Scale up by 1 instance   |
| Active SSE connections | > 1000 per instance | Scale up by 1 instance   |
| CPU utilization        | < 30% for 10 min    | Scale down by 1 instance |

#### Graceful Shutdown

```typescript
// src/server.ts
process.on("SIGTERM", async () => {
  // 1. Stop accepting new connections
  server.close();
  // 2. Wait for active requests to finish (30s timeout)
  await waitForActiveRequests(30000,);
  // 3. Close SSE connections gracefully
  await closeSSEConnections();
  // 4. Exit
  process.exit(0,);
},);
```

#### Instance Discovery

| Environment     | Discovery Method            |
| --------------- | --------------------------- |
| Kubernetes      | Headless service + DNS SRV  |
| Docker Swarm    | DNS round-robin             |
| Bare metal      | Static DNS or Consul        |
| Cloud (AWS/GCP) | Load balancer target groups |

---

## Open Questions

1. **Leadership mechanism:** `pg_advisory_lock` (no new dep) vs K8s init Job (cleaner, needs orchestration)? Recommend advisory lock + optional init-job override.
2. **Drift default:** `strict` vs `repair`? Recommend `strict` for Postgres multi-instance, `repair` for solo SQLite.
3. **Real-time bus:** build Redis now or ship sticky-session only and defer? Recommend sticky-session first, Redis behind flag.
4. **Load balancer:** nginx/HAProxy vs cloud LB (AWS ALB, GCP LB)? Recommend cloud LB for managed, nginx for self-hosted.
5. **Auto-scaling:** KEDA vs Prometheus + custom scaler vs cloud autoscaler? Recommend cloud autoscaler for managed, KEDA for K8s.

---

## Recommended Priority

1. Phase 1 (leadership) — unblocks safe multi-instance; highest risk if skipped.
2. Phase 2 (drift) — cheap, reuses `SchemaManifest`.
3. Phase 3 (bus) — nice-to-have; sticky sessions suffice initially.
4. Phase 4 (load balancing) — production readiness; can ship incrementally.

---

## Next Steps

1. Promote to git EPIC issue (`epic/26`).
2. Resolve Open Questions (1, 2).
3. Phase 1 spike: advisory-lock leader in `src/db/migrate.ts`.

---

## Dependencies

- Present: Kysely Migrator, `SchemaManifest` + `verify()`, `data_migrations`, SSE.
- New (optional): `ioredis` (Phase 3, behind flag) — or no dep via sticky sessions.
- New (Phase 4): Prometheus metrics exporter, health check endpoints.

## Testing Strategy

| Test        | Coverage                                       | Files                                               |
| ----------- | ---------------------------------------------- | --------------------------------------------------- |
| Unit        | Advisory-lock election, backoff                | `src/db/migrate.test.ts` (new)                      |
| Integration | 2 instances boot vs 1 PG; exactly one migrates | `tests/integration/migration-leader.test.ts` (new)  |
| Integration | Drift refuses/repairs per policy               | `src/db/schema-sync.test.ts` (extend)               |
| Integration | Load balancer routes to healthy instances      | `tests/integration/load-balancing.test.ts` (new)    |
| Integration | Graceful shutdown drains connections           | `tests/integration/graceful-shutdown.test.ts` (new) |

## References

- `src/db/migrate.ts` — Migrator runner (Phase 1 target)
- `src/db/schema-manifest.ts` — `verify()` (Phase 2)
- `src/routes/activity-stream.ts` — SSE (Phase 3)
- `src/routes/health.ts` — health endpoints (Phase 4)
- Epic 25 (Deployment Topologies) — consumes these guards
- Epic 27 (Data Integrity & ACID) — backend selection guards
- `docs/meta/plan.md` — epic registry

## Related Epics

- **Epic 25 (Deployment Topologies)** — this epic's migration-leadership / drift guards gate the multi-instance topologies D/E.
- **Epic 27 (Data Integrity & ACID)** — backend-selection guards complement this epic; sequenced together after Epic 26 (order 26 → 27 → 25).
- **Epic Testing & QA** — migration-leader + drift integration tests live under its QA umbrella.
- **Epic Headless & Alternative Frontends** — health check endpoints consumed by load balancers.

## Scope Boundary

- **IN:** migration leadership, startup schema-drift enforcement, optional cross-instance SSE bus, load balancing strategy, health checks, auto-scaling triggers, graceful shutdown.
- **OUT:** backend-selection/ACID guards (Epic 27); deploy manifests/K8s (Epic 25); SSE feature itself stays owned by `src/routes/activity-stream.ts`.

## Linked Tasks

- TASK-multi-instance-reconciliation.md
