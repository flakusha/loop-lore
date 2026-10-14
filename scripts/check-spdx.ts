// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * KEEP LOCAL. giwt now ships `spdx-check` / `spdx-fix` commands, but they
 * read REUSE.toml with a DIFFERENT dialect than this repo's: giwt's
 * parseReuseToml looks for `paths` / `license` / `copyright` keys, while
 * REUSE.toml here uses `path` plus SPDX-FileCopyrightText /
 * SPDX-License-Identifier. Verified against the pinned build:
 *   `giwt spdx-check` -> "REUSE.toml has no [[annotations]] blocks — nothing
 *   to check" and exits 0, i.e. it silently checks NOTHING here.
 * Two further gaps even if the dialect matched: giwt's exclusion list has no
 * generated-DB-artifact rules (this file exempts src/db/schema*.ts,
 * src/validation/db-schemas.ts, src/test-utils/insert-helpers.ts so the
 * `db - schema gate` does not report STALE), and its copyright check
 * substring-matches rule.copyright rather than requiring the
 * SPDX-FileCopyrightText tag this repo's policy mandates on every covered
 * file. Do not repoint `spdx:check`/`spdx:fix` at giwt unless upstream parses
 * this REUSE.toml dialect AND carries the generated-artifact exemptions.
 *
 * SPDX license header guard — reads REUSE.toml for per-directory rules.
 *
 * Parses [[annotations]] blocks from REUSE.toml, converts path globs to
 * regex matchers, and validates that each checked file's first-line
 * SPDX-License-Identifier matches the rule for its path.
 *
 * FileCopyrightText is also checked (must contain "Loop Lore Contributors").
 *
 * Modes:
 *   - Default (no args): scans the whole tracked tree (git ls-files).
 *   - --staged: checks only staged files (pre-commit hook fast path).
 *   - --fix: applies (or replaces) SPDX headers in-place; preserves
 *     shebang lines and YAML frontmatter blocks.
 *   - Explicit paths: checks exactly those files.
 *   - Non-blocking: warns about missing/invalid headers, exits 0.
 *   - SPDX_CHECK=1 (blocking): exits 1 on any violation.
 *
 * Usage:
 *   bun run scripts/check-spdx.ts                   # whole tree, warn-only
 *   bun run scripts/check-spdx.ts --staged          # staged files, warn-only
 *   bun run scripts/check-spdx.ts --fix             # apply headers, whole tree
 *   SPDX_CHECK=1 bun run scripts/check-spdx.ts --staged  # staged, blocking
 *   bun run scripts/check-spdx.ts src/foo.ts docs/bar.md  # explicit files
 */
import { argument, flag, multiple, object, runScript, string, withDefault, } from "../src/cli/parser";
import { checkHeader, parseReuseToml, } from "./lib/reuse-toml.ts";
import {
  getStagedFiles,
  getTrackedFiles,
  hasCheckableExtension,
  isExcluded,
} from "./lib/spdx-discovery.ts";
import { fixFiles, } from "./lib/spdx-fix.ts";

// ── Main ─────────────────────────────────────────────────────────

const BLOCKING = process.env.SPDX_CHECK === "1";

async function main() {
  const parser = object({
    fix: withDefault(flag("--fix",), false,),
    staged: withDefault(flag("--staged",), false,),
    files: multiple(argument(string(),),),
  },);
  const args = runScript(parser, {
    programName: "spdx:check",
    brief: "Validate (or --fix) the SPDX headers of tracked, staged, or named files.",
    showDefault: true,
    help: "option",
  },);
  const useFix = args.fix;
  const explicitFiles = args.files;
  const useStaged = args.staged;
  // Load and parse REUSE.toml
  const reusePath = new URL("../REUSE.toml", import.meta.url,).pathname;
  let reuseContent: string;
  try {
    reuseContent = await Bun.file(reusePath,).text();
  } catch {
    console.error("[spdx] Cannot read REUSE.toml - skipping check.",);
    process.exit(0,);
  }

  const rules = parseReuseToml(reuseContent,);
  if (rules.length === 0) {
    console.warn("[spdx] No [[annotations]] in REUSE.toml - nothing to check.",);
    process.exit(0,);
  }
  // Collect files to check
  const files = explicitFiles.length > 0
    ? explicitFiles.filter(hasCheckableExtension,).filter((f,) => !isExcluded(f,))
    : useStaged
    ? await getStagedFiles()
    : await getTrackedFiles();

  if (files.length === 0) {
    console.log("[spdx] No source files to check.",);
    process.exit(0,);
  }

  if (useFix) {
    const changed = await fixFiles(files, rules,);
    console.log(`[spdx:fix] ${changed} file(s) updated (${files.length} scanned).`,);
    process.exit(0,);
  }

  // Check each file
  const violations: { file: string; detail: string }[] = [];

  for (const file of files) {
    // Find matching REUSE.toml rule (first match wins)
    const rule = rules.find((r,) => r.matchers.some((m,) => m.test(file,)));

    if (!rule) {
      violations.push({
        file,
        detail: `no REUSE.toml rule matches - add a [[annotations]] entry for this path`,
      },);
      continue;
    }

    try {
      const content = await Bun.file(file,).text();
      const result = checkHeader(content, rule,);

      if (!result.valid) {
        const issues: string[] = [];
        if (!result.licenseOk) {
          issues.push(
            `license mismatch: file has "${result.foundLicense ?? "(none)"}", expected one of: ${rule.license}`,
          );
        }
        if (!result.copyrightOk) {
          issues.push(
            `copyright mismatch: file has "${result.foundCopyright ?? "(none)"}", expected: ${rule.copyright}`,
          );
        }
        violations.push({ file, detail: issues.join("; ",), },);
      }
    } catch {
      // file may have been deleted between staging and now
    }
  }

  // Report
  if (violations.length === 0) {
    console.log(
      `[spdx] All ${files.length} file(s) have valid SPDX headers (REUSE.toml rules satisfied).`,
    );
    process.exit(0,);
  }

  const msg = [
    `[spdx] ${violations.length} file(s) with invalid SPDX headers:`,
    "",
    ...violations.map((v,) => `  ${v.file}\n    -> ${v.detail}`),
    "",
    "REUSE.toml rules:",
    ...rules.map(
      (r,) => `  ${r.paths.join(", ",)} -> ${r.license}`,
    ),
  ].join("\n",);

  if (BLOCKING) {
    console.error(msg,);
    process.exit(1,);
  } else {
    console.warn(`${msg}\n\nNon-blocking - set SPDX_CHECK=1 to enforce.`,);
    process.exit(0,);
  }
}

main();
