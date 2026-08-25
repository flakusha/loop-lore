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
 * Exclusions:
 * - Test files (`*.test.ts`) and migrations may legitimately be large.
 * - Auto-generated files (carry `DO NOT EDIT MANUALLY` banner emitted by
 *   the `db:sync-*` generators) are owned by their generator, not hand-split.
 * - Per-file override: a top-of-file `// size-allow: N` directive (within the
 *   first 5 lines, alongside the SPDX header) sets a larger line budget for
 *   that one file. Use sparingly — the default 250L is the AGENTS.md ceiling.
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

// Auto-generated files carry this banner (emitted by scripts/generate-db-types.ts
// and scripts/generate-schema-manifest.ts). They are owned by their generator;
// splitting them by hand would be overwritten on the next db:sync-* run.
const GENERATED_MARKER = "DO NOT EDIT MANUALLY";

// Per-file override: a `// size-allow: N` directive in the first 5 lines
// bumps the budget for that file. Scoped to the file header (first 512 chars)
// so it can sit next to the SPDX banner without polluting the body.
const SIZE_ALLOW_RE = /^\/\/\s*size-allow:\s*(\d+)\s*$/m;
const HEADER_BYTES = 512;

let errors = 0;
let warnings = 0;
for await (const file of glob.scan()) {
  if (file.includes(".test.",) || file.includes("/migrations/",)) { continue; }
  const text = await Bun.file(file,).text();
  if (text.includes(GENERATED_MARKER,)) { continue; }
  const allowMatch = text.slice(0, HEADER_BYTES,).match(SIZE_ALLOW_RE,);
  const fileLimit = allowMatch ? parseInt(allowMatch[1], 10,) : LIMIT;
  const lines = text.split("\n",).length;
  if (lines > fileLimit) {
    const msg = `[size] ${file}: ${lines}L exceeds ${fileLimit}L limit`;
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
