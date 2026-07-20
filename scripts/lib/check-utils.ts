// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared pure functions for script guards.
 * Extracted from check-spdx.ts, check-chaining.ts, check-html-scripts.ts
 * for testability.
 */

// ── check-spdx.ts functions ────────────────────────────────────

export interface ReuseRule {
  paths: string[];
  license: string;
  copyright: string;
  matchers: RegExp[];
  precedence: string;
}

/** Convert a REUSE.toml glob to a regex. Handles *, **, and literal paths. */
export function globToRegex(glob: string): RegExp {
  let pattern = glob
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/(?<!\*)\*(?!\*)/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${pattern}$`);
}

/** Parse REUSE.toml into an ordered list of rules. */
export function parseReuseToml(content: string): ReuseRule[] {
  const rules: ReuseRule[] = [];
  const blocks = content.split(/\[\[annotations\]\]/).slice(1);

  for (const block of blocks) {
    const paths = extractStringArray(block, "path");
    if (paths.length === 0) continue;

    const license = extractString(block, "SPDX-License-Identifier") ?? "";
    const copyright = extractString(block, "SPDX-FileCopyrightText") ?? "";
    const precedence = extractString(block, "precedence") ?? "aggregate";

    rules.push({
      paths,
      license,
      copyright,
      matchers: paths.map(globToRegex),
      precedence,
    });
  }

  return rules;
}

export function extractString(block: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`);
  const m = block.match(re);
  return m?.[1] ?? null;
}

export function extractStringArray(block: string, key: string): string[] {
  const re = new RegExp(`${key}\\s*=\\s*\\[([^\\]]+)\\]`);
  const m = block.match(re);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

/** Extract license identifiers from an SPDX expression like "Apache-2.0 OR MIT". */
export function parseLicenses(expr: string): string[] {
  return expr
    .split(/\s+OR\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface HeaderCheck {
  valid: boolean;
  licenseOk: boolean;
  copyrightOk: boolean;
  foundLicense: string | null;
  foundCopyright: string | null;
}

export function checkHeader(content: string, rule: ReuseRule): HeaderCheck {
  const lines = content.split("\n").slice(0, 10);
  const headerBlock = lines.join("\n");

  const licenseMatch = headerBlock.match(/SPDX-License-Identifier:\s*(.+)/);
  const foundLicense = licenseMatch?.[1]?.trim() ?? null;

  const copyrightMatch = headerBlock.match(/SPDX-FileCopyrightText:\s*(.+)/);
  const foundCopyright = copyrightMatch?.[1]?.trim() ?? null;

  const allowedLicenses = parseLicenses(rule.license);
  const licenseOk =
    foundLicense !== null &&
    allowedLicenses.some(
      (allowed) =>
        foundLicense === allowed || foundLicense.includes(allowed),
    );

  const copyrightOk =
    foundCopyright !== null &&
    foundCopyright.includes("Loop Lore Contributors");

  return {
    valid: licenseOk && copyrightOk,
    licenseOk,
    copyrightOk,
    foundLicense,
    foundCopyright,
  };
}

const EXCLUDE_PATTERNS = [
  /\/migrations\//,
  /\/node_modules\//,
  /\/dist\//,
  /\.d\.ts$/,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".html", ".css", ".md", ".mdx"]);

export function isExcluded(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some((p) => p.test(filePath));
}

export function hasCheckableExtension(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return EXTENSIONS.has(ext);
}

// ── check-chaining.ts functions ─────────────────────────────────

const CHAIN_PATTERN = /\.\w+\(\)(?:\s*)\.\w+\(\)/g;

const SAFE_CHAINS = [
  ".trim().split(",
  ".toString().length",
  ".toString().padStart(",
  ".toString().padEnd(",
  ".toString().toLowerCase(",
  ".toString().toUpperCase(",
  ".trim().toLowerCase(",
  ".trim().toUpperCase(",
  ".trim().length",
  ".toLowerCase().trim(",
  ".ifExists().execute(",
  ".notNull().unique(",
  ".selectAll().execute(",
  ".selectFrom().execute(",
  ".insertInto().execute(",
  ".deleteFrom().execute(",
  ".updateTable().execute(",
];

/** Check if a line contains a method chain violation. */
export function findChainViolation(line: string): boolean {
  CHAIN_PATTERN.lastIndex = 0;
  if (!CHAIN_PATTERN.test(line)) return false;
  // Check if it's a known-safe chain
  for (const safe of SAFE_CHAINS) {
    if (line.includes(safe)) return false;
  }
  return true;
}

// ── check-html-scripts.ts functions ─────────────────────────────

export interface ScriptBlock {
  startLine: number;
  lineCount: number;
  hasMustache: boolean;
  content: string;
}

/** Extract <script> blocks from HTML content. */
export function extractScriptBlocks(html: string): ScriptBlock[] {
  const lines = html.split("\n");
  const blocks: ScriptBlock[] = [];
  let inScript = false;
  let scriptStart = 0;
  let scriptLines = 0;
  let hasMustache = false;
  let content = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes("<script")) {
      // Check for single-line script: <script>...</script> on same line
      if (trimmed.includes("</script>")) {
        const scriptContent = trimmed
          .replace(/.*<script[^>]*>/, "")
          .replace(/<\/script>.*/, "");
        blocks.push({
          startLine: i + 1,
          lineCount: 0,
          hasMustache: line.includes("{{"),
          content: scriptContent,
        });
      } else {
        inScript = true;
        scriptStart = i + 1;
        scriptLines = 0;
        hasMustache = false;
        content = "";
      }
    } else if (inScript && trimmed.includes("</script>")) {
      blocks.push({
        startLine: scriptStart,
        lineCount: scriptLines,
        hasMustache,
        content,
      });
      inScript = false;
    } else if (inScript) {
      scriptLines++;
      content += line + "\n";
      if (line.includes("{{")) hasMustache = true;
    }
  }

  return blocks;
}
