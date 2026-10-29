// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared helpers for the pi-tui component tests: assertions run on rendered
 * rows, so a plain SGR stripper is all that is needed.
 */

/** Remove SGR escape sequences from a rendered row. */
export function stripAnsi(row: string,): string {
  return row.replace(/\x1b\[[0-9;]*m/g, "",);
}

/**
 * Poll `cond` across macrotask rounds until it holds, so multi-stage async
 * chains (stubbed-fetch flows, promise chains) settle deterministically
 * instead of relying on a fixed number of `tick()` rounds. Bounded by
 * `rounds` so a genuinely broken chain still fails fast rather than hanging.
 * @param cond - condition to poll
 * @param rounds - max macrotask rounds to wait (default 500)
 */
export async function until(cond: () => boolean, rounds = 500,): Promise<void> {
  for (let i = 0; i < rounds && !cond(); i++) { await tick(); }
}

/** Strip ANSI from every row of a render result. */
export function stripRows(rows: readonly string[],): string[] {
  return rows.map((row,) => stripAnsi(row,));
}

/**
 * Let pending promise callbacks (stubbed fetches) settle before asserting.
 * @param count - macrotask rounds to wait (default 1)
 */
export async function tick(count = 1,): Promise<void> {
  for (let i = 0; i < count; i++) {
    const { promise, resolve, } = Promise.withResolvers<void>();
    setImmediate(resolve,);
    await promise;
  }
}
