// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/db-warnings.ts — Database safety warnings.
//
// The runtime database is always SQLite: `db.type` cannot change it. These
// warnings say so out loud (an unsupported type is ignored, not honoured) and
// keep the multi-instance guard active by default, keyed on the RESOLVED
// database path instead of an opt-in counter.

import { DbType, } from "../../../../../src/db/enums";
import { getChildLogger, } from "../../logger";
import { DB_PATH_ENV_VAR, resolveStateRoot, type StateEnv, } from "../state-dir";
import { isNetworkFilesystem, } from "./fs";

/**
 * The loud warning for a `db.type` this build cannot honour: the runtime is
 * always SQLite, so the configured value is ignored — not honoured.
 *
 * `db.url` is part of the ignored value: this build has no Postgres runtime,
 * so a configured connection URL changes nothing.
 * @param dbType - the configured database type, when one is set
 * @returns the warning message, or null when the type is implemented or absent
 */
export function unsupportedDbTypeWarning(dbType: DbType | undefined,): string | null {
  if (dbType === undefined || dbType === DbType.Sqlite) { return null; }
  return `db.type=${dbType} is not implemented in this build - running SQLite; db.url is ignored`;
}

/**
 * The warning for a database path every instance shares: SQLite is
 * single-writer, so two instances on one file corrupt it.
 * @param dbPath - the pinned database path, when one is set
 * @returns the warning message, or null when the path is not pinned
 */
export function sharedDatabasePathWarning(dbPath: string | undefined,): string | null {
  if (dbPath === undefined || dbPath === "") { return null; }
  return (
    `DATABASE SAFETY: the database path "${dbPath}" is pinned (${DB_PATH_ENV_VAR}) — every instance ` +
    `that uses it shares one SQLite file, and SQLite is single-writer. Run one instance per database ` +
    `file (unset ${DB_PATH_ENV_VAR} so each instance gets its own state dir).`
  );
}

/**
 * The warning for a database that lives on a network filesystem.
 * @param location - the path the database lives on
 * @returns the warning message, or null when the path is on local storage
 */
export function networkFilesystemWarning(location: string,): string | null {
  if (!isNetworkFilesystem(location,)) { return null; }
  return (
    `The database path "${location}" appears to be on a network filesystem — SQLite over NFS/EFS is ` +
    "unreliable and may corrupt data. Move the state dir to local storage."
  );
}

/**
 * The path the runtime opens: the pinned path, else the per-instance state root.
 * @param env - environment to read
 * @returns the resolved location
 */
export function databaseLocation(env: StateEnv,): string {
  const pinned = env[DB_PATH_ENV_VAR]?.trim();
  if (pinned) { return pinned; }
  return resolveStateRoot(env,);
}

/** Safety warnings already emitted in this process — one line each, never repeated. */
const emittedWarnings = new Set<string>();

/** Test-only reset for the once-per-process safety warnings. */
export function resetDatabaseSafetyWarningsForTests(): void {
  emittedWarnings.clear();
}

/**
 * Emit a database-safety warning once per process. Falls back to stderr when
 * no root logger exists yet (a CLI run before the logger bootstrap).
 * @param key - the warning identity
 * @param message - the warning text
 * @param meta - structured context for the log entry
 */
export function warnDatabaseSafety(key: string, message: string, meta: Record<string, unknown>,): void {
  if (emittedWarnings.has(key,)) { return; }
  emittedWarnings.add(key,);
  const logger = getChildLogger("config-safety",);
  if (logger !== null) {
    logger.warn(message, meta,);
    return;
  }
  console.warn(message,);
}

/**
 * Warn once per process that the configured `db.type` is not implemented.
 * The runtime boots on SQLite either way — the warning IS the contract, so it
 * must fire before any validation that could abort the boot.
 * @param dbType - the configured database type, when one is set
 */
export function warnUnsupportedDbType(dbType: DbType | undefined,): void {
  const message = unsupportedDbTypeWarning(dbType,);
  if (message === null) { return; }
  warnDatabaseSafety("unsupported-db-type", message, { dbType, supported: DbType.Sqlite, },);
}
