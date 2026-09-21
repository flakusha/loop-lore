<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Multi-Instance Reconciliation Specification

> **Status:** Draft — planned; the epic carries the full implementation plan (phases, tasks, testing strategy). This spec is a compressed summary + pointer. Authoritative source: `src/`.

## Summary

- Safe multi-instance DB operations: migration leadership, startup schema-drift enforcement, cross-instance real-time, load-balancer integration.
- Current gaps: migrator runs on every boot with no leader election (`src/db/migrate.ts`); `SchemaManifest.verify()` is test-only, never invoked at startup (`src/db/schema-manifest.ts`); SSE is per-process (`src/routes/activity-stream.ts`); no LB routing, health checks, or auto-scaling. Sessions persist in DB (`src/db/schema-core.ts`), so instances are stateless in principle.
- IN scope: advisory-lock leader + wait-for-ready; startup drift verify with `strict`/`repair` policy + `/health/schema`; optional Redis pub/sub behind `REALTIME_BUS=redis` (sticky-session fallback); routing strategies, `/health/live|ready`, graceful shutdown, auto-scaling triggers.
- OUT of scope: backend-selection/ACID guards (Epic 27), deploy manifests/K8s (Epic 25), SSE feature ownership.
- Phases: 1 migration leadership → 2 drift detection → 3 cross-instance real-time (optional) → 4 load balancing & scaling (incremental).
- Open questions + recommended priority live in the epic (advisory lock over init-job; `strict` for Postgres multi-instance, `repair` for solo SQLite; sticky sessions before Redis).

## Epics

- `.plan/epics/epic-multi-instance-reconciliation.md` — canonical plan.
- `.plan/epics/epic-deployment-topologies.md` (Epic 25); `.plan/epics/epic-data-integrity-acid.md` (Epic 27).
