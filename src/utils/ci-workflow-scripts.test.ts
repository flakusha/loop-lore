// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { expect, test, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import pkg from "../../package.json" with { type: "json", };

/**
 * Pin for the BUG where `.github/workflows/*` steps invoked `bun run <script>`
 * targets that had been dropped from `package.json` (`lint:css`, `lint:html`,
 * `test:unit:parallel`). `bun run <missing>` exits 1, so those CI steps failed
 * unconditionally and the drift stayed invisible until a run reached them.
 * Every script name referenced by a workflow MUST exist in the `scripts` block.
 */

const WORKFLOWS_DIR = join(import.meta.dir, "..", "..", ".github", "workflows",);

/** Captures the script name of a `bun run <script>` invocation. */
const RUN_SCRIPT = /\bbun run ([a-zA-Z0-9:_-]+)/gu;

test("every `bun run <script>` in .github/workflows exists in package.json scripts", () => {
  const { scripts, } = pkg;
  const missing: string[] = [];
  let invocations = 0;

  for (const entry of readdirSync(WORKFLOWS_DIR,)) {
    if (!entry.endsWith(".yml",) && !entry.endsWith(".yaml",)) { continue; }
    const text = readFileSync(join(WORKFLOWS_DIR, entry,), "utf-8",);
    for (const match of text.matchAll(RUN_SCRIPT,)) {
      invocations += 1;
      const script = match[1];
      if (!script || !Object.hasOwn(scripts, script,)) {
        missing.push(`${entry}: bun run ${script ?? "<empty>"}`,);
      }
    }
  }

  // Guard against a broken selector silently matching nothing.
  expect(invocations,).toBeGreaterThan(10,);
  expect(missing,).toEqual([],);
});
