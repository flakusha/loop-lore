// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Line-count guard for source files.
 *
 * Surfaces source files exceeding the 250L soft ceiling so agents can split
 * them before they become god-modules. Mirrors
 * `docs/meta/code-practices-improvements/04-code-organization-and-splitting.md`
 * (the <200L AGENTS.md convention, 250L soft limit).
 *
 * Modes:
 * - Default (no flags): warns and exits 0 — non-blocking nudge
 * - `--strict`: exits 1 for any file over the limit — CI gate
 * - `--limit N`: override the 250L threshold
 *
 * Usage: `bun run scripts/check-file-size.ts [--strict] [--limit N]`
 */
import { Glob, } from "bun";

const args = process.argv.slice(2,);
const STRICT = args.includes("--strict",);
const LIMIT_ARG = args.find((a,) => a.startsWith("--limit=",));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=",)[1], 10,) : 250;
const glob = new Glob("src/**/*.ts",);

let errors = 0;
let warnings = 0;
for await (const file of glob.scan()) {
  if (file.includes(".test.",) || file.includes("/migrations/",)) { continue; }
  const text = await Bun.file(file,).text();
  const lines = text.split("\n",).length;
  if (lines > LIMIT) {
    const msg = `[size] ${file}: ${lines}L exceeds ${LIMIT}L limit`;
    if (STRICT) {
      console.error(msg + " — must split (see 04)",);
      errors++;
    } else {
      console.warn(msg + " — consider splitting (see 04)",);
      warnings++;
    }
  }
}

if (STRICT && errors > 0) {
  console.error(`[size] ${errors} file(s) over ${LIMIT}L — CI gate failed.`,);
  process.exit(1,);
}

if (warnings > 0) {
  console.warn(`[size] ${warnings} file(s) over ${LIMIT}L. Non-blocking — split when convenient.`,);
}
process.exit(0,);
