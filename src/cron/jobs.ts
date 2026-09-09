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
      name: "federation.gossip",
      schedule: "* * * * *",
      enabled: true,
      run: async ({ config, logger, },) => {
        if (!config.federation.enabled) { return { skipped: "federation.disabled", }; }
        const { getGossipService, publicOriginOf, } = await import("../federation/gossip");
        const trusted = config.federation.peers.map((peer,) => peer.origin);
        const trustByOrigin: Record<string, import("../config/schema").FederationPeerTrustConfig | undefined> = {};
        for (const peer of config.federation.peers) {
          trustByOrigin[peer.origin] = peer.trust;
        }
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
        const trustByOrigin: Record<string, import("../config/schema").FederationPeerTrustConfig | undefined> = {};
        for (const peer of config.federation.peers) {
          trustByOrigin[peer.origin] = peer.trust;
        }
        const summary = await runResyncPass(database, { trustByOrigin, },);
        const expired = await sweepExpiredReservations(database,);
        logger.info("federation resync pass complete", { module: "cron", ...summary, expired, },);
        return { ...summary, expired, };
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
