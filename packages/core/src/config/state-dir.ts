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
/** Stable per-instance name. Unset falls back to the effective server bind, then "default". */
export const INSTANCE_ENV_VAR = "LOOP_LORE_INSTANCE";
/** Also the config `server.port` env (see schema-class/env-map.ts). */
export const PORT_ENV_VAR = "PORT";
/** Also the config `server.host` env (see schema-class/env-map.ts). */
export const HOST_ENV_VAR = "HOST";
/** Explicit live-database path. Wins over the XDG default. */
export const DB_PATH_ENV_VAR = "LOOP_LORE_DB_PATH";
/**
 * Default bind host. Mirrors SERVER_DEFAULTS.host — kept as a literal to
 * avoid an import cycle (sections/server.ts imports constants.ts, which
 * imports this file). The slug only carries the host when it differs from this.
 */
export const DEFAULT_SERVER_HOST = "localhost";

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
 * Resolved server bind this instance listens on. Pass the loaded
 * `config.server` (flag > env > config file > default) so the slug reflects
 * the effective port, not just PORT env. Omit the whole param (or a field)
 * when unconfigured so the single-instance `default` slug is preserved.
 */
export interface ServerBind {
  port?: number | string;
  host?: string;
}

/**
 * Effective server bind for this process, stored at startup by
 * `setEffectiveServerBind`. Path resolvers that omit their `server` argument
 * fall back to this, so the DB and runtime instance dirs derive one slug.
 */
let effectiveServerBind: ServerBind | undefined;

/**
 * Store the effective server bind (loaded `config.server`) for path
 * resolution. An explicit `server` argument passed to a resolver still wins.
 * @param server - resolved server bind; omit when unconfigured
 */
export function setEffectiveServerBind(server?: ServerBind,): void {
  effectiveServerBind = server;
}

