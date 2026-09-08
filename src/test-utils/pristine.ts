// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, } from "bun:test";

/**
 * Process-global `mock.module` stubs cannot be unmocked: an earlier-loaded
 * file's stub (e.g. image-gen's `mockCreateAsset` for
 * `../assets/service/create`) is what every later file imports. Victim
 * suites asserting real behavior must skip instead of failing against the
 * double. The doubles are named differently from the real functions
 * (`mockCreateAsset` vs `createAsset`), so a name check detects the swap.
 * @param fn Imported function, possibly a stub.
 * @param realName `name` of the real implementation.
 */
export function isPristine(fn: unknown, realName: string,): boolean {
  return typeof fn === "function" && (fn as { name?: unknown }).name === realName;
}

/**
 * `describe`, or `describe.skip` when `fn` is a process-global test double.
 * @param fn Imported function, possibly a stub.
 * @param realName `name` of the real implementation.
 */
export function describePristine(fn: unknown, realName: string,) {
  return isPristine(fn, realName,) ? describe : describe.skip;
}
