// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/cron/jobs.ts — Built-in job catalog for the cron scheduler.
//
// Each job is a thin body over an existing service entry point; timing and
// lifecycle belong to the registry. Bodies stay import-lazy (dynamic import)
// so loading the catalog never pulls heavy service graphs eagerly.

import type { Config, } from "../config/schema";
import { defineJob, } from "./registry";
import type { CronJobDef, } from "./types";

/**
 * Per-origin TLS trust overrides, shared by the gossip, resync, and outbox
 * jobs — each hands the same map to its federation service entry point.
 * @param config
 * @returns Trust overrides keyed by peer origin.
 */
function trustByOriginOf(config: Config,): Record<string, Config["federation"]["peers"][number]["trust"]> {
  const trustByOrigin: Record<string, Config["federation"]["peers"][number]["trust"]> = {};
  for (const peer of config.federation.peers) {
    trustByOrigin[peer.origin] = peer.trust;
  }

  return trustByOrigin;
}

/**
 * The default job set wired by `startScheduler` when no explicit list is
 * given. Cadences mirror the ad-hoc timers they replace.
 * @returns CronJobDef[]
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
      name: "chat.archive-expiration",
      schedule: "0 3 * * *",
      enabled: true,
      run: async ({ database, logger, },) => {
        const { runArchiveExpirationGc, } = await import("../gc/archive-expiration");
        const summary = await runArchiveExpirationGc(database, { logger, },);
        logger.info("archive gc complete", { module: "cron", ...summary, },);
        return summary;
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
      name: "federation.gossip",
      schedule: "* * * * *",
      enabled: true,
      run: async ({ config, logger, },) => {
        if (!config.federation.enabled) { return { skipped: "federation.disabled", }; }
        const { getGossipService, publicOriginOf, } = await import("../federation/gossip");
        const trusted = config.federation.peers.map((peer,) => peer.origin);
        const trustByOrigin = trustByOriginOf(config,);

        const service = getGossipService({
          seeds: config.federation.seeds,
          trusted,
          trustByOrigin,
          selfOrigin: publicOriginOf(config.server,),
        },);

        service.start();
        const summary = await service.pollOnce();
        logger.info("federation gossip poll complete", { module: "cron", ...summary, },);
        return summary;
      },
    },),
    defineJob({
      name: "federation.resync",
      schedule: "@hourly",
      enabled: true,
      // Lazy like the gossip body above: keeps coordinator out of the import graph until the job fires.
      run: async ({ config, database, logger, },) => {
        if (!config.federation.enabled) { return { skipped: "federation.disabled", }; }
        const { runResyncPass, } = await import("../federation/coordinator");
        const { sweepExpiredReservations, } = await import("../federation/sharing");

        const summary = await runResyncPass(database, { trustByOrigin: trustByOriginOf(config,), },);
        const expired = await sweepExpiredReservations(database,);
        logger.info("federation resync pass complete", { module: "cron", ...summary, expired, },);
        return { ...summary, expired, };
      },
    },),
    defineJob({
      name: "federation.outbox-drain",
      schedule: "*/2 * * * *",
      enabled: true,
      run: async ({ config, database, logger, },) => {
        if (!config.federation.enabled) { return { skipped: "federation.disabled", }; }
        const { runMeshOutboxPass, } = await import("../federation/outbox");

        const summary = await runMeshOutboxPass(database, { trustByOrigin: trustByOriginOf(config,), },);
        logger.info("federation outbox drain complete", { module: "cron", ...summary, },);
        return summary;
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
    defineJob({
      name: "autonomy.world-tick",
      // Every minute. Per-world cadence is NOT set here: the scheduler
      // reads each world's resolved `tickIntervalMs` and skips any world
      // whose `next_tick_at` cursor has not arrived. This job only pumps
      // the due-set selection.
      schedule: "* * * * *",
      enabled: true,
      run: async ({ database, logger, },) => {
        const { AutonomyScheduler, } = await import("../autonomy/scheduler");
        const result = await new AutonomyScheduler(database,).tickOnce();
        if (result.dueWorldIds.length > 0) {
          logger.info("autonomy world tick complete", { module: "cron", ...result, },);
        }

        return result;
      },
    },),
    defineJob({
      name: "locations.tick",
      schedule: "*/2 * * * *",
      enabled: true,
      run: async ({ database, logger, },) => {
        const { TravelTickEngine, } = await import("../locations/travel-engine");
        const engine = new TravelTickEngine(database,);
        const summary = await engine.tick({ elapsedSeconds: 120, },);
        logger.info("travel tick complete", { module: "cron", ...summary, },);
        return summary;
      },
    },),
    defineJob({
      name: "chat.scheduled",
      // Every minute so a due message lands inside the ticket's 1min window.
      schedule: "* * * * *",
      enabled: true,
      run: async ({ database, config, logger, },) => {
        const { dispatchDue, } = await import("../chat/scheduled");
        return dispatchDue(database, config, { logger, },);
      },
    },),
    defineJob({
      name: "nsfw.status-sweep",
      schedule: "*/15 * * * *",
      enabled: true,
      run: async ({ database, logger, },) => {
        const { sweepExpiredEffects, } = await import("../rpg/status-effects");
        const deleted = await sweepExpiredEffects(database,);
        logger.info("nsfw status sweep complete", { module: "cron", deleted, },);
        return { deleted, };
      },
    },),
  ];
}
