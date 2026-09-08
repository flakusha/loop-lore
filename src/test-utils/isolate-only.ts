// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, } from "bun:test";

/**
 * `describe` when run via `bun run test:unit` / `bun run check` (which set the
 * `npm_lifecycle_event` env var), otherwise `describe.skip`.
 *
 * Plain `bun test src/` (non-isolated) skips tests that intentionally replace
 * shared modules via `mock.module` — those mocks leak across files without
 * `--isolate` and break unrelated tests. The canonical gate runs with
 * `--isolate` through `bun run`, so coverage is preserved there.
 */
/**
 * True when tests are run via `bun run test:unit` / `bun run check` (which set
 * the `npm_lifecycle_event` env var). Plain `bun test src/` leaves this false.
 */
export const ISOLATED = !!process.env.npm_lifecycle_event;

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
