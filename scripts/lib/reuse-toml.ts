// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * REUSE.toml parsing and SPDX header validation.
 *
 * Parses [[annotations]] blocks, converts path globs to regex matchers, and
 * validates that a file's first-line SPDX-License-Identifier matches the rule
 * for its path. SPDX-FileCopyrightText must contain "Loop Lore Contributors".
 */

export interface ReuseRule {
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

/** Parse REUSE.toml into an ordered list of rules. */
export function parseReuseToml(content: string,): ReuseRule[] {
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

/** Extract license identifiers from an SPDX expression like "Apache-2.0 OR MIT". */
export function parseLicenses(expr: string,): string[] {
  return expr
    .split(/\s+OR\s+/i,)
    .map((s,) => s.trim())
    .filter((s,) => s.length > 0);
}

export interface HeaderCheck {
  valid: boolean;
  licenseOk: boolean;
  copyrightOk: boolean;
  foundLicense: string | null;
  foundCopyright: string | null;
}

export function checkHeader(content: string, rule: ReuseRule,): HeaderCheck {
  let lines = content.split("\n",);
  // Skip a leading shebang line (e.g. #!/usr/bin/env bun).
  if (lines[0]?.startsWith("#!",)) { lines = lines.slice(1,); }
  // Skip a leading YAML frontmatter block (--- ... ---) in markdown.
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1,);
    if (end !== -1) { lines = lines.slice(end + 1,); }
  }
  const headerBlock = lines.slice(0, 10,).join("\n",);

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
