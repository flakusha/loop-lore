// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `--gates`/`--skip-gates` application for the gate table plus the
 * `--profile` skip-only layer: validates names (exiting with hints on unknown
 * or protected ones) and mutates the table down to the selected subset.
 * Invoked at gates.mjs init, after every gate entry (including lazily built
 * ones) is registered.
 */

import { GATES_FILTER, PROFILE, SKIP_GATES_FILTER, } from "./context.mjs";
import { PROFILE_SKIPPABLE_GATES, PROFILE_SKIPS, } from "./gate-table.mjs";

/** This run's profile-induced skips — empty for all five profiles today. */
export const PROFILE_SKIPPED_GATES = PROFILE_SKIPS[PROFILE] ?? [];

/**
 * Pure partition of a profile's declared skips into names absent from the
 * live registry (`stale`) and names outside the capability allowlist
 * (`protected`). No I/O and no exit: tests drive this directly; the caller
 * turns a non-empty bucket into a usage error.
 * @param {string[]} skips - declared profile skip names
 * @param {Iterable<string>} available - live registry names
 * @param {Iterable<string>} skippable - capability allowlist
 * @returns {{ stale: string[], protected: string[] }}
 */
export function invalidProfileSkips(skips, available, skippable,) {
  const availableSet = new Set(available,), skippableSet = new Set(skippable,);
  return {
    stale: skips.filter((name,) => !availableSet.has(name,)),
    protected: skips.filter((name,) => availableSet.has(name,) && !skippableSet.has(name,)),
  };
}

// ── Apply selective gate filter ────────────────────────────────
// Runs after the `coverage - per-module line %` entry is registered so
// the filter sees every check name. Validation: any unknown name in
// either flag exits non-zero with a hint listing available names. A profile
// is validated against BOTH the live registry and the capability allowlist,
// so a stale or protected name can never quietly disable enforcement.
export function applyGateFilter(checks,) {
  const available = Object.keys(checks,).sort();
  const availableSet = new Set(available,);
  const { stale, protected: forbidden, } = invalidProfileSkips(
    PROFILE_SKIPPED_GATES,
    availableSet,
    PROFILE_SKIPPABLE_GATES,
  );
  if (stale.length > 0) {
    console.error(
      `error: profile ${PROFILE} names gate(s) absent from the registry: ${
        stale.map((n,) => JSON.stringify(n,)).join(", ",)
      }`,
    );
    process.exit(2,);
  }
  if (forbidden.length > 0) {
    console.error(
      `error: profile ${PROFILE} may not skip protected gate(s): ${
        forbidden.map((n,) => JSON.stringify(n,)).join(", ",)
      }`,
    );
    process.exit(2,);
  }
  if (!GATES_FILTER && !SKIP_GATES_FILTER && PROFILE_SKIPPED_GATES.length === 0) { return; }
  const requested = GATES_FILTER || SKIP_GATES_FILTER || [];
  const unknown = requested.filter((n,) => !availableSet.has(n,));
  if (unknown.length > 0) {
    console.error(
      `error: unknown gate name(s): ${unknown.map((n,) => JSON.stringify(n,)).join(", ",)}`,
    );
    console.error("available gates:",);
    for (const n of available) { console.error(`  ${n}`,); }
    process.exit(2,);
  }
  if (GATES_FILTER) {
    const selectedSet = new Set(GATES_FILTER,);
    for (const name of Object.keys(checks,)) {
      if (!selectedSet.has(name,)) { delete checks[name]; }
    }
    console.error(`gates filter: whitelisted ${GATES_FILTER.length} of ${available.length} gates`,);
  } else {
    const skipSet = new Set([...requested, ...PROFILE_SKIPPED_GATES,],);
    for (const name of Object.keys(checks,)) {
      if (skipSet.has(name,)) { delete checks[name]; }
    }
    console.error(
      `gates filter: skipped ${skipSet.size}; running ${Object.keys(checks,).length} of ${available.length} gates`,
    );
  }
  if (Object.keys(checks,).length === 0) {
    console.error("error: --gates/--skip-gates left no checks to run",);
    process.exit(2,);
  }
  if (PROFILE !== "full") {
    console.error(
      `gates filter: profile=${PROFILE} skipped ${PROFILE_SKIPPED_GATES.length}; running ${
        Object.keys(checks,).length
      } of ${available.length} gates`,
    );
  }
}
