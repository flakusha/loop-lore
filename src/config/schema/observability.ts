// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/observability.ts — Observability (health/metrics) config types

/** Liveness/readiness probe opt-in. */
export interface ObservabilityHealthConfig {
  /** Enable the liveness probe (`/health/live`). Default false. */
  liveness: boolean;
  /** Enable the readiness probe (`/health/ready`). Default false. */
  readiness: boolean;
}

/** Prometheus scrape opt-in. */
export interface ObservabilityMetricsConfig {
  /** Enable the Prometheus text-format `/metrics` endpoint. Default false. */
  enabled: boolean;
}

/** */
export interface ObservabilityConfig {
  health: ObservabilityHealthConfig;
  metrics: ObservabilityMetricsConfig;
}