/** Test-only reset: clear the stored bind so resolvers fall back to env/default. */
export function resetEffectiveServerBindForTests(): void {
  effectiveServerBind = undefined;
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
 * @returns LOOP_LORE_INSTANCE, else `port-<effective-port>[-<host>]`, else "default"
 *
 * Precedence: explicit LOOP_LORE_INSTANCE (--instance flag) > effective
 * `server` bind (loaded config.server: flag > env > config file > default) >
 * PORT/HOST env > "default". The bind host is appended only when it differs
 * from DEFAULT_SERVER_HOST, so same-port-different-host instances land in
 * different dirs. Port 0 (ephemeral) throws — it cannot name a stable dir,
 * so the operator must pin one via --instance / LOOP_LORE_INSTANCE.
 *
 * Side effect: when PORT is set without LOOP_LORE_INSTANCE (and no server
 * bind port is set) the PORT env silently selects the database, so a
 * one-line warning goes to stderr (once per process) naming the selected dir.
 */
export function resolveInstanceSlug(
  env: StateEnv = process.env,
  server: ServerBind | undefined = effectiveServerBind,
): string {
  const named = pick(env, INSTANCE_ENV_VAR,);
  if (named) {
    return sanitizeInstanceSlug(named,);
  }
  const rawPort = server?.port ?? pick(env, PORT_ENV_VAR,);
  const portText = rawPort === undefined ? "" : String(rawPort,).trim();
  if (portText !== "" && Number(portText,) === 0) {
    throw new Error(
      "ephemeral server.port 0 needs an explicit instance: set LOOP_LORE_INSTANCE or pass --instance <name> so the database path is stable across restarts",
    );
  }
  emitPortWarningOnce(env, server,);
  if (portText === "") {
    return DEFAULT_INSTANCE_SLUG;
  }
  const rawHost = server?.host ?? pick(env, HOST_ENV_VAR,);
  const host = rawHost === undefined ? "" : String(rawHost,).trim();
  const slug = `port-${sanitizeInstanceSlug(portText,)}`;
  if (host !== "" && host !== DEFAULT_SERVER_HOST) {
    return `${slug}-${sanitizeInstanceSlug(host,)}`;
  }
  return slug;
}

/** Observed PORT-without-instance warnings, per process — env noise deserves noise, not spam. */
let portWarningEmitted = false;

/** Test-only reset for the once-per-process PORT warning. */
export function resetPortWarningForTests(): void {
  portWarningEmitted = false;
}

/**
 * @param env - environment to read
 * @param server - resolved server bind; when its port is set the bind (not PORT env) selected the dir, so no warning
 * @returns the one-line stderr warning when PORT selects the state dir
 * without LOOP_LORE_INSTANCE, else undefined (pure — test this, not stderr)
 */
export function portWithoutInstanceWarning(env: StateEnv, server?: ServerBind,): string | undefined {
  if (pick(env, INSTANCE_ENV_VAR,) !== undefined) {
    return undefined;
  }
  const serverPort = server?.port === undefined ? "" : String(server.port,).trim();
  if (serverPort !== "") {
    return undefined;
  }
  const port = pick(env, PORT_ENV_VAR,);
  if (port === undefined) {
    return undefined;
  }
  return `LOOP_LORE_INSTANCE is unset and PORT=${port} selects state dir "port-${
    sanitizeInstanceSlug(port,)
  }" — set LOOP_LORE_INSTANCE (or --instance <name>) to pin the database explicitly.`;
}
/**
 * @param env - environment to read
 * @param server - resolved server bind, forwarded to the warning selector
 */
function emitPortWarningOnce(env: StateEnv, server?: ServerBind,): void {
  if (portWarningEmitted) {
    return;
  }
  const warning = portWithoutInstanceWarning(env, server,);
  if (warning !== undefined) {
    portWarningEmitted = true;
    console.warn(warning,);
  }
}

/**
 * The per-instance state dir: every default runtime path (DB, uploads, TLS
 * certs) lives under here, so two instances never share a sqlite file.
 * @param env - environment to read (defaults to process.env)
 * @param server - resolved server bind; defaults to the stored effective bind
 * @returns <state-root>/<instance-slug>
 */
export function resolveInstanceDir(
  env: StateEnv = process.env,
  server: ServerBind | undefined = effectiveServerBind,
): string {
  return path.join(resolveStateRoot(env,), resolveInstanceSlug(env, server,),);
}

/**
 * @param env - environment to read (defaults to process.env)
 * @param server - resolved server bind; defaults to the stored effective bind
 * @returns LOOP_LORE_DB_PATH, else the XDG per-instance default
 */
export function resolveDbPath(
  env: StateEnv = process.env,
  server: ServerBind | undefined = effectiveServerBind,
): string {
  return pick(env, DB_PATH_ENV_VAR,) ?? path.join(resolveInstanceDir(env, server,), SQLITE_FILE_NAME,);
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

/** Repo root, anchored at this file — best effort, warning-only candidates below. */
const REPO_ROOT = path.resolve(CORE_CONFIG_DIR, "..", "..", "..", "..",);

/**
 * Historical repo-local data dirs that actually held databases, in check
 * order. The pre-monorepo checkout kept `loop-lore-data/` and `data/` at its
 * root; the old `../loop-lore-data` config escape pointed at the checkout's
 * sibling. Migration sources only, never written.
 */
export const LEGACY_DATA_DIRS: string[] = [
  LEGACY_DATA_DIR,
  path.resolve(REPO_ROOT, "loop-lore-data",),
  path.resolve(REPO_ROOT, "data",),
  path.resolve(REPO_ROOT, "..", "loop-lore-data",),
];

/**
 * First legacy repo-local database found in any of `dirs`, or null.
 * @param dbPath - the resolved live path
 * @param dirs - candidate dirs, defaults to LEGACY_DATA_DIRS (injectable for tests)
 * @returns the legacy db path to point the operator at, or null
 */
export function findFirstLegacyDb(dbPath: string, dirs: readonly string[] = LEGACY_DATA_DIRS,): string | null {
  for (const dir of dirs) {
    const found = findLegacyDb(dir, dbPath,);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
