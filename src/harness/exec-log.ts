// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log — append-only writer for
 * `<instance-dir>/harness/executions.jsonl`.
 *
 * One compact JSON object per line, snake_case wire names, so the file greps
 * and `jq`s like the agent ledger (`.ledger.jsonl`) and needs no reader to be
 * useful. No rotation: the log is a failure-mining feed, and pruning it would
 * delete exactly the old failures RSI wants.
 *
 * The log lives in the instance state dir, so two instances never append to
 * the same file and every record can be attributed to an instance.
 *
 * Every write is best-effort. A run must never fail because its log line did
 * not land, so failures are swallowed after one warn per process.
 */
import fs from "node:fs";
import { dirname, join, } from "node:path";
import { resolveInstanceDir, resolveInstanceSlug, } from "../config/state-dir";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { EXEC_INDEX_FILENAME, formatIndexEntry, } from "./exec-index";
import { runGit, } from "./run-context";
import { type HarnessRunRecord, serializeRun, } from "./types";

/** Directory (inside the instance state dir) holding the JSONL log. */
export const HARNESS_DIR = "harness";

/** Log filename inside {@link HARNESS_DIR}. */
export const HARNESS_LOG_FILENAME = "executions.jsonl";

/** Legacy repo-scoped log dir — where the log lived before it became instance-scoped. */
const LEGACY_HARNESS_DIR = ".harness";

/** Set once the first write fails; after that the log stays quiet. */
let warned = false;

/** Set once the legacy repo-scoped log has been pointed out. */
let legacyNoticeDone = false;

/** Memoized log path, and the instance dir it was resolved for. */
let logPath: string | null = null;
let logPathFor = "";

/** True when the path was set explicitly (test seam) instead of resolved. */
let logPathForced = false;

/**
 * Process-local counters over the records handed to the writer.
 *
 * They are the only harness counters a metrics scrape may read: the JSONL is
 * read from disk by the stats endpoint (an O(file) tail scan), which a scrape
 * must never do. The counters are FIXED-SIZE and reset when the process
 * restarts — they are a since-start view of this process, not a durable
 * total. The population is every record handed to {@link appendExecLog}, the
 * same set the stats endpoint rolls up, so the two agree on what a "run" is.
 */
const counters = {
  /** Records handed to the writer. */
  runs: 0,
  /** Records whose result was not `ok`. */
  errors: 0,
  /** USD summed over the records that declared a price (null = unknown, never free). */
  spendUsd: 0,
  /** Non-ok results by kind. */
  byKind: { error: 0, timeout: 0, cancelled: 0, },
  /** Dispatches by exec-log task type — a closed vocabulary, so the map stays bounded. */
  byTaskType: {} as Record<string, number>,
  /**
   * Dispatches by external-harness profile name. Records without a profile
   * (internal provider dispatches) contribute nothing — a null key would
   * render as a label nothing can filter on.
   */
  byProfile: {} as Record<string, number>,
};

/**
 * Fold one run record into the process-local counters.
 *
 * Counted before the path check: the counters describe the RUN, not the
 * write. A run outside a checkout still happened, and the counters are the
 * only harness counters a metrics scrape may read (the JSONL read side is an
 * O(file) tail scan).
 * @param record - the run being logged.
 * @returns nothing; mutates the module counters.
 */
function countRecord(record: HarnessRunRecord,): void {
  counters.runs++;
  if (record.result !== "ok") {
    counters.errors++;
    counters.byKind[record.result]++;
  }

  counters.byTaskType[record.taskType] = (counters.byTaskType[record.taskType] ?? 0) + 1;
  if (record.profile) {
    counters.byProfile[record.profile] = (counters.byProfile[record.profile] ?? 0) + 1;
  }

  // A null cost is unknown, not zero — it contributes nothing to the sum.
  // The finite check is the one the wire reader applies to the same field: a
  // non-finite cost would make the counter NaN, and NaN survives every later
  // addition — one bad record would poison the metric for the whole process.
  if (typeof record.costUsd === "number" && Number.isFinite(record.costUsd,)) {
    counters.spendUsd += record.costUsd;
  }
}

/**
 * The process-local harness counters.
 * @returns a copy of the counters (the caller cannot mutate the live state).
 */
export function getExecLogCounters(): {
  runs: number;
  errors: number;
  spendUsd: number;
  byKind: { error: number; timeout: number; cancelled: number };
  byTaskType: Record<string, number>;
  byProfile: Record<string, number>;
} {
  return {
    ...counters,
    byKind: { ...counters.byKind, },
    byTaskType: { ...counters.byTaskType, },
    byProfile: { ...counters.byProfile, },
  };
}

/** Reset the process-local counters. Test-only seam. */
export function resetExecLogCounters(): void {
  counters.runs = 0;
  counters.errors = 0;
  counters.spendUsd = 0;
  counters.byKind = { error: 0, timeout: 0, cancelled: 0, };
  counters.byTaskType = {};
  counters.byProfile = {};
}

/**
 * Absolute path of this instance's exec log, or null when the path was forced
 * to "no log" by the test seam.
 *
 * The log lives in the instance state dir: two instances never append to the
 * same file, and the records can be attributed to an instance.
 * @returns The JSONL path inside the instance state dir.
 */
