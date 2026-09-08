// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/observability.ts — observability section defaults
import type { ObservabilityConfig, } from "../schema";

export const OBSERVABILITY_DEFAULTS = {
  health: {
    liveness: false,
    readiness: false,
  },
  metrics: {
    enabled: false,
  },
} satisfies ObservabilityConfig;
