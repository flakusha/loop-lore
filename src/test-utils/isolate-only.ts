// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, } from "bun:test";

/**
 * True when each test file owns a fresh global and module registry, i.e. when
 * Bun runs the suite with per-file isolation.
 *
 * Bun sets `BUN_TEST_WORKER_ID` inside every `--parallel` worker, and
 * `--parallel` implies `--isolate` — so that variable is the reliable signal.
 * A bare `bun test src/` runs every file in one shared process and leaves it
 * unset.
 *
 * Verified on bun 1.4.2 (2026-10-04): `bun test` → unset, `bun test --isolate`
 * → STILL unset, `bun test --parallel=4 --isolate` → set. `--isolate` alone is
 * NOT the signal; only `--parallel` is. Every shipped runner passes
 * `--parallel` (`test`, `test:unit`, `test:coverage`, and ci.yml), so no guarded
 * suite is lost under normal use — but a hand-run `bun test <file>` DOES skip
 * them and still exits 0, so a green bare run is not evidence a guarded suite
 * ran. Read the pass/skip counts, not the exit code.
 *
 * Do NOT key this on `npm_lifecycle_event`. CI runs
 * `bun test --parallel=4 src/ --isolate` (.github/workflows/ci.yml) with no npm
 * lifecycle var set, so that proxy reported "not isolated" for a genuinely
 * isolated run and silently skipped every guarded suite.
 */
export const ISOLATED = process.env.BUN_TEST_WORKER_ID !== undefined;

/**
 * `describe` when run via the isolated gate, otherwise `describe.skip`. Lets a
 * plain `bun test src/` skip tests that intentionally replace shared modules
 * via `mock.module` — those mocks leak across files without `--isolate`.
 */
export const describeOrSkip = ISOLATED ? describe : describe.skip;

/**
 * True only under `bun run test:unit` (`bun test src/ --isolate`, one module
 * registry per file). `bun run test:coverage` shares one process across all
 * files, so stubs that pin a module to fixed fakes (provider registry) must
 * stay off there — even though ISOLATED is also set for that run.
 */
export const STRICTLY_ISOLATED = process.env.npm_lifecycle_event === "test:unit";

/**
 * `describe` only under the per-file `--isolate` gate, otherwise
 * `describe.skip`. For suites whose `mock.module` doubles cannot survive a
 * shared process (fixed-fake pins that poison later files).
 */
export const describeOrSkipStrict = STRICTLY_ISOLATED ? describe : describe.skip;
