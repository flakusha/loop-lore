// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `--gates`/`--skip-gates` application for the gate table: validates the
 * requested names (exiting with the available list on unknown ones) and
 * mutates the table down to the selected subset. Invoked at gates.mjs init,
 * after every gate entry (including lazily built ones) is registered.
 */

import { GATES_FILTER, SKIP_GATES_FILTER, } from "./context.mjs";

// ── Apply selective gate filter ────────────────────────────────
// Runs after the `coverage - per-module line %` entry is registered so
// the filter sees every check name. Validation: any unknown name in
// either flag exits non-zero with a hint listing available names.
export function applyGateFilter(checks,) {
  if (!GATES_FILTER && !SKIP_GATES_FILTER) { return; }
  const available = Object.keys(checks,).sort();
  const availableSet = new Set(available,);
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
    const skipSet = new Set(SKIP_GATES_FILTER,);
    for (const name of Object.keys(checks,)) {
      if (skipSet.has(name,)) { delete checks[name]; }
    }
    console.error(
      `gates filter: skipped ${SKIP_GATES_FILTER.length}; running ${
        Object.keys(checks,).length
      } of ${available.length} gates`,
    );
  }
  if (Object.keys(checks,).length === 0) {
    console.error("error: --gates/--skip-gates left no checks to run",);
    process.exit(2,);
  }
}
