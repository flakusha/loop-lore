import type { Kysely, } from "kysely";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync, } from "node:zlib";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import type { AsyncStoreConfig, } from "./store";

/** Node's setInterval returns `Timeout` on Node and `number` on Bun — name it. */
type IntervalHandle = ReturnType<typeof setInterval>;

/**
 * Root directory for spilled bodies. Lives under the repo's `.tmp/` to keep
 *  per-AGENTS.md scratch discipline and avoid stray repo-root files.
 */
export const OFFLOAD_DIR = path.resolve(".tmp", "async-store",);

/** */
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

/** */
export interface DaState {
  rowCount: number;
  lastWriteAt: number;
  eventLoopLagMs: number;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MIN_AGE_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Lazy default — pulled from `AsyncStoreConfig` defaults to keep parity.
 * @param override
 * @param fallback
 */
function getMaxInlineBytes(override: number | undefined, fallback: AsyncStoreConfig,): number {
  if (override !== undefined) { return override; }
  return fallback.maxInlineBytes ?? 1024 * 1024;
}

/**
 * Start the offload daemon. Returns a handle exposing `stop()` + `runOnce()`.
 * @param database
 * @param asyncStoreConfig
 * @param config
 */
export function startOffloadDaemon(
  database: Kysely<DB>,
  asyncStoreConfig: AsyncStoreConfig,
  config: OffloadDaemonConfig = {},
): OffloadDaemon {
  const log = getLogger().child({ module: "async-offload", },);
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const minAgeMs = config.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const maxInlineBytes = getMaxInlineBytes(config.maxInlineBytes, asyncStoreConfig,);

  mkdirSync(OFFLOAD_DIR, { recursive: true, },);

  let timer: IntervalHandle | null = null;
  let running = false;
  let stopping = false;

  const state: DaState = { rowCount: 0, lastWriteAt: Date.now(), eventLoopLagMs: 0, };

  /** */
  async function runOnce(): Promise<{ offloaded: number; expired: number }> {
    if (running) { return { offloaded: 0, expired: 0, }; }
    running = true;
    let offloaded = 0;
    let expired = 0;
    try {
      const now = Date.now();
      const minAgeCutoff = new Date(now - minAgeMs,).toISOString();
      const ttlCutoff = new Date(now - ttlMs,).toISOString();

      // Offload ripe completed rows.
      const ripe = await database
        .selectFrom("request_results",)
        .select(["id", "response_body", "completed_at",],)
        .where("status", "=", "complete",)
        .where("completed_at", "<=", minAgeCutoff,)
        .where("offloaded_at", "is", null,)
        .execute();
      for (const row of ripe) {
        if (row.response_body === null) { continue; }
        if (row.response_body.length <= maxInlineBytes) { continue; }
        try {
          const spillPath = await spill(row.id, row.response_body,);
          await database
            .updateTable("request_results",)
            .set({ offloaded_at: new Date(now,).toISOString(), offload_path: spillPath, response_body: null, },)
            .where("id", "=", row.id,)
            .execute();
          offloaded++;
        } catch (error) {
          log.error("offload spill failed", undefined, { id: row.id, error: String(error,), },);
        }
      }

      // Mark expired rows.
      const expiredResult = await database
        .updateTable("request_results",)
        .set({ status: "expired", response_body: null, },)
        .where("status", "in", ["complete", "failed",],)
        .where("completed_at", "<=", ttlCutoff,)
        .execute();
      expired = Number(expiredResult[0]?.numUpdatedRows ?? 0,);

      // Best-effort cleanup of spill files for rows that have been expired
      // past an extra TTL window. We only delete files we can map back to
      // an `expired` row that has been around for at least 2× ttl.
      const oldCutoff = new Date(now - 2 * ttlMs,).toISOString();
      const expiredOld = await database
        .selectFrom("request_results",)
        .select(["id", "offload_path",],)
        .where("status", "=", "expired",)
        .where("completed_at", "<=", oldCutoff,)
        .where("offload_path", "is not", null,)
        .execute();
      for (const row of expiredOld) {
        if (row.offload_path === null) { continue; }
        try {
          unlinkSync(row.offload_path,);
        } catch { /* already gone */ }
        await database
          .updateTable("request_results",)
          .set({ offload_path: null, },)
          .where("id", "=", row.id,)
          .execute();
      }
    } finally {
      running = false;
      state.lastWriteAt = Date.now();
    }
    return { offloaded, expired, };
  }

  return {
    start(): void {
      if (timer !== null) { return; }
      timer = setInterval(() => {
        if (stopping) { return; }
        void runOnce().catch((error: unknown,) => {
          log.error("offload daemon tick failed", undefined, { error: String(error,), },);
        },);
      }, intervalMs,);
      log.info("offload daemon started", { intervalMs, ttlMs, maxInlineBytes, },);
    },
    stop(): void {
      stopping = true;
      if (timer !== null) {
        clearInterval(timer,);
        timer = null;
      }
      log.info("offload daemon stopped",);
    },
    runOnce,
    state,
  };
}

/** */
export interface OffloadDaemon {
  start(): void;
  stop(): void;
  runOnce(): Promise<{ offloaded: number; expired: number }>;
  readonly state: DaState;
}

/**
 * Compress + write a body to disk under OFFLOAD_DIR.
 * @param id
 * @param body
 */
async function spill(id: string, body: string,): Promise<string> {
  const filePath = path.join(OFFLOAD_DIR, `${id}.json.gz`,);
  const compressed = gzipSync(Buffer.from(body, "utf8",),);
  writeFileSync(filePath, compressed,);
  return filePath;
}

/**
 * Read a body back from disk (used by the status endpoint).
 * @param filePath
 */
export function readOffloadedBody(filePath: string,): string | null {
  try {
    if (!existsSync(filePath,)) { return null; }
    const compressed = readFileSync(filePath,);
    return gunzipSync(compressed,).toString("utf8",);
  } catch {
    return null;
  }
}

/**
 * Test seam: report whether a spill file exists for a given id.
 * @param id
 */
export function offloadExists(id: string,): boolean {
  return existsSync(path.join(OFFLOAD_DIR, `${id}.json.gz`,),);
}

/** Test seam: total bytes under OFFLOAD_DIR. */
export function offloadDiskBytes(): number {
  if (!existsSync(OFFLOAD_DIR,)) { return 0; }
  // Bun's `Glob` is overkill; a flat scan is fine for the `.tmp/async-store/`
  // directory (only `*.json.gz` files; no recursion).
  let total = 0;
  for (const name of readdirSync(OFFLOAD_DIR,)) {
    if (!name.endsWith(".json.gz",)) { continue; }
    try {
      total += statSync(path.join(OFFLOAD_DIR, name,),).size;
    } catch { /* raced with another writer */ }
  }
  return total;
}
