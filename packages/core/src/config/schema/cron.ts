// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/cron.ts — Cron scheduler config type

import type { CronSection, } from "../sections/cron";

/** Per-job override keyed by job name (e.g. "telemetry.retention"). */
export interface CronJobOverride {
  enabled?: boolean;
  /** 5-field POSIX cron expression or nickname; validated at startup. */
  schedule?: string;
}

export type CronConfig = InstanceType<typeof CronSection>;
