// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * KEEP LOCAL (not one of the four provider gaps, but the same principle).
 * giwt ships this check at node_modules/giwt/scripts/. It is NOT a drop-in:
 * its scan covers only the src TS glob and exempts nothing but test files, so
 * against this repo it reports generated DB-type modules and src/db/migrations
 * entries that this script exempts via the generated banner and the migrations
 * rule. Verified on the pinned build — --strict flags 10 files (db-schemas.ts,
 * insert-helpers.ts, schema-{core,story,character,manifest}.ts, 001_init.ts and
 * 3 real offenders) where this script flags 3, so repointing the gate would
 * block on 7 non-defects.
 *
 * CODE-line guard for source files.
 *
 * Surfaces source files exceeding the 250L soft ceiling so agents can split
 * them before they become god-modules. Mirrors
 * `docs/meta/code-practices-improvements/04-code-organization-and-splitting.md`
 * (the <200L AGENTS.md convention, 250L soft limit).
 *
 * The budget counts CODE lines only: comment and documentation lines do not
 * count toward it. A file's complexity is its executable lines, so a JSDoc
 * sweep adding `@param`/`@returns` must not push an already-fine module over
 * budget. Comment detection is the TypeScript scanner's, so a `//` inside a
 * string literal, a URL or a regex is CODE, and a trailing comment never
 * demotes the code line it sits on.
 *
 * Exclusions:
 * - Test files (`*.test.ts`) and migrations may legitimately be large.
 * - Auto-generated files (carry `DO NOT EDIT MANUALLY` banner emitted by
 *   the `db:sync-*` generators) are owned by their generator, not hand-split.
 * - Per-file override: a top-of-file `// size-allow: N` directive (within the
 *   first 512 characters, alongside the SPDX header) REPLACES that file's
 *   budget — any N, raise or lower, uncapped. Use sparingly — the default 250L
 *   is the AGENTS.md default budget.
 *
 * Modes:
 * - Default (no flags): warns and exits 0 — non-blocking nudge
 * - `--strict`: exits 1 for any file over the limit — CI gate
 * - `--limit N`: override the 250L threshold
 *
 * Usage: `bun run scripts/check-file-size.ts [--strict] [--limit N]`
 */
import { Glob, } from "bun";
import ts from "typescript";
import {
  flag,
  integer,
  object,
  option,
  runScript,
  withDefault,
} from "../src/cli/parser";

// src is the original scope; scripts/ and plugins/ joined when their drift was
// called out (see BUG-size-strict-pre-existing-dev-drift). tests/ stays exempt:
// flows and helpers are test specifications. scripts/worktree/ is the giwt fork
// pending deletion (AGENTS.md "Related: loop-lore's fork") — splitting it is
// wasted work, the canonical giwt files carry the fix now.
const GLOBS = ["src/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs", "plugins/**/*.ts",];

// Auto-generated files carry this banner (emitted by scripts/generate-db-types.ts
// and scripts/generate-schema-manifest.ts). They are owned by their generator;
// splitting them by hand would be overwritten on the next db:sync-* run.
const GENERATED_MARKER = "DO NOT EDIT MANUALLY";

// Per-file override: a `// size-allow: N` directive inside the header window
// REPLACES that file's budget. Scoped to the first 512 CHARACTERS (not lines)
// so it can sit next to the SPDX banner without polluting the body.
const SIZE_ALLOW_RE = /^\/\/\s*size-allow:\s*(\d+)\s*$/m;
const HEADER_BYTES = 512;

// Whitespace-only characters tallyLines skips, and the one line terminator.
const TAB = 9;
const NEWLINE = 10;
const CARRIAGE_RETURN = 13;
const SPACE = 32;

