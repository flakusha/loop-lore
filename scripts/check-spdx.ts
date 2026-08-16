// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
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
 *   - Explicit paths: checks exactly those files.
 *   - Non-blocking: warns about missing/invalid headers, exits 0.
 *   - SPDX_CHECK=1 (blocking): exits 1 on any violation.
 *
 * Usage:
 *   bun run scripts/check-spdx.ts                   # whole tree, warn-only
 *   bun run scripts/check-spdx.ts --staged          # staged files, warn-only
 *   SPDX_CHECK=1 bun run scripts/check-spdx.ts --staged  # staged, blocking
 *   bun run scripts/check-spdx.ts src/foo.ts docs/bar.md  # explicit files
 */
import { $, } from "bun";

// ── REUSE.toml parser ───────────────────────────────────────────

interface ReuseRule {
  /** Glob patterns (e.g. ["src/**", "docs/**"]) */
  paths: string[];
  /** SPDX license expression (e.g. "MIT", "Apache-2.0 OR MIT") */
  license: string;
  /** Expected copyright holder substring */
  copyright: string;
  /** Compiled regex matchers from paths[] */
  matchers: RegExp[];
  /** Precedence: "aggregate" (default) or "override" */
  precedence: string;
}

/** Convert a REUSE.toml glob to a regex. Handles *, **, and literal paths. */
function globToRegex(glob: string,): RegExp {
  let pattern = glob
    // Escape regex special chars except * and /
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&",)
    // ** → match any path segments (greedy)
    .replace(/\*\*/g, "{{GLOBSTAR}}",)
    // * → match within a single path segment
    .replace(/(?<!\*)\*(?!\*)/g, "[^/]*",)
    // Restore ** as .*
    .replace(/\{\{GLOBSTAR\}\}/g, ".*",);
  return new RegExp(`^${pattern}$`,);
}

/** Parse REUSE.toml into an ordered list of rules. */
function parseReuseToml(content: string,): ReuseRule[] {
  const rules: ReuseRule[] = [];
  const blocks = content.split(/\[\[annotations\]\]/,).slice(1,);

  for (const block of blocks) {
    const paths = extractStringArray(block, "path",);
    if (paths.length === 0) { continue; }

    const license = extractString(block, "SPDX-License-Identifier",) ?? "";
    const copyright = extractString(block, "SPDX-FileCopyrightText",) ?? "";
    const precedence = extractString(block, "precedence",) ?? "aggregate";

    rules.push({
      paths,
      license,
      copyright,
      matchers: paths.map(globToRegex,),
      precedence,
    },);
  }

  return rules;
}

