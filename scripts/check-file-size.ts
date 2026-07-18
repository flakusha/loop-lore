// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Soft line-count guard (non-blocking).
 *
 * Surfaces source files exceeding the 250L soft ceiling so agents can split
 * them before they become god-modules. Mirrors
 * `docs/meta/code-practices-improvements/04-code-organization-and-splitting.md`
 * (the <200L AGENTS.md convention, 250L soft limit).
 *
 * Exits 0 — it never blocks the pre-commit pipeline or CI. It is a nudge,
 * not a gate. The real size cap is indirect: `sonarjs/cognitive-complexity`
 * (warn@20) in `eslint.config.mjs`.
 */
import { Glob } from "bun";

const LIMIT = 250;
const glob = new Glob("src/**/*.ts");

let warnings = 0;
for await (const file of glob.scan()) {
  if (file.includes(".test.") || file.includes("/migrations/")) continue;
  const text = await Bun.file(file).text();
  const lines = text.split("\n").length;
  if (lines > LIMIT) {
    console.warn(`[size] ${file}: ${lines}L exceeds ${LIMIT}L soft limit — consider splitting (see 04)`);
    warnings++;
  }
}

if (warnings > 0) {
  console.warn(`[size] ${warnings} file(s) over ${LIMIT}L. Non-blocking — split when convenient.`);
}
process.exit(0);
