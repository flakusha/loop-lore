// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, } from "bun:test";

/**
 * Detect whether an imported function is the real implementation or a
 * process-global test double.
 * @param fn - imported function, possibly a stub
 * @param realName - `name` of the real implementation
 * @returns `true` when `fn` is a function whose `.name` matches `realName`.
 */
export function isPristine(fn: unknown, realName: string,): boolean {
  return typeof fn === "function" && (fn as { name?: unknown }).name === realName;
}

/**
 * Return `describe` when `fn` is the real implementation, otherwise `describe.skip`.
 * @param fn - imported function, possibly a stub
 * @param realName - `name` of the real implementation
 * @returns the `describe` constructor when pristine, `describe.skip` otherwise.
 */
export function describePristine(fn: unknown, realName: string,) {
  return isPristine(fn, realName,) ? describe : describe.skip;
}
