/**
 * Shared Utilities
 *
 * Common helpers used across modules — uid generation,
 * error formatting, and other general-purpose functions.
 */
import { randomUUID, randomBytes } from "node:crypto";

// ── Safe JSON (re-exported from no-dep sub-module) ──────────

export type { JsonResult, SafeJsonStringifyOptions } from "./utils/safe-json";
export {
  safeJsonParse,
  safeJsonStringify,
  jsonParseOr,
  jsonStringifyOr,
  isJsonString,
} from "./utils/safe-json";

// ── ID Generation ─────────────────────────────────────────────

/** Create a DB-safe UUID string (v4, RFC 4122) */
export const uid = (): string => randomUUID();

/** Create a cryptographically secure random token (32 hex chars = 128 bits) */
export const secureToken = (): string => randomBytes(16).toString("hex");

// ── Error Helpers ─────────────────────────────────────────────

/** Extract a safe Error object from an unknown thrown value */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Extract error message string from an unknown thrown value */
export function toErrorMessage(error: unknown): string {
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
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
