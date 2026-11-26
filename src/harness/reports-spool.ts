// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tooling report SPOOL — the best-effort JSONL mirror of the
 * `tooling_reports` table, at `<instance-dir>/harness/reports.jsonl`.
 *
 * Mirrors src/harness/exec-log.ts conventions: one compact JSON object per
 * line, snake_case wire names, no rotation (the spool is a failure-mining
 * feed; pruning it would delete exactly the old failures RSI wants), and
 * every failure swallowed after one warn per process. The DB is the
 * authoritative store — the spool is an ingest buffer / offline mirror and
 * a failed spool write NEVER fails the report.
 */
import fs from "node:fs";
import { dirname, join, } from "node:path";
import { resolveInstanceDir, } from "../config/state-dir";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { HARNESS_DIR, } from "./exec-log";
import type { ToolingReportRow, } from "./reports";

/** Spool filename inside the instance harness dir (mirrors executions.jsonl). */
export const REPORTS_SPOOL_FILENAME = "reports.jsonl";

/** Set once the first spool write fails; after that the spool stays quiet. */
let spoolWarned = false;

/** Memoized spool path, and the instance dir it was resolved for. */
let spoolPath: string | null = null;
let spoolPathFor = "";

/** True when the path was set explicitly (test seam) instead of resolved. */
let spoolPathForced = false;

/**
 * Absolute path of this instance's report spool, or null when the path was
 * forced off (test seam).
 * @returns the memoized spool path, re-resolved when the instance dir moves.
 */
export function getReportSpoolPath(): string | null {
  if (spoolPathForced) { return spoolPath; }
  let instanceDir: string;
  try {
    instanceDir = resolveInstanceDir(process.env,);
  } catch {
    return null;
  }

  if (spoolPath === null || spoolPathFor !== instanceDir) {
    spoolPath = join(instanceDir, HARNESS_DIR, REPORTS_SPOOL_FILENAME,);
    spoolPathFor = instanceDir;
  }

  return spoolPath;
}

/**
 * Override the resolved spool path. Test-only seam: lets the write side run
 * against a per-test fixture directory instead of the live instance dir.
 * @param path - Absolute path, or null to force the no-spool case.
 */
export function setReportSpoolPath(path: string | null,): void {
  spoolPathForced = true;
  spoolPath = path;
  spoolPathFor = "";
}

/** Reset the memoized path and the one-shot warn. Test-only seam. */
export function resetReportSpoolPath(): void {
  spoolPath = null;
  spoolPathFor = "";
  spoolPathForced = false;
  spoolWarned = false;
}

/**
 * Row → the exact object one spool line carries (snake_case wire names,
 * stable key order — greps like executions.jsonl / `.ledger.jsonl`).
 * @param row - the stored DB row
 * @returns the spool-line object `safeJsonStringify` serializes.
 */
export function serializeReport(row: ToolingReportRow,): Record<string, unknown> {
  return {
    id: row.id,
    ts: row.ts,
    source: row.source,
    category: row.category,
    tool: row.tool,
    attempt: row.attempt,
    max_attempts: row.max_attempts,
    detail: row.detail,
    duration_ms: row.duration_ms,
    profile: row.profile,
    branch: row.branch,
    git_sha: row.git_sha,
    instance_id: row.instance_id,
    dedupe_key: row.dedupe_key,
    count: row.count,
    last_seen: row.last_seen,
  };
}

/**
 * Mirror one stored row to the spool. Best-effort: a failure is warned once
 * per process and swallowed — the DB is authoritative, so a spool failure
 * never fails the report.
 * @param row - the committed DB row to mirror
 */
export function writeReportSpool(row: ToolingReportRow,): void {
  const path = getReportSpoolPath();
  if (path === null) { return; }
  try {
    fs.mkdirSync(dirname(path,), { recursive: true, },);
    // A circular/unserializable field must drop the line, not write a
    // truncated one: a torn line would break every later grepper.
    // safeJsonStringify reports the failure instead of throwing.
    const encoded = safeJsonStringify(serializeReport(row,),);
    if (!encoded.ok) { throw encoded.error; }
    fs.appendFileSync(path, `${encoded.value}\n`, "utf8",);
  } catch (error) {
    // The warn is wrapped because `getLogger()` itself throws when the root
    // logger has not been created (early boot, tests, scripts) — which would
    // turn a swallowed spool failure into a thrown one, defeating the
    // best-effort contract.
    if (spoolWarned) { return; }
    spoolWarned = true;
    try {
      getLogger().child({ module: "harness-reports", },).warn(
        "Report spool write failed — further writes suppressed for this process",
        { error: error instanceof Error ? error.message : String(error,), },
      );
    } catch {
      // No logger to warn with. The spool failure is still swallowed.
    }
  }
}
