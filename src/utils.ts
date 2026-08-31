// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared Utilities
 *
 * Common helpers used across modules — uid generation,
 * error formatting, and other general-purpose functions.
 */
import { randomBytes, randomUUID, } from "node:crypto";

// ── Safe JSON (re-exported from no-dep sub-module) ──────────

export type { JsonResult, SafeJsonStringifyOptions, } from "./utils/safe-json";
export { isJsonString, jsonParseOr, jsonStringifyOr, safeJsonParse, safeJsonStringify, } from "./utils/safe-json";

// ── Safe Fetch ──────────────────────────────────────────────

export type { FetchAuth, FetchResult, SafeFetchOptions, } from "./utils/safe-fetch";
export { safeFetch, safeFetchWithRetry, } from "./utils/safe-fetch";

// ── Numeric Clamping ──────────────────────────────────────────
//
// Re-exported from the no-dep clamp sub-module. Used to defensively
// bound parsed numeric input (e.g. LLM confidence scores contractually
// in `[0, 1]`) so downstream heuristics that branch on the value
// cannot be tricked by out-of-range or non-finite input.
export { clamp, clampUnit, } from "./utils/clamp";

// ── Safe Buffer ─────────────────────────────────────────────

// NOTE: safe-buffer functions (safeFromBase64, safeToBase64, safeCompress, etc.)
// must NOT be re-exported here — they depend on node:zlib which breaks
// the browser build (--target browser). Import directly from "./utils/safe-buffer".

// ── ID Generation ─────────────────────────────────────────────

/** Create a DB-safe UUID string (v4, RFC 4122) */
export const uid = (): string => randomUUID();

/** Create a cryptographically secure random token (32 hex chars = 128 bits) */
export const secureToken = (): string => randomBytes(16,).toString("hex",);

// ── Error Helpers ─────────────────────────────────────────────

/** Extract a safe Error object from an unknown thrown value */
export function asError(error: unknown,): Error {
  return error instanceof Error ? error : new Error(String(error,),);
}

/** Extract error message string from an unknown thrown value */
export function toErrorMessage(error: unknown,): string {
  return error instanceof Error ? error.message : "Unknown error";
}

// ── Exhaustiveness Checking ───────────────────────────────────

/**
 * Assert that a value is `never` — used in switch default cases
 * to guarantee all enum/union variants are handled at compile time.
 *
 * @example
 * switch (status) {
 *   case GenerationStatus.Pending: return "waiting";
 *   case GenerationStatus.Completed: return "done";
 *   default: return assertNever(status);
 * }
 */
export function assertNever(value: never,): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value,)}`,);
}
