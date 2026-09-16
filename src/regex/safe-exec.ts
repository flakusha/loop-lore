// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hardening helpers for regex-based pipeline entry points.
 *
 * - `MAX_INPUT_CHARS` — bound for any user-supplied input fed to the regex
 *   pipeline. Beyond this size the entry helper throws a typed error so a
 *   hostile client can't amplify CPU cost by sending very long inputs.
 * - `assertInputSize(input)` — pipeline-entry guard.
 * - `safeRegexExec(pattern, input)` — wraps `pattern.exec(input)` and resets
 *   `pattern.lastIndex` to 0 on every call so global-flagged patterns reused
 *   from a shared module don't carry stale cursors between invocations.
 *
 * @module regex/safe-exec
 */

/** Hard cap on pipeline inputs (characters). Above this we reject eagerly. */
export const MAX_INPUT_CHARS = 100_000;

/** Thrown when a regex pipeline input exceeds the size cap. */
export class RegexInputTooLargeError extends Error {
  readonly actualLength: number;
  readonly limit: number;

  constructor(actualLength: number, limit: number = MAX_INPUT_CHARS,) {
    super(`Regex pipeline input exceeds ${limit} characters (got ${actualLength})`,);
    this.name = "RegexInputTooLargeError";
    this.actualLength = actualLength;
    this.limit = limit;
  }
}

/**
 * Pipeline-entry guard. Reject inputs larger than {@link MAX_INPUT_CHARS}.
 * Throws {@link RegexInputTooLargeError} (typed error) — never a generic Error.
 */
export function assertInputSize(input: string, limit: number = MAX_INPUT_CHARS,): void {
  if (typeof input !== "string") {
    throw new TypeError("Regex pipeline input must be a string",);
  }
  if (input.length > limit) {
    throw new RegexInputTooLargeError(input.length, limit,);
  }
}

/**
 * Exec `pattern` against `input` after zeroing `pattern.lastIndex`.
 *
 * Global-flagged patterns (`/.../g`, `/.../y`) carry an internal cursor; when
 * shared across callsites a stale `lastIndex` silently skips matches or, with
 * `.test()`, returns the wrong answer. Resetting on every call costs one
 * assignment and is the only way to make a module-level regex safe to reuse.
 *
 * ponytail: Bun regex timeout isn't exposed to JS yet. If a runtime lands a
 * pattern-level abort path, thread it through here. Add when Bun ships it.
 */
export function safeRegexExec(pattern: RegExp, input: string,): RegExpExecArray | null {
  pattern.lastIndex = 0;
  return pattern.exec(input,);
}

/**
 * String-returning variant: matches `String.prototype.match` semantics.
 * Resets `lastIndex` and returns the raw `match` array (or null).
 */
export function safeRegexMatch(pattern: RegExp, input: string,): RegExpMatchArray | null {
  pattern.lastIndex = 0;
  return input.match(pattern,);
}
