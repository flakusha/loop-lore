// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SPDX header application (--fix): builds the header block for a rule +
 * extension and rewrites files in place, preserving shebangs and YAML
 * frontmatter.
 */
import { parseLicenses, type ReuseRule, } from "./reuse-toml.ts";

/** Comment syntax for a file extension. */
function commentStyleFor(ext: string,): { prefix: string; suffix: string } {
  switch (ext) {
    case ".html":
    case ".md":
    case ".mdx":
      return { prefix: "<!--", suffix: " -->", };
    case ".css":
      return { prefix: "/*", suffix: " */", };
    default: // .ts .tsx .js .mjs
      return { prefix: "//", suffix: "", };
  }
}

/** Build the SPDX header block for a rule + extension (license = first allowed). */
function buildHeader(rule: ReuseRule, ext: string,): string {
  const license = parseLicenses(rule.license,)[0];
  const tags = [
    `SPDX-License-Identifier: ${license}`,
    `SPDX-FileCopyrightText: ${rule.copyright}`,
  ];

  // CSS has no line-comment syntax and stylelint's `comment-empty-line-before`
  // forbids adjacent comments — emit a single block comment instead.
  if (ext === ".css") {
    const body = tags.map((t,) => ` * ${t}`).join("\n",);
    return `/*\n${body}\n */\n\n`;
  }

  const { prefix, suffix, } = commentStyleFor(ext,);
  return tags
    .map((t,) => `${prefix} ${t}${suffix}`)
    .concat("",)
    .join("\n",) + "\n";
}

/**
 * Prepend (or replace) the SPDX header, preserving a shebang line and any
 * YAML frontmatter block. Existing SPDX header lines are stripped first.
 */
function applyHeader(content: string, header: string,): string {
  const lines = content.split("\n",);

  // Preserve a leading shebang.
  let shebang = "";
  let start = 0;
  if (lines[0]?.startsWith("#!",)) {
    shebang = lines[0];
    start = 1;
  }

  // Preserve a leading YAML frontmatter block (--- ... ---).
  let frontmatter = "";
  if (lines[start] === "---") {
    const end = lines.indexOf("---", start + 1,);
    if (end !== -1) {
      frontmatter = `${lines.slice(start, end + 1,).join("\n",)}\n\n`;
      start = end + 1;
    }
  }

  // Strip any existing SPDX header — line comments (`//`, `<!-- -->`) or a
  // `/* … */` block — plus surrounding blank lines. Detection is scoped to the
  // first 20 lines so unrelated leading comments are left intact.
  const spdxTag = /SPDX-License-Identifier:|SPDX-FileCopyrightText:/;
  const blockDelimiter = /^\s*(\/\*|\*\/)\s*$/;
  let i = start;
  if (lines.slice(i, i + 20,).some((l,) => spdxTag.test(l,))) {
    while (
      i < lines.length &&
      i < start + 20 &&
      (lines[i].trim() === "" || spdxTag.test(lines[i],) || blockDelimiter.test(lines[i],))
    ) {
      i++;
    }
  }
  const rest = lines.slice(i,).join("\n",);

  let head = "";
  if (shebang) { head += `${shebang}\n`; }
  if (frontmatter) { head += frontmatter; }
  return head + header + rest;
}

/** Apply headers to a list of files, rewriting only those that change. */
export async function fixFiles(files: string[], rules: ReuseRule[],): Promise<number> {
  let changed = 0;

  for (const file of files) {
    const rule = rules.find((r,) => r.matchers.some((m,) => m.test(file,)));
    if (!rule) {
      console.warn(`[spdx:fix] no REUSE.toml rule matches - skipped: ${file}`,);
      continue;
    }

    try {
      const content = await Bun.file(file,).text();
      const ext = file.slice(file.lastIndexOf(".",),);
      const header = buildHeader(rule, ext,);
      const updated = applyHeader(content, header,);

      if (updated !== content) {
        await Bun.write(file, updated,);
        changed++;
        console.log(`[spdx:fix] ${file}`,);
      }
    } catch {
      console.warn(`[spdx:fix] failed to read/write - skipped: ${file}`,);
    }
  }

  return changed;
}
