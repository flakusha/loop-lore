// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/cron.ts — Cron scheduler config section

import type { CronJobOverride, } from "../schema";

export const CRON_DEFAULTS = {
  enabled: true,
  jobs: {},
};

/** */
export class CronSection {
  enabled = CRON_DEFAULTS.enabled;
  jobs: Record<string, CronJobOverride> = CRON_DEFAULTS.jobs;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<CronSection>,) {
    Object.assign(this, overrides,);
  }
}

export type CronConfig = CronSection;

export const cronMeta = {
  type: "object" as const,
  description: "Internal scheduled tasks (Bun.cron registry)",
  properties: {
    enabled: {
      type: "boolean",
      default: CRON_DEFAULTS.enabled,
      description: "Master switch for all scheduled jobs",
    },
    jobs: {
      type: "object",
      description: "Per-job overrides keyed by job name",
      additionalProperties: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "Enable this job", },
          schedule: { type: "string", description: "Cron expression override", },
        },
      },
    },
  },
  required: ["enabled",] as const,
};
