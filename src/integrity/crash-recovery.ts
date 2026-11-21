// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unclean-shutdown detection and startup integrity gate. A sentinel file in
 * the instance dir is written at boot and removed on a clean shutdown; its
 * presence on the next boot means the previous run ended without a clean exit.
 * Detection is sentinel-based, never timestamp-based.
 *
 * This module is pure over injected fs + checker fns so tests never touch the
 * real instance dir or a live DB. The watchdog/admin layer owns the production
 * wiring.
 */
import { join, } from "node:path";
import { resolveInstanceDir, } from "../config/state-dir";
import type { Logger, } from "../logger/types";
import { safeJsonStringify, } from "../utils";
import { enterSafeMode, type IntegrityVerdict, recordVerdict, setUncleanShutdown, } from "./state";

/** Default sentinel filename, inside the per-instance state dir. */
export const SENTINEL_FILE = "integrity-running.sentinel";
/** Default quarantine filename for a copy of a failing DB (never deletes live data). */
export const QUARANTINE_FILE = "integrity-quarantine.sentinel.json";

/** Minimal fs surface used here — injectable for tests. */
export interface SentinelFs {
  exists(path: string,): boolean;
  write(path: string, data: string,): void;
  remove(path: string,): void;
  read(path: string,): string;
}

/** Result of a single integrity check. */
export interface IntegrityResult {
  verdict: IntegrityVerdict;
  detail: string;
}

/** Bounded checker: one `PRAGMA quick_check`, no loops, no retries. */
export type IntegrityChecker = () => IntegrityResult;

/** Paths the gate operates on. Injectable for tests. */
export interface IntegrityPaths {
  sentinel: string;
  quarantine: string;
}

/** Resolve the real process paths from the instance state dir. */
export function defaultIntegrityPaths(env: NodeJS.ProcessEnv = process.env,): IntegrityPaths {
  const dir = resolveInstanceDir(env,);
  return {
    sentinel: join(dir, SENTINEL_FILE,),
    quarantine: join(dir, QUARANTINE_FILE,),
  };
}

/** Detect an unclean shutdown BEFORE writing the new sentinel. */
export function detectUncleanShutdown(fs: SentinelFs, sentinelPath: string,): boolean {
  return fs.exists(sentinelPath,);
}

/** Write the boot sentinel carrying the current PID + ISO timestamp. */
export function markRunning(fs: SentinelFs, sentinelPath: string, now = new Date(),): void {
  const encoded = safeJsonStringify({ pid: process.pid, started: now.toISOString(), },);
  if (encoded.ok) {
    fs.write(sentinelPath, encoded.value,);
  }
}

/** Remove the sentinel on a clean shutdown only. */
export function clearRunning(fs: SentinelFs, sentinelPath: string,): void {
  fs.remove(sentinelPath,);
}

/**
 * Quarantine evidence: persist a verdict record before any repair is attempted.
 * Never deletes or moves live data — the DB file is left untouched.
 * @returns the written record, or null if the write failed (best-effort).
 */
export function quarantineVerdict(
  fs: SentinelFs,
  quarantinePath: string,
  result: IntegrityResult,
  now = new Date(),
): string | null {
  try {
    const encoded = safeJsonStringify({
      at: now.toISOString(),
      verdict: result.verdict,
      detail: result.detail,
    },);

    if (!encoded.ok) {
      return null;
    }

    fs.write(quarantinePath, encoded.value,);
    return encoded.value;
  } catch {
    return null;
  }
}

interface StartupGateOpts {
  fs: SentinelFs;
  paths: IntegrityPaths;
  checker: IntegrityChecker;
  logger: Logger;
  now?: Date;
}

/**
 * Boot gate. Detects an unclean shutdown, marks this run running, and — only
 * when the previous run was unclean — runs a full integrity check before the
 * caller opens traffic. A `fail` verdict enters safe mode and writes a
 * quarantine record; `pass`/`warn`/`unknown` resume normally.
 * @returns the integrity verdict when a check ran, else null.
 */
export function runStartupIntegrityGate(opts: StartupGateOpts,): IntegrityResult | null {
  const { fs, paths, checker, logger, now = new Date(), } = opts;
  const unclean = detectUncleanShutdown(fs, paths.sentinel,);
  setUncleanShutdown(unclean,);
  markRunning(fs, paths.sentinel, now,);

  if (!unclean) {
    recordVerdict({ verdict: "unknown", checkedAtMs: now.getTime(), },);
    return null;
  }

  let result: IntegrityResult;
  try {
    result = checker();
  } catch (err) {
    result = { verdict: "fail", detail: `integrity check threw: ${String(err,)}`, };
  }

  recordVerdict({ verdict: result.verdict, detail: result.detail, checkedAtMs: now.getTime(), },);
  if (result.verdict === "fail") {
    enterSafeMode("integrity check failed after unclean shutdown",);
    quarantineVerdict(fs, paths.quarantine, result, now,);
    logger.error("integrity check failed after unclean shutdown; entering safe mode", undefined, {
      module: "integrity",
      detail: result.detail,
    },);
  } else {
    logger.info("integrity check after unclean shutdown: " + result.verdict, {
      module: "integrity",
      detail: result.detail,
    },);
  }

  return result;
}
