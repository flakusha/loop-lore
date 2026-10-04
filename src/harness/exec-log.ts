// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log — append-only writer for `<repo-root>/.harness/executions.jsonl`.
 *
 * One compact JSON object per line, snake_case wire names, so the file greps
 * and `jq`s like the agent ledger (`.ledger.jsonl`) and needs no reader to be
 * useful. No rotation: the log is a failure-mining feed, and pruning it would
 * delete exactly the old failures RSI wants.
 *
 * Every write is best-effort. A run must never fail because its log line did
 * not land, so failures are swallowed after one warn per process.
 */
import { appendFileSync, mkdirSync, } from "node:fs";
import { dirname, } from "node:path";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils/safe-json";
import { runGit, } from "./run-context";
import { type HarnessRunRecord, serializeRun, } from "./types";

/** Directory (relative to the repo root) holding the JSONL log. */
export const HARNESS_DIR = ".harness";

/** Log filename inside {@link HARNESS_DIR}. */
export const HARNESS_LOG_FILENAME = "executions.jsonl";

/** Set once the first write fails; after that the log stays quiet. */
let warned = false;

/** Memoized log path — the repo root does not move mid-process. */
let logPath: string | null = null;

/**
 * Absolute path of the exec log, or null when the repo root cannot be found.
 * @returns The JSONL path, or null outside a checkout.
 */
export function getExecLogPath(): string | null {
  if (logPath !== null) { return logPath === "" ? null : logPath; }
  try {
    const root = runGit(["rev-parse", "--show-toplevel",],);
    logPath = root === "" ? "" : `${root}/${HARNESS_DIR}/${HARNESS_LOG_FILENAME}`;
  } catch {
    logPath = "";
  }
  return logPath === "" ? null : logPath;
}

/**
 * Override the resolved log path. Test-only seam: lets the read side run
 * against a fixture file instead of the live worktree log.
 * @param path - Absolute path, or null to force the no-log case.
 */
export function setExecLogPath(path: string | null,): void {
  // `null` maps to the memoized-empty sentinel, NOT to "unmemoized" — a null
  // here must force "no log", never fall through to git resolution.
  logPath = path ?? "";
}

/** Reset the memoized path. Test-only seam. */
export function resetExecLogPath(): void {
  logPath = null;
  warned = false;
}

/**
 * Append one run record. Never throws, never blocks the caller's result.
 *
 * @param record - the run to log
 * @returns nothing; a write failure is logged once and swallowed
 */
export function appendExecLog(record: HarnessRunRecord,): void {
  const path = getExecLogPath();
  if (path === null) { return; }
  try {
    mkdirSync(dirname(path,), { recursive: true, },);
    // A record with a circular/unserializable field must drop the line, not
    // write a truncated one: a torn line would break every later reader that
    // greps the log. safeJsonStringify reports the failure instead of throwing.
    const encoded = safeJsonStringify(serializeRun(record,),);
    if (!encoded.ok) { throw encoded.error; }
    appendFileSync(path, `${encoded.value}\n`, "utf8",);
  } catch (error) {
    // Everything below is best-effort reporting of a best-effort write. The
    // warn is wrapped because `getLogger()` itself throws when the root logger
    // has not been created (early boot, tests, scripts) — which would turn a
    // swallowed log-write failure into a thrown one, defeating the contract.
    if (warned) { return; }
    warned = true;
    try {
      getLogger().child({ module: "harness-exec-log", },).warn(
        "Harness exec log write failed — further writes suppressed for this process",
        { error: error instanceof Error ? error.message : String(error,), },
      );
    } catch {
      // No logger to warn with. The write failure is still swallowed.
    }
  }
}