function extractString(block: string, key: string,): string | null {
  // Handle quoted strings: key = "value" or key = 'value'
  const re = new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`,);
  const m = block.match(re,);
  return m?.[1] ?? null;
}

function extractStringArray(block: string, key: string,): string[] {
  // Handle TOML inline arrays: key = ["a", "b"]
  const re = new RegExp(`${key}\\s*=\\s*\\[([^\\]]+)\\]`,);
  const m = block.match(re,);
  if (!m) { return []; }
  return m[1]
    .split(",",)
    .map((s,) => s.trim().replace(/^["']|["']$/g, "",))
    .filter((s,) => s.length > 0);
}

// ── SPDX header validation ──────────────────────────────────────

/** Extract license identifiers from an SPDX expression like "Apache-2.0 OR MIT". */
function parseLicenses(expr: string,): string[] {
  return expr
    .split(/\s+OR\s+/i,)
    .map((s,) => s.trim())
    .filter((s,) => s.length > 0);
}

interface HeaderCheck {
  valid: boolean;
  licenseOk: boolean;
  copyrightOk: boolean;
  foundLicense: string | null;
  foundCopyright: string | null;
}

function checkHeader(content: string, rule: ReuseRule,): HeaderCheck {
  const lines = content.split("\n",).slice(0, 10,);
  const headerBlock = lines.join("\n",);

  // Extract SPDX-License-Identifier from file
  const licenseMatch = headerBlock.match(
    /SPDX-License-Identifier:\s*(.+)/,
  );
  const foundLicense = licenseMatch?.[1]?.trim() ?? null;

  // Extract SPDX-FileCopyrightText from file
  const copyrightMatch = headerBlock.match(
    /SPDX-FileCopyrightText:\s*(.+)/,
  );
  const foundCopyright = copyrightMatch?.[1]?.trim() ?? null;

  // Check license: file's license must be one of the allowed licenses
  const allowedLicenses = parseLicenses(rule.license,);
  const licenseOk = foundLicense !== null &&
    allowedLicenses.some(
      (allowed,) =>
        foundLicense === allowed ||
        foundLicense.includes(allowed,),
    );

  // Check copyright: must contain the expected holder
  const copyrightOk = foundCopyright !== null &&
    foundCopyright.includes("Loop Lore Contributors",);

  return {
    valid: licenseOk && copyrightOk,
    licenseOk,
    copyrightOk,
    foundLicense,
    foundCopyright,
  };
}

// ── File discovery ───────────────────────────────────────────────

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".html",
  ".css",
  ".md",
  ".mdx",
],);

const EXCLUDE_PATTERNS = [
  /\/migrations\//,
  /\/node_modules\//,
  /\/dist\//,
  /\.d\.ts$/,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
];

function isExcluded(filePath: string,): boolean {
  return EXCLUDE_PATTERNS.some((p,) => p.test(filePath,));
}

function hasCheckableExtension(filePath: string,): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".",),);
  return EXTENSIONS.has(ext,);
}

async function getStagedFiles(): Promise<string[]> {
  const result = await $`git diff --cached --name-only --diff-filter=ACM`.text();
  return result
    .split("\n",)
    .filter((f,) => f.trim().length > 0)
    .filter(hasCheckableExtension,)
    .filter((f,) => !isExcluded(f,));
}

/** List every tracked file (git ls-files) with a checkable extension. */
async function getTrackedFiles(): Promise<string[]> {
  const result = await $`git ls-files`.text();
  return result
    .split("\n",)
    .filter((f,) => f.trim().length > 0)
    .filter(hasCheckableExtension,)
    .filter((f,) => !isExcluded(f,));
}

// ── Main ─────────────────────────────────────────────────────────

const BLOCKING = process.env.SPDX_CHECK === "1";

async function main() {
  // Load and parse REUSE.toml
  const reusePath = new URL("../REUSE.toml", import.meta.url,).pathname;
  let reuseContent: string;
  try {
    reuseContent = await Bun.file(reusePath,).text();
  } catch {
    console.error("[spdx] Cannot read REUSE.toml — skipping check.",);
    process.exit(0,);
  }

  const rules = parseReuseToml(reuseContent,);
  if (rules.length === 0) {
    console.warn("[spdx] No [[annotations]] in REUSE.toml — nothing to check.",);
    process.exit(0,);
  }

  // Collect files to check
  const explicitFiles = process.argv.slice(2,).filter((a,) => a !== "--staged");
  const useStaged = process.argv.includes("--staged",);
  const files = explicitFiles.length > 0
    ? explicitFiles.filter(hasCheckableExtension,).filter((f,) => !isExcluded(f,))
    : useStaged
    ? await getStagedFiles()
    : await getTrackedFiles();

  if (files.length === 0) {
    console.log("[spdx] No source files to check.",);
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
        detail: `no REUSE.toml rule matches — add a [[annotations]] entry for this path`,
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
    ...violations.map((v,) => `  ${v.file}\n    → ${v.detail}`),
    "",
    "REUSE.toml rules:",
    ...rules.map(
      (r,) => `  ${r.paths.join(", ",)} → ${r.license}`,
    ),
  ].join("\n",);

  if (BLOCKING) {
    console.error(msg,);
    process.exit(1,);
  } else {
    console.warn(`${msg}\n\nNon-blocking — set SPDX_CHECK=1 to enforce.`,);
    process.exit(0,);
  }
}

main();
