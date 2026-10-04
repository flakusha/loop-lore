// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { mkdirSync, } from "node:fs";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { runOffloadPass, } from "./offload-pass";
import { offloadDir, } from "./spill";
import type { AsyncStoreConfig, } from "./store";

export type { OffloadPassOpts, } from "./offload-pass";
export { runOffloadPass, } from "./offload-pass";
export {
  offloadDir,
  offloadDiskBytes,
  offloadExists,
  readOffloadedBody,
  resetOffloadDir,
  setOffloadDir,
  spill,
  SPILL_ROOT,
  spillFileStem,
  spillRootDir,
} from "./spill";
export { pruneOrphanSpills, } from "./spill-retention";

/** Node's setInterval returns `Timeout` on Node and `number` on Bun — name it. */
type IntervalHandle = ReturnType<typeof setInterval>;

export interface OffloadDaemonConfig {
  /** Scan interval when cron trigger is active. */
  intervalMs?: number;
  /** Min age of a completed row before offload eligibility (default 5 min). */
  minAgeMs?: number;
  /** Spill rows whose `response_body` length exceeds this (default 1 MiB). */
  maxInlineBytes?: number;
  /** TTL for `complete`/`failed` rows before they're marked `expired`. */
  ttlMs?: number;
  /** Custom trigger evaluator. Default = cron-only. */
  shouldRun?: (state: DaState,) => boolean | Promise<boolean>;
}

export interface DaState {
  rowCount: number;
  lastWriteAt: number;
  eventLoopLagMs: number;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MIN_AGE_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Lazy default — pulled from `AsyncStoreConfig` defaults to keep parity.
function getMaxInlineBytes(override: number | undefined, fallback: AsyncStoreConfig,): number {
  if (override !== undefined) { return override; }
  return fallback.maxInlineBytes ?? 1024 * 1024;
}

/** Offload daemon handle — owns the timer, the re-entrancy guard, and the live {@link DaState}. */
export class OffloadDaemon {
  private readonly log = getLogger().child({ module: "async-offload", },);
  private timer: IntervalHandle | null = null;
  private running = false;
  private stopping = false;
  private readonly intervalMs: number;
  private readonly minAgeMs: number;
  private readonly ttlMs: number;
  private readonly maxInlineBytes: number;
  readonly state: DaState;

  constructor(
    private database: Kysely<DB>,
    asyncStoreConfig: AsyncStoreConfig,
    config: OffloadDaemonConfig = {},
  ) {
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.minAgeMs = config.minAgeMs ?? DEFAULT_MIN_AGE_MS;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.maxInlineBytes = getMaxInlineBytes(config.maxInlineBytes, asyncStoreConfig,);
    this.state = { rowCount: 0, lastWriteAt: Date.now(), eventLoopLagMs: 0, };
    mkdirSync(offloadDir(), { recursive: true, },);
  }

  /** Start the interval timer. No-op when already started. */
  start(): void {
    if (this.timer !== null) { return; }
    this.timer = setInterval(() => {
      if (this.stopping) { return; }
      void this.runOnce().catch((error: unknown,) => {
        this.log.error("offload daemon tick failed", undefined, { error: String(error,), },);
      },);
    }, this.intervalMs,);

    this.log.info("offload daemon started", {
      intervalMs: this.intervalMs,
      ttlMs: this.ttlMs,
      maxInlineBytes: this.maxInlineBytes,
    },);
  }

  /** Stop the interval timer. Idempotent. */
  stop(): void {
    this.stopping = true;
    if (this.timer !== null) {
      clearInterval(this.timer,);
      this.timer = null;
    }

    this.log.info("offload daemon stopped",);
  }

  /**
   * Run a single offload pass (re-entrancy guarded; returns zeros if already running).
   * @returns counts `{ offloaded, expired, pruned }` for this pass.
   */
  async runOnce(): Promise<{ offloaded: number; expired: number; pruned: number }> {
    if (this.running) { return { offloaded: 0, expired: 0, pruned: 0, }; }
    this.running = true;
    try {
      return await runOffloadPass(this.database, {
        minAgeMs: this.minAgeMs,
        ttlMs: this.ttlMs,
        maxInlineBytes: this.maxInlineBytes,
      },);
    } finally {
      this.running = false;
      this.state.lastWriteAt = Date.now();
    }
  }
}

/**
 * Start the offload daemon. Returns a handle exposing `start()`, `stop()`
 * and `runOnce()`.
 * @param database - Kysely handle
 * @param asyncStoreConfig - default config (used for `maxInlineBytes` fallback)
 * @param config - daemon-specific config (intervals, TTL override)
 * @returns `OffloadDaemon` handle.
 */
export function startOffloadDaemon(
  database: Kysely<DB>,
  asyncStoreConfig: AsyncStoreConfig,
  config: OffloadDaemonConfig = {},
): OffloadDaemon {
  return new OffloadDaemon(database, asyncStoreConfig, config,);
}
