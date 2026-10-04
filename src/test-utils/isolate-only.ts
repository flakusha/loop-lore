// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, } from "bun:test";
import { readFileSync, } from "node:fs";

/**
 * True when a `bun test` argv asks for per-file isolation: `--isolate` gives
 * every file a fresh global and module registry, and `--parallel` does the
 * same (each worker hands the next file a fresh global). NUL-anchored so
 * `--no-isolate` and paths that merely contain the word do not match.
 * @param cmdline NUL-separated argv of the `bun test` process
 * @returns whether that invocation isolates test files from each other
 */
export const requestsPerFileIsolation = (cmdline: string,): boolean =>
  /(^|\0)(--isolate|--parallel)(=|\0|$)/.test(cmdline,);

let runnerCmdline = "";

// Where procfs is unavailable the read throws and `runnerCmdline` stays "",
// which makes a bare `bun test --isolate <file>` indistinguishable from a
// shared run — the suite then skips out loud rather than vanishing.
try {
  runnerCmdline = readFileSync("/proc/self/cmdline", "utf8",);
} catch {
  runnerCmdline = "";
}

/**
 * True when each test file owns a fresh global and module registry, i.e. when
 * Bun runs the suite with per-file isolation.
 *
 * `bun test` exposes no in-process signal for `--isolate`: with and without the
 * flag the process env, `process.argv`, the `globalThis` key set, the
 * `globalThis` symbol set and every `Bun.*` key are byte-identical (measured,
 * bun 1.4.2), so a fresh-global marker cannot tell an isolated single file
 * from a shared single file. The runner's own argv is the only reliable
 * carrier; `BUN_TEST_WORKER_ID` is the portable half of it, set by Bun
 * exactly when `--parallel` was passed.
 *
 * A shared-process run (`bun test src/`, `bun test --coverage`) carries
 * neither, so guarded suites skip. Where procfs is missing a bare
 * `bun test --isolate <file>` is indistinguishable from a shared run: the
 * suite skips and says so out loud instead of vanishing from the summary.
 */
export const ISOLATED = process.env.BUN_TEST_WORKER_ID !== undefined || requestsPerFileIsolation(runnerCmdline,);
  const globals = globalThis as Record<string, unknown>;

/**
 * True only under `bun run test:unit` (package.json: `bun test --parallel=4
 * src/ --isolate`). `bun run test:coverage` ALSO runs `--parallel=4 --isolate`,
 * so `ISOLATED` is true there too — what separates the two is this env-var
 * key, not the isolation mode. Suites whose `mock.module` doubles pin a module
 * to fixed fakes (provider registry) must not run under the coverage gate's
 * own stubs, hence the separate, deliberately narrower signal.
 */
export const STRICTLY_ISOLATED = process.env.npm_lifecycle_event === "test:unit";

/**
 * `describe` only under the per-file `--isolate` gate, otherwise
 * `describe.skip`. For suites whose `mock.module` doubles cannot survive a
 * shared process (fixed-fake pins that poison later files).
 */
export const describeOrSkip = ISOLATED ? describe : describe.skip;

/**
 * `describe` only under the strict `test:unit` isolation gate.
 */
export const describeOrSkipStrict = STRICTLY_ISOLATED ? describe : describe.skip;