export function getExecLogPath(): string | null {
  if (logPathForced) { return logPath === "" ? null : logPath; }
  let instanceDir: string;
  try {
    instanceDir = resolveInstanceDir(process.env,);
  } catch {
    // No stable instance dir (e.g. an ephemeral port without an explicit
    // instance): there is no per-instance log to write to.
    return null;
  }

  if (logPath === null || logPathFor !== instanceDir) {
    logPath = join(instanceDir, HARNESS_DIR, HARNESS_LOG_FILENAME,);
    logPathFor = instanceDir;
    noticeLegacyExecLog(logPath,);
  }

  return logPath;
}

/**
 * Absolute path of this instance's offset sidecar, or null when there is no
 * log. Derived from the log path, so the forced test seam applies to both.
 * @returns the `executions.idx` path beside the JSONL log
 */
export function getExecIndexPath(): string | null {
  const path = getExecLogPath();
  return path === null ? null : join(dirname(path,), EXEC_INDEX_FILENAME,);
}

/**
 * Point the operator at the repo-scoped log this instance-scoped path
 * replaced.
 *
 * The old file is left untouched: its records predate per-instance
 * attribution, so moving them into an instance dir would attribute them to
 * the wrong instance. One notice per process, then the file is ignored.
 * @param instancePath - the instance-scoped log path
 * @returns nothing; the notice is best-effort.
 */
function noticeLegacyExecLog(instancePath: string,): void {
  if (legacyNoticeDone) { return; }
  legacyNoticeDone = true;
  let root = "";
  try {
    root = runGit(["rev-parse", "--show-toplevel",],);
  } catch {
    return; // not a checkout — no repo-scoped log to point at
  }

  if (root === "") { return; }

  const legacyPath = join(root, LEGACY_HARNESS_DIR, HARNESS_LOG_FILENAME,);
  if (!fs.existsSync(legacyPath,)) { return; }
  try {
    getLogger().child({ module: "harness-exec-log", },).warn(
      "Repo-scoped harness exec log found — it is no longer written or read; move it into the instance dir to keep its records",
      { legacyPath, instancePath, },
    );
  } catch {
    // No logger (early boot, tests) — the notice is best-effort.
  }
}

/**
 * Override the resolved log path. Test-only seam: lets the read side run
 * against a fixture file instead of the live worktree log.
 * @param path - Absolute path, or null to force the no-log case.
 */
export function setExecLogPath(path: string | null,): void {
  // `null` maps to the memoized-empty sentinel, NOT to "unmemoized" — a null
  // here must force "no log", never fall through to instance-dir resolution.
  logPath = path ?? "";
  logPathForced = true;
}

/** Reset the memoized path and the one-shot notices. Test-only seam. */
export function resetExecLogPath(): void {
  logPath = null;
  logPathFor = "";
  logPathForced = false;
  warned = false;
  legacyNoticeDone = false;
}

/**
 * Stamp this instance's slug on a record that does not carry one.
 *
 * The writer knows which instance's log this is, so every record it writes is
 * attributable. Never throws: the writer is best-effort and must not break the
 * run it logs.
 * @param record - the run record
 * @returns the record, with the instance slug filled in
 */
function withInstanceSlug(record: HarnessRunRecord,): HarnessRunRecord {
  if (record.instanceId) { return record; }
  try {
    return { ...record, instanceId: resolveInstanceSlug(process.env,), };
  } catch {
    return { ...record, instanceId: null, };
  }
}

/**
 * Append one run record. Never throws, never blocks the caller's result.
 *
 * @param record - the run to log
 * @returns nothing; a write failure is logged once and swallowed
 */
export function appendExecLog(record: HarnessRunRecord,): void {
  countRecord(record,);
  const path = getExecLogPath();
  if (path === null) { return; }
  try {
    fs.mkdirSync(dirname(path,), { recursive: true, },);
    // The writer knows which instance's log this is: every record carries the
    // slug, so a record stays attributable even when it was built elsewhere.
    // A record with a circular/unserializable field must drop the line, not
    // write a truncated one: a torn line would break every later reader that
    // greps the log. safeJsonStringify reports the failure instead of throwing.
    const encoded = safeJsonStringify(serializeRun(withInstanceSlug(record,),),);
    if (!encoded.ok) { throw encoded.error; }
    const line = `${encoded.value}\n`;
    // Byte offset of the line about to be appended; a fresh or missing file
    // starts at 0. Both appends are sync, so no other writer interleaves them.
    let offset = 0;
    try {
      offset = fs.statSync(path,).size;
    } catch {
      offset = 0;
    }

    fs.appendFileSync(path, line, "utf8",);
    // ponytail: the sidecar is best-effort and can sit one entry behind the
    // log after a torn process; the reader detects drift and falls back to
    // its tail scan. Upgrade path: rebuild from the log if retroactive
    // indexing of pre-sidecar logs is ever needed.
    try {
      const idxPath = getExecIndexPath();
      if (idxPath !== null) {
        fs.appendFileSync(idxPath, formatIndexEntry(offset, Buffer.byteLength(line, "utf8",),), "ascii",);
      }
    } catch {
      // Best-effort: a missing sidecar only disables the reader's fast path.
    }
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
