// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Runtime state root (XDG state home), per-instance subdirs, and path
// resolution. Single source of truth for every path that used to live inside
// the repo checkout (`packages/core/loop-lore-data`).
//
// Precedence (operator-decided): explicit path env (LOOP_LORE_DB_PATH,
// ASSETS_UPLOAD_DIR, TLS_KEY/TLS_CERT, LOOP_LORE_BACKUP_DIR) > XDG default
// ($XDG_STATE_HOME/loop-lore, fallback ~/.local/state/loop-lore) >
// config-file values. The config-file `db.sqliteFilename` knob is IGNORED at
// runtime — getDatabase() never read it (status quo, now documented in
// docs/spec/xdg-state-storage.md).
//
// Migration is docs-only: when a legacy repo-local database exists the
// runtime logs a move-your-data warning once and keeps serving the new
// location. Nothing is moved or renamed automatically.

import { existsSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, } from "node:url";

/** Full-tree override for the state root (tests, packaging). Wins over XDG. */
export const STATE_DIR_ENV_VAR = "LOOP_LORE_STATE_DIR";
/** XDG base dir; `loop-lore` is appended. Unset/empty falls back to ~/.local/state. */
export const XDG_STATE_HOME_ENV_VAR = "XDG_STATE_HOME";
/** Stable per-instance name. Unset falls back to the port slug, then "default". */
export const INSTANCE_ENV_VAR = "LOOP_LORE_INSTANCE";
/** Also the config `server.port` env (see schema-class/env-map.ts). */
export const PORT_ENV_VAR = "PORT";
/** Explicit live-database path. Wins over the XDG default. */
export const DB_PATH_ENV_VAR = "LOOP_LORE_DB_PATH";

/** Directory name appended to $XDG_STATE_HOME. */
export const APP_STATE_DIR_NAME = "loop-lore";
/** Instance slug when neither LOOP_LORE_INSTANCE nor PORT is set. */
export const DEFAULT_INSTANCE_SLUG = "default";
/** SQLite file name inside an instance dir. */
export const SQLITE_FILE_NAME = "loop-lore.db";

/** Minimal env surface the resolvers read — `process.env` satisfies this. */
export interface StateEnv {
  [key: string]: string | undefined;
}

/**
 * @param env - environment to read
 * @param key - variable name
 * @returns the trimmed value, or undefined when unset/blank
 */
function pick(env: StateEnv, key: string,): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/**
 * Make a user-supplied slug safe as a single path segment: anything outside
 * `[A-Za-z0-9._-]` becomes `-`, and `.` / `..` (directory escape) collapse to
 * the default slug.
 * @param raw - untrusted slug (env var or port)
 * @returns a safe single-segment slug
 */
export function sanitizeInstanceSlug(raw: string,): string {
  const slug = raw.trim().replace(/[^A-Za-z0-9._-]/g, "-",);
  return slug === "" || slug === "." || slug === ".." ? DEFAULT_INSTANCE_SLUG : slug;
}

/**
 * @param env - environment to read (defaults to process.env)
 * @returns LOOP_LORE_STATE_DIR, else $XDG_STATE_HOME/loop-lore, else ~/.local/state/loop-lore
 */
export function resolveStateRoot(env: StateEnv = process.env,): string {
  const override = pick(env, STATE_DIR_ENV_VAR,);
  if (override) {
    return override;
  }
  const xdg = pick(env, XDG_STATE_HOME_ENV_VAR,);
  if (xdg) {
    return path.join(xdg, APP_STATE_DIR_NAME,);
  }
  return path.join(os.homedir(), ".local", "state", APP_STATE_DIR_NAME,);
}

/**
 * @param env - environment to read (defaults to process.env)
 * @returns LOOP_LORE_INSTANCE, else `port-<PORT>`, else "default"
 */
export function resolveInstanceSlug(env: StateEnv = process.env,): string {
  const named = pick(env, INSTANCE_ENV_VAR,);
  if (named) {
    return sanitizeInstanceSlug(named,);
  }
  const port = pick(env, PORT_ENV_VAR,);
  if (port) {
    return `port-${sanitizeInstanceSlug(port,)}`;
  }
  return DEFAULT_INSTANCE_SLUG;
}

/**
 * The per-instance state dir: every default runtime path (DB, uploads, TLS
 * certs) lives under here, so two instances never share a sqlite file.
 * @param env - environment to read (defaults to process.env)
 * @returns <state-root>/<instance-slug>
 */
export function resolveInstanceDir(env: StateEnv = process.env,): string {
  return path.join(resolveStateRoot(env,), resolveInstanceSlug(env,),);
}

/**
 * @param env - environment to read (defaults to process.env)
 * @returns LOOP_LORE_DB_PATH, else the XDG per-instance default
 */
export function resolveDbPath(env: StateEnv = process.env,): string {
  return pick(env, DB_PATH_ENV_VAR,) ?? path.join(resolveInstanceDir(env,), SQLITE_FILE_NAME,);
}

const CORE_CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url,),);

/** Pre-XDG repo-local data dir — migration source only, never written. */
export const LEGACY_DATA_DIR = path.resolve(CORE_CONFIG_DIR, "..", "..", "loop-lore-data",);

/**
 * Legacy repo-local database file, when it exists on disk and is NOT the
 * resolved path (i.e. the operator may still have data in the old location).
 * @param legacyDataDir - usually LEGACY_DATA_DIR (injectable for tests)
 * @param dbPath - the resolved live path
 * @returns the legacy db path to point the operator at, or null
 */
export function findLegacyDb(legacyDataDir: string, dbPath: string,): string | null {
  const candidate = path.join(legacyDataDir, SQLITE_FILE_NAME,);
  if (candidate === dbPath) {
    return null;
  }
  try {
    return existsSync(candidate,) ? candidate : null;
  } catch {
    return null;
  }
}
