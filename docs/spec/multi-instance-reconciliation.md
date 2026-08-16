<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Multi-Instance Reconciliation Specification

> ⚠️ **Status:** DRAFT — expanded from epic. Authoritative source is `src/` and AGENTS.md.

## Overview

Specification for safe multi-instance database operations: migration leadership,
schema-drift detection, cross-instance real-time sync, and load-balancer integration.
See `.plan/epics/epic-multi-instance-reconciliation.md` for the full epic with phases,
tasks, and testing strategy.

## Scope

### IN

- Migration leadership (exactly one migrator per boot).
- Startup schema-drift enforcement (`SchemaManifest.verify()`).
- Optional Redis pub/sub for SSE activity broadcast.
- Load-balancing strategy, health checks, graceful shutdown, auto-scaling triggers.

### OUT

- Backend-selection/ACID guards (Epic 27 — Data Integrity).
- Deploy manifests/K8s (Epic 25 — Deployment Topologies).
- SSE feature itself (owned by `src/routes/activity-stream.ts`).

## Current State

| Area                   | File(s)                              | State | Notes                                                                           |
| ---------------------- | ------------------------------------ | ----- | ------------------------------------------------------------------------------- |
| Kysely Migrator runner | `src/db/migrate.ts`                  | ✅    | Runs on **every** boot. **No leader election** — N replicas race.               |
| Schema manifest        | `src/db/schema-manifest.ts`          | ✅    | `verify()` diffs declared vs actual schema. **Test-only** — not run at startup. |
| Data transforms        | `data_migrations` table              | ✅    | Tracks `from_version → to_version` rewrites, separate from DDL.                 |
| Session state          | `src/db/schema-core.ts` (`sessions`) | ✅    | Persisted in DB — instances stateless, scalable in principle.                   |
| Real-time (SSE)        | `src/routes/activity-stream.ts`      | ✅    | **Per-process** — clients on other replicas don't get events.                   |
| Advisory lock / leader | —                                    | ❌    | No `pg_advisory_lock`, no wait-for-ready.                                       |
| Startup drift check    | —                                    | ❌    | `SchemaManifest.verify()` not invoked at boot.                                  |
| Load balancer config   | —                                    | ❌    | No routing strategy, no health checks, no instance discovery.                   |
| Auto-scaling           | —                                    | ❌    | No scaling triggers, no metrics-based scaling.                                  |

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

| Task                                                                | Files                                          | Effort |
| ------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| Run `SchemaManifest.verify()` at startup on every instance          | `src/db/schema-manifest.ts`, `src/db/index.ts` | Low    |
| Policy `strict` (refuse serve) vs `repair` (solo/SQLite auto-apply) | `src/config/sections/database.ts`              | Med    |
| Structured log + `/health/schema` reporting drift state             | `src/routes/health.ts`, `src/logger/*`         | Med    |
| Unit + integration tests against deliberately broken schema         | `src/db/schema-sync.test.ts` (extend)          | Med    |

### Phase 3 — Cross-Instance Real-Time

**Goal:** SSE activity reaches clients on any replica.

| Task                                                                   | Files                           | Effort |
| ---------------------------------------------------------------------- | ------------------------------- | ------ |
| Optional Redis pub/sub behind `REALTIME_BUS=redis`                     | `src/routes/activity-stream.ts` | Med    |
| Sticky-session fallback documented (`ip_hash`) for `REALTIME_BUS=none` | `docs/guide/deployment.md`      | Low    |
| Per-process SSE retained when bus absent (backward compatible)         | `src/routes/activity-stream.ts` | Low    |

### Phase 4 — Load Balancing & Horizontal Scaling

**Goal:** Production-grade multi-instance deployment with intelligent routing, health checks, and auto-scaling.

| Task                                                               | Files                                            | Effort |
| ------------------------------------------------------------------ | ------------------------------------------------ | ------ |
| Define routing strategies (round-robin, least-conn)                | `docs/guide/load-balancing.md` (new)             | Low    |
| Session affinity strategy (sticky sessions for SSE, JWT stateless) | `docs/guide/load-balancing.md`                   | Low    |
| Health check endpoints (`/health/live`, `/health/ready`)           | `src/routes/health.ts` (extend)                  | Low    |
| Instance discovery via DNS SRV or Kubernetes headless service      | `docs/guide/deployment.md`                       | Med    |
| Graceful shutdown with connection draining                         | `src/server.ts`                                  | Med    |
| Graceful rolling upgrade with readiness gate                       | `docs/guide/deployment.md`                       | Med    |
| Auto-scaling triggers (CPU, memory, latency, SSE connections)      | `docs/guide/deployment.md`, `src/metrics/*`      | High   |
| Load testing for multi-instance (10k+ concurrent sessions)         | `tests/integration/multi-instance.test.ts` (new) | High   |
| Blue-green deployment strategy                                     | `docs/guide/deployment.md`                       | Med    |

## Configuration

```typescript
// src/config/sections/database.ts
interface DatabaseConfig {
  driftPolicy: "strict" | "repair";
  enableLeaderElection: boolean; // Phase 1
  realtimeBus: "redis" | "none"; // Phase 3
}
```

## Health Check Endpoints

```typescript
// src/routes/health.ts
GET /health/live   → 200 OK (process running)
GET /health/ready  → 200 OK (schema verified, DB connected)
GET /health/schema → 200 OK + drift report (Phase 2)
GET /health/metrics→ Prometheus metrics (Phase 4)
```

## Open Questions

1. **Leadership mechanism:** `pg_advisory_lock` vs K8s init Job? Recommend advisory lock + optional init-job override.
2. **Drift default:** `strict` vs `repair`? Recommend `strict` for Postgres multi-instance, `repair` for solo SQLite.
3. **Real-time bus:** build Redis now or ship sticky-session only? Recommend sticky-session first, Redis behind flag.
4. **Load balancer:** nginx/HAProxy vs cloud LB? Recommend cloud LB for managed, nginx for self-hosted.

## Recommended Priority

1. Phase 1 (leadership) — unblocks safe multi-instance; highest risk if skipped.
2. Phase 2 (drift) — cheap, reuses `SchemaManifest`.
3. Phase 3 (bus) — nice-to-have; sticky sessions suffice initially.
4. Phase 4 (load balancing) — production readiness; can ship incrementally.

## Integration Points

- `src/db/migrate.ts` — Migrator runner (Phase 1)
- `src/db/schema-manifest.ts` — `verify()` (Phase 2)
- `src/routes/activity-stream.ts` — SSE (Phase 3)
- `src/routes/health.ts` — health endpoints (Phase 4)
- Epic 25 (Deployment Topologies) — consumes these guards
- Epic 27 (Data Integrity & ACID) — backend-selection guards

## Related Epics

- `.plan/epics/epic-multi-instance-reconciliation.md`
- `.plan/epics/epic-deployment-topologies.md` (Epic 25)
- `.plan/epics/epic-data-integrity-acid.md` (Epic 27)
