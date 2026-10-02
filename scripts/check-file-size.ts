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
// src is the original scope; scripts/ and plugins/ joined when their drift was
// called out (see BUG-size-strict-pre-existing-dev-drift). tests/ stays exempt:
// flows and helpers are test specifications. scripts/worktree/ is the giwt fork
// pending deletion (AGENTS.md "Related: loop-lore's fork") — splitting it is
// wasted work, the canonical giwt files carry the fix now.
const GLOBS = ["src/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs", "plugins/**/*.ts"];

// Auto-generated files carry this banner (emitted by scripts/generate-db-types.ts
// and scripts/generate-schema-manifest.ts). They are owned by their generator;
// splitting them by hand would be overwritten on the next db:sync-* run.
const GENERATED_MARKER = "DO NOT EDIT MANUALLY";

// Per-file override: a `// size-allow: N` directive in the first 5 lines
// bumps the budget for that file. Scoped to the file header (first 512 chars)
// so it can sit next to the SPDX banner without polluting the body.
const SIZE_ALLOW_RE = /^\/\/\s*size-allow:\s*(\d+)\s*$/m;
const HEADER_BYTES = 512;

/**
 * Count real content lines.
 *
 * A trailing newline TERMINATES the last line; it does not begin a new one.
 * `split("\n").length` counts that empty tail as a line, so every
 * newline-terminated file was reported one line over its true size and was
 * failed even when it sat exactly at its declared `size-allow`.
 *
 * Stripping the single trailing newline — rather than counting "\n"
 * occurrences the way `wc -l` does — also counts the final partial line of a
 * file that has no trailing newline. `wc -l` under-reports those by one, which
 * would only trade this bug for its mirror image.
 *
 * @param text - full file contents
 * @returns number of lines of content
 */
export function countContentLines(text: string,): number {
  if (text === "") { return 0; }
  return text.split("\n",).length - (text.endsWith("\n",) ? 1 : 0);
}

/**
 * Whether a file's content lines exceed its budget. A file sitting exactly at
 * its limit is compliant; only going over fails.
 *
 * @param text - full file contents
 * @param limit - the line budget to compare against
 * @returns true when the file is over budget
 */
export function exceedsSizeAllow(text: string, limit: number,): boolean {
  return countContentLines(text,) > limit;
}

// CLI guard: only scan when executed directly, so the helpers above stay
// importable by check-file-size.test.ts.
if (import.meta.main) {
  let errors = 0;
  let warnings = 0;
  for (const pattern of GLOBS) {
    const glob = new Glob(pattern,);
    for await (const file of glob.scan()) {
      if (file.includes(".test.",) || file.includes("/migrations/",) || file.startsWith("scripts/worktree/",)) { continue; }
      const text = await Bun.file(file,).text();
      if (text.includes(GENERATED_MARKER,)) { continue; }
      const allowMatch = text.slice(0, HEADER_BYTES,).match(SIZE_ALLOW_RE,);
      const fileLimit = allowMatch ? parseInt(allowMatch[1], 10,) : LIMIT;
      if (exceedsSizeAllow(text, fileLimit,)) {
        const msg = `[size] ${file}: ${countContentLines(text,)}L exceeds ${fileLimit}L limit`;
        if (STRICT) {
          console.error(msg + " - must split (see 04)",);
          errors++;
        } else {
          console.warn(msg + " - consider splitting (see 04)",);
          warnings++;
        }
      }
    }
  }

  if (STRICT && errors > 0) {
    console.error(`[size] ${errors} file(s) over ${LIMIT}L - CI gate failed.`,);
    process.exit(1,);
  }

  if (warnings > 0) {
    console.warn(`[size] ${warnings} file(s) over ${LIMIT}L. Non-blocking - split when convenient.`,);
  }
  process.exit(0,);
}
