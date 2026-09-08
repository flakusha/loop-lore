<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Observability config section (health/metrics opt-in)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-telemetry.md
**Related:** FEAT-liveness-readiness-endpoints-opt-in-config, TASK-prometheus-metrics-endpoint-opt-in

## Summary

Add an `observability` config section that gates the liveness/readiness and metrics
endpoints, following the existing config section pattern (schema + section class +
meta + defaults + barrel export).

## Context

No config key today covers observability exposure (`health`/`prometheus`/`metrics`
return zero matches under `src/config`). The liveness/readiness and Prometheus
tickets need a shared opt-in surface before they can mount conditionally.

## Direction

1. New `src/config/schema/observability.ts` — `ObservabilityConfig` with
   `health: { enabled: boolean; readinessEnabled: boolean }` and
   `metrics: { enabled: boolean }` (all default `false`).
2. New `src/config/sections/observability.ts` — `ObservabilitySection`,
   `OBSERVABILITY_DEFAULTS`, `observabilityMeta`, matching the existing
   schema/section/meta triple pattern (see `src/config/sections/server.ts`).
3. Export from `src/config/sections/index.ts`; register in the config
   orchestrator (env map, JSON schema) so `observability.*` keys load.
4. Keep all endpoints off by default — opt-in is the security default.

## Acceptance Criteria

- [ ] `ObservabilityConfig` + section + defaults + meta added and barrel-exported.
- [ ] Config orchestrator picks up the new section (env + jsonSchema).
- [ ] Defaults all `false`; setting them true is the only way to enable endpoints.
- [ ] Config load tests cover the new section (defaults + override).
- [ ] `bun run check` green.
