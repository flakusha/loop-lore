// src/config/load/safety.ts — Database safety guards

import type { Config, } from "../schema";
import { isNetworkFilesystem, } from "./fs";

/**
 * Validate database safety constraints.
 * Rejects SQLite for multi-instance deployments and warns on network filesystems.
 *
 * @throws {Error} When SQLite is used in an unsafe multi-instance configuration
 */
export function validateDatabaseSafety(config: Config,): void {
  const { db, } = config;
  const instanceCount = Number(process.env.INSTANCE_COUNT ?? "1",);
  const unsafeMultiInstance = process.env.UNSAFE_SQLITE_MULTIINSTANCE === "true";

  // ── Guard 1: Reject SQLite + multi-instance ──
  if (db.type === "sqlite" && instanceCount > 1) {
    throw new Error(
      `DATABASE SAFETY: SQLite backend is not safe with ${instanceCount} instances. ` +
        "SQLite uses file-level locking that corrupts data when multiple processes " +
        "write concurrently over a network filesystem. " +
        'Fix: Switch to Postgres (db.type = "postgres") or set INSTANCE_COUNT=1.',
    );
  }

  if (db.type === "sqlite" && unsafeMultiInstance) {
    throw new Error(
      "DATABASE SAFETY: UNSAFE_SQLITE_MULTIINSTANCE=true is set but SQLite is configured. " +
        "This environment variable is a safety override that should only be used " +
        "during controlled migrations. Remove it or switch to Postgres.",
    );
  }

  // ── Guard 2: Warn on network filesystem ──
  if (db.type === "sqlite" && db.sqliteFilename && isNetworkFilesystem(db.sqliteFilename,)) {
    console.warn(
      `DATABASE WARNING: SQLite WAL path "${db.sqliteFilename}" appears to be on a network filesystem. ` +
        "SQLite over NFS/EFS is unreliable and may cause data corruption. " +
        "Mitigations: (1) move DB to local storage, (2) switch to Postgres, " +
        "(3) set UNSAFE_SQLITE_MULTIINSTANCE=true to suppress.",
    );
  }
}
