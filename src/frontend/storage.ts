// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guarded Web Storage access.
 *
 * Both `localStorage` and `sessionStorage` throw rather than degrade: touching
 * the global throws `SecurityError` when storage is blocked (private windows,
 * blocked cookies, sandboxed frames), and `setItem` throws `QuotaExceededError`
 * independently of that. A bare `localStorage.getItem(...)` at a call site
 * therefore turns "preferences unavailable" into an unhandled exception that
 * takes down whatever init or save path happened to be running.
 *
 * These helpers make storage access total: reads answer `null` (the same value
 * a missing key already returns) and writes report and continue. Nothing is
 * swallowed silently — every failure is logged with its key, so a stuck write
 * is diagnosable rather than invisible.
 */

import { log as rootLog, } from "./alpine/logger";

const log = rootLog.child({ module: "storage", },);

/** Which Web Storage area to talk to. */
export type StorageKind = "local" | "session";

/**
 * The storage area for `kind`, or `null` when the browser refuses access.
 */
function storageOf(kind: StorageKind,): Storage | null {
  try {
    return kind === "session" ? globalThis.sessionStorage : globalThis.localStorage;
  } catch (error) {
    log.warn("storage access denied", { kind, error: String(error,), },);
    return null;
  }
}

/**
 * Read `key`, or `null` when it is unset or storage is unavailable.
 * @param kind
 * @param key
 * @returns {string | null}
 */
export function storageGet(kind: StorageKind, key: string,): string | null {
  const s = storageOf(kind,);
  if (!s) { return null; }
  try {
    return s.getItem(key,);
  } catch (error) {
    log.warn("storage read failed", { kind, key, error: String(error,), },);
    return null;
  }
}

/**
 * Write `key`, reporting quota and access failures instead of throwing.
 * @param kind
 * @param key
 * @param value
 * @returns {void}
 */
export function storageSet(kind: StorageKind, key: string, value: string,): void {
  const s = storageOf(kind,);
  if (!s) { return; }
  try {
    s.setItem(key, value,);
  } catch (error) {
    log.warn("storage write failed", { kind, key, error: String(error,), },);
  }
}

/**
 * Delete `key`, reporting access failures instead of throwing.
 * @param kind
 * @param key
 * @returns {void}
 */
export function storageRemove(kind: StorageKind, key: string,): void {
  const s = storageOf(kind,);
  if (!s) { return; }
  try {
    s.removeItem(key,);
  } catch (error) {
    log.warn("storage delete failed", { kind, key, error: String(error,), },);
  }
}
