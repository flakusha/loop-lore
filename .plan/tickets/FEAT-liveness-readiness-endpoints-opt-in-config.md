<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Liveness and readiness endpoints (opt-in by config)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-telemetry.md
**Related:** TASK-prometheus-metrics-endpoint-opt-in, TASK-observability-config-section

## Summary

Add `/health/live` (liveness) and `/health/ready` (readiness) endpoints alongside the
existing `/api/health`, gated behind an opt-in config flag so they are disabled by
default and only exposed when an operator enables observability.

## Context

Today `GET /api/health` (`src/routes/health.ts`) returns provider connectivity +
uptime + timestamp, but there is no distinction between "process is up" (liveness)
and "process is ready to serve" (readiness), and no per-endpoint opt-in. Load
balancers and orchestrators (k8s, systemd, reverse proxies) expect these as
separate cheap probes with no dependency on provider health.

## Direction

1. Liveness `/health/live`: returns 200 as long as the HTTP server accepts the
   request; never inspects the DB or providers. Always cheap, no auth.
2. Readiness `/health/ready`: returns 200 only when the DB responds and required
   subsystems (config loaded, migrations applied) are initialized; 503 otherwise
   with a machine-readable reason.
3. Both endpoints off by default. A new observability config section gates them
   (`observability.health.enabled`), so an operator opts in explicitly. When
   disabled, the routes are not mounted (not just hidden behind 404).

## Acceptance Criteria

- [ ] `/health/live` returns 200 without touching DB/providers when enabled.
- [ ] `/health/ready` returns 200 when DB is reachable, 503 + reason when not.
- [ ] Both are absent (unmounted) when the opt-in flag is false (default).
- [ ] Existing `/api/health` behavior unchanged.
- [ ] Tests cover enabled/disabled and ready/live happy + failure paths.
- [ ] `bun run check` green.
