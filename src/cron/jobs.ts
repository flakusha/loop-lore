// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/cron/jobs.ts — Built-in job catalog for the cron scheduler.
//
// Each job is a thin body over an existing service entry point; timing and
// lifecycle belong to the registry. Bodies stay import-lazy (dynamic import)
// so loading the catalog never pulls heavy service graphs eagerly.

import { defineJob, } from "./registry";
import type { CronJobDef, } from "./types";

/**
 * The default job set wired by `startScheduler` when no explicit list is
 * given. Cadences mirror the ad-hoc timers they replace.
 */
export function defaultJobs(): CronJobDef[] {
  return [
    defineJob({
      name: "telemetry.retention",
      schedule: "0 3 * * *",
      enabled: true,
      run: async ({ database, },) => {
        const { runRetentionCleanup, } = await import("../telemetry/cleanup");
        await runRetentionCleanup(database,);
      },
    },),
    defineJob({
      name: "async.offload",
      schedule: "*/5 * * * *",
      enabled: true,
      run: async ({ database, },) => {
        const { runOffloadPass, } = await import("../async/offload");
        const { createAsyncStore, } = await import("../async/store");
        const store = createAsyncStore(database,);
        return runOffloadPass(database, {
          minAgeMs: 5 * 60 * 1000,
          ttlMs: 24 * 60 * 60 * 1000,
          maxInlineBytes: store.config.maxInlineBytes,
        },);
      },
    },),
    defineJob({
      name: "crypto.key-rotation-check",
      schedule: "0 4 * * *",
      enabled: true,
      run: async ({ database, config, logger, },) => {
        const rotationDays = config.encryption.keyRotationDays ?? 0;
        if (rotationDays <= 0) { return { skipped: "keyRotationDays = 0", }; }
        const { runAutoRotation, } = await import("../crypto/key-rotation");
        const summary = await runAutoRotation(database, rotationDays,);
        logger.info("key rotation check complete", { module: "cron", summary, },);
        return summary;
      },
    },),
    defineJob({
      name: "memory.decay",
      schedule: "@hourly",
      enabled: true,
      run: async ({ database, logger, },) => {
        const { applyDecay, } = await import("../memory/purge");
        const affected = await applyDecay(database,);
        logger.info("memory decay complete", { module: "cron", affected, },);
        return { affected, };
      },
    },),
    defineJob({
      name: "memory.purge",
      schedule: "0 5 * * *",
      enabled: true,
      run: async ({ database, logger, },) => {
        // Soft-mark only; hard delete stays an explicit config opt-in.
        const { purgeStaleMemories, } = await import("../memory/purge");
        const result = await purgeStaleMemories(database,);
        logger.info("memory purge complete", { module: "cron", ...result, },);
        return result;
      },
    },),
    defineJob({
      name: "providers.health-rescan",
      schedule: "*/15 * * * *",
      enabled: true,
      run: async ({ database, logger, },) => {
        const { scanAllProviders, } = await import("../admin/provider-health");
        const results = await scanAllProviders(database,);
        const failed = results.filter((r,) => r.status !== "healthy").map((r,) => r.name);
        if (failed.length > 0) {
          logger.warn("providers unreachable on rescan", { module: "cron", failed, },);
        }
        return { checked: results.length, failed, };
      },
    },),
  ];
}
