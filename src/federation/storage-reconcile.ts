// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/storage-reconcile.ts — bounded disk walk vs DB truth.
//
// The DB stays the source of truth. This job only DETECTS drift and reports
// it; it never writes files and never adopts an untracked file. An orphan has
// no owner, no chat link and no content hash, so adopting it would mint an
// asset nobody asked for (epic-federation-offload-quotas §4).
//
//   DB > disk  -> rows point at files that vanished. Reported; the budget is
//                 NOT silently reset, and no file is re-created.
//   DB < disk  -> untracked files on disk. Reported as orphans. Never adopted.
//   no dir    -> usage reads zero, writes fail loudly (see ./storage-quota).
//
// `diskBytes` measures every file found (sidecars and thumbnails included) while
// the DB counts only `assets.size_bytes`, so the comparison is a health signal,
// not an equality assertion: the status says which side moved.

import type { Kysely, } from "kysely";
import { readdir, stat, } from "node:fs/promises";
import { join, relative, } from "node:path";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";

/** Lazy: a bare import must not throw when no root logger exists yet. */
const getLog = () => getChildLogger("federation/storage-reconcile",);

/** Hard ceiling on files walked per reconcile. The walk is a health check. */
export const RECONCILE_MAX_ENTRIES = 50_000;

/** Drift class. `in-sync` means the two sides agree. */
export type StorageDriftStatus = "in-sync" | "db-above-disk" | "disk-above-db";

/** Result of one reconcile pass. */
export interface StorageDriftReport {
  /** `SUM(assets.size_bytes)` — the authoritative figure. */
  dbBytes: number;
  /** Bytes observed under `uploadDir`, or 0 when it is gone. */
  diskBytes: number;
  /** Asset ids counted in the DB. */
  trackedIds: string[];
  /** Files under `uploadDir` absent from `assets.storage_path` — never adopted. */
  orphanPaths: string[];
  /** Asset ids whose `storage_path` is absent from disk. */
  vanishedIds: string[];
  /** True when `uploadDir` could not be walked. */
  storageMissing: boolean;
  /** True when the walk stopped at `maxEntries`. */
  walkTruncated: boolean;
  status: StorageDriftStatus;
}

/** One walked file, path relative to the asset root. */
interface WalkedFile {
  path: string;
  bytes: number;
}

/** Outcome of the bounded walk. */
interface WalkResult {
  files: WalkedFile[];
  bytes: number;
  missing: boolean;
  truncated: boolean;
}

/**
 * Compare the DB byte total against a bounded walk of the asset root.
 * @param opts
 * @param opts.database
 * @param opts.uploadDir Asset root (`config.assets.uploadDir`).
 * @param opts.maxEntries Files to walk before truncating.
 * @returns {Promise<StorageDriftReport>}
 */
export async function reconcileStorageUsage(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  maxEntries?: number;
},): Promise<StorageDriftReport> {
  const maxEntries = opts.maxEntries ?? RECONCILE_MAX_ENTRIES;
  const rows = await opts.database
    .selectFrom("assets",)
    .select(["id", "storage_path", "size_bytes",],)
    .execute();

  const dbBytes = rows.reduce((sum, row,) => sum + Number(row.size_bytes ?? 0,), 0,);
  const trackedIds = rows.map((row,) => row.id);
  const knownPaths = new Set(rows.map((row,) => row.storage_path ?? "").filter((path,) => path !== ""),);

  const walk = await walkAssetRoot(opts.uploadDir, { maxEntries, },);
  const diskPaths = new Set(walk.files.map((file,) => file.path),);

  const vanishedIds = rows
    .filter((row,) => row.storage_path !== null && !diskPaths.has(row.storage_path,))
    .map((row,) => row.id);

  const orphanPaths = [...diskPaths,].filter((path,) => !knownPaths.has(path,)).sort();

  const status: StorageDriftStatus = walk.missing || vanishedIds.length > 0
    ? "db-above-disk"
    : orphanPaths.length > 0
    ? "disk-above-db"
    : "in-sync";

  const report: StorageDriftReport = {
    dbBytes,
    diskBytes: walk.bytes,
    trackedIds,
    orphanPaths,
    vanishedIds,
    storageMissing: walk.missing,
    walkTruncated: walk.truncated,
    status,
  };

  logDrift(report,);
  return report;
}

/**
 * Bounded recursive walk. Thumbnail and sidecar files live under the root too,
 * so they are counted — `diskBytes` is what the root occupies, not what the DB
 * claims.
 */
async function walkAssetRoot(
  root: string,
  opts: { maxEntries: number },
): Promise<WalkResult> {
  const files: WalkedFile[] = [];
  let bytes = 0;
  let truncated = false;
  const stack: string[] = [root,];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) { break; }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true, },);
    } catch {
      return { files, bytes, missing: current === root, truncated, };
    }

    for (const entry of entries) {
      if (files.length >= opts.maxEntries) {
        truncated = true;
        break;
      }

      const full = join(current, entry.name,);
      if (entry.isDirectory()) {
        stack.push(full,);
        continue;
      }

      try {
        const info = await stat(full,);
        bytes += info.size;
        files.push({ path: relative(root, full,), bytes: info.size, },);
      } catch {
        // Vanished mid-walk — the caller reports the row as vanished.
      }
    }

    if (truncated) { break; }
  }

  return { files, bytes, missing: false, truncated, };
}

/** Report drift loudly: an operator must see it without the admin UI. */
function logDrift(report: StorageDriftReport,): void {
  const base = {
    dbBytes: report.dbBytes,
    diskBytes: report.diskBytes,
    vanished: report.vanishedIds.length,
    orphans: report.orphanPaths.length,
    truncated: report.walkTruncated,
  };

  if (report.storageMissing) {
    getLog()?.error(
      "storage root missing; usage reads zero and writes fail",
      new Error("uploadDir unreachable",),
      base,
    );

    return;
  }

  if (report.status === "db-above-disk") {
    getLog()?.error(
      "storage drift: DB counts more than disk holds; rows point at vanished files",
      new Error(`${report.vanishedIds.length} asset rows have no file on disk`,),
      base,
    );

    return;
  }

  if (report.status === "disk-above-db") {
    const serialized = safeJsonStringify({ orphanPaths: report.orphanPaths.slice(0, 50,), },);
    getLog()?.warn("storage drift: untracked files on disk; reported only, never adopted", {
      ...base,
      orphansSample: serialized.ok ? serialized.value : "[]",
    },);
  }
}