/**
 * Lines that carry code vs. lines that carry only comments.
 *
 * A line is CODE when it holds at least one non-whitespace character outside a
 * comment; otherwise a line holding only a comment is a COMMENT line, and a
 * blank line is neither. So `code + comment` is the non-blank line count, a
 * trailing comment costs nothing (`const x = 1; // note` is one CODE line), and
 * 500 lines of JSDoc above 30 lines of code counts as 30.
 *
 * Comment ranges come from `ts.createScanner`, NOT from a `//` string test: the
 * scanner knows when a `//` sits inside a string, template or regex, so URLs
 * and regex literals count as code. Its raw token stream mis-lexes a template
 * literal's tail (it never rescans template tokens), which can only leave a
 * comment UNrecognised there — that over-counts code, the safe direction for a
 * size gate.
 *
 * The scan classifies token KINDS; the tally below classifies CHARACTERS, so a
 * line holding only a closing brace (`}`, `);`, `},`) still counts as code — an
 * AST walk over node start positions misses those, and a `getChildren()` walk
 * re-counts JSDoc.
 *
 * @param text - full file contents
 * @returns the code-line and comment-line counts
 */
export function tallyLines(text: string,): { code: number; comment: number } {
  const isComment = new Uint8Array(text.length,);
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
    () => {},
  );
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      isComment.fill(1, scanner.getTokenStart(), scanner.getTokenEnd(),);
    }
  }

  let code = 0;
  let comment = 0;
  let sawCode = false;
  let sawComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i,);
    if (ch === NEWLINE) {
      if (sawCode) { code++; }
      else if (sawComment) { comment++; }
      sawCode = false;
      sawComment = false;
    } else if (ch !== SPACE && ch !== TAB && ch !== CARRIAGE_RETURN) {
      if (isComment[i] === 1) { sawComment = true; }
      else { sawCode = true; }
    }
  }
  // A trailing newline TERMINATES the last line, it does not start a new one,
  // so the final partial line is only tallied when the file lacks that newline.
  if (sawCode) { code++; }
  else if (sawComment) { comment++; }
  return { code, comment, };
}

/**
 * Whether a file's CODE lines exceed its budget. A file sitting exactly at its
 * limit is compliant; only going over fails.
 *
 * @param code - the file's code-line count, from tallyLines
 * @param limit - the line budget to compare against
 * @returns true when the file is over budget
 */
export function exceedsSizeAllow(code: number, limit: number,): boolean {
  return code > limit;
}

/**
 * Effective line budget for a file: its `// size-allow: N` header directive
 * when present, else `limit`. There is no cap on N — a cohesive file declares
 * the budget it needs, and the gate only enforces that the file fits it.
 *
 * @param text - full file contents
 * @param limit - default budget when the file declares none
 * @returns the budget to compare against
 */
export function sizeAllowFor(text: string, limit: number,): number {
  const allowMatch = text.slice(0, HEADER_BYTES,).match(SIZE_ALLOW_RE,);
  return allowMatch ? parseInt(allowMatch[1], 10,) : limit;
}

// CLI guard: only scan when executed directly, so the helpers above stay
// importable by check-file-size.test.ts.
if (import.meta.main) {
  const { strict: STRICT, limit: LIMIT, } = runScript(
    object({
      strict: withDefault(flag("--strict",), false,),
      limit: withDefault(option("--limit", integer(),), 250,),
    },),
    {
      programName: "check-file-size",
      brief: "Report source files over the per-file CODE-line budget (250 code lines by default).",
      help: "option",
    },
  );

  let errors = 0;
  let warnings = 0;
  for (const pattern of GLOBS) {
    const glob = new Glob(pattern,);
    for await (const file of glob.scan()) {
      if (
        file.includes(".test.",) || file.includes("/migrations/",) || file.startsWith("scripts/worktree/",)
      ) { continue; }
      const text = await Bun.file(file,).text();
      if (text.includes(GENERATED_MARKER,)) { continue; }
      const fileLimit = sizeAllowFor(text, LIMIT,);
      const { code, comment, } = tallyLines(text,);
      if (exceedsSizeAllow(code, fileLimit,)) {
        const tally = `${code + comment} lines (${code} code, ${comment} comment)`;
        const msg = `[size] ${file}: ${tally} — limit ${fileLimit}`;
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
    console.error(`[size] ${errors} file(s) over ${LIMIT} code lines - CI gate failed.`,);
    process.exit(1,);
  }

  if (warnings > 0) {
    console.warn(`[size] ${warnings} file(s) over ${LIMIT} code lines. Non-blocking - split when convenient.`,);
  }
  process.exit(0,);
}
