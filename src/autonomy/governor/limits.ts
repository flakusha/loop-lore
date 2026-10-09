// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/limits.ts — limit catalog + budget-trip telemetry event
//
// Split from ./index.ts to stay under the 250-line size gate. The catalog
// is the single source of truth for window lengths; per-scope caps resolve
// at runtime via ./caps.ts. Re-exported through ./index.ts so the public
// surface (and the `autonomy` barrel) is unchanged. A new named limit also
// needs a GovernorLimitName union member and a window derivation in ./window.ts.

import type { GovernorLimitCatalog, } from "./types";

/** Fixed catalog of limit definitions. Per-scope caps come from the
 *  resolved `AutonomyConfig` at runtime.
 */
export const LIMIT_CATALOG: GovernorLimitCatalog = {
  per_tick_action: { windowMs: 60_000, cap: null, },
  per_minute_generation: { windowMs: 60_000, cap: null, },
  per_hour_beat_dispatch: { windowMs: 3_600_000, cap: null, },
} as const;

/** Telemetry event type emitted on every cap trip. */
export const TELEMETRY_EVENT_TRIPPED = "governor.budget.exceeded";
