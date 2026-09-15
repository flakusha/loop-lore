// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression sweep for BUG-csp-unsafe-inline-defeats-per-request-nonce.
 *
 * Scans `src/routes/views/**`, `src/views/**`, `src/partials/**`, and
 * `src/components/**` for any shipped HTML string that still carries inline
 * event handlers (`onclick=`, `onchange=`, etc.). With `'unsafe-inline'`
 * removed from the strict CSP, such handlers are silently blocked by the
 * browser — the user clicks a button and nothing happens.
 *
 * The sweep is intentionally loose (substring match on raw source files)
 * rather than a full HTML parser: the goal is to catch any string literal
 * that could land in an htmx response, before it ships. Comment lines are
 * skipped so JSDoc examples mentioning `onclick=...` do not trigger.
 */
import { describe, expect, test, } from "bun:test";
import { readdirSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";

const EVENT_HANDLER_PATTERN =
  /\bon(?:click|change|submit|input|keydown|keyup|keypress|mousedown|mouseup|mouseenter|mouseleave|mousemove|mouseover|mouseout|focus|blur|load|error|contextmenu|dblclick)\s*=\s*["'`]/i;

const ROOTS = [
  path.resolve(import.meta.dir, "..", "..", "src", "routes", "views",),
  path.resolve(import.meta.dir, "..", "..", "src", "views",),
  path.resolve(import.meta.dir, "..", "..", "src", "partials",),
  path.resolve(import.meta.dir, "..", "..", "src", "components",),
];

/** Walk `dir` recursively and return every regular file matching a likely-HTML extension. */
function walk(dir: string,): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir,);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = path.join(dir, name,);
    const s = statSync(p,);
    if (s.isDirectory()) {
      out.push(...walk(p,),);
    } else if (/\.(ts|tsx|js|jsx|html)$/.test(name,)) {
      out.push(p,);
    }
  }
  return out;
}

/** True if `line` is a comment-only line in JS/TS/HTML. */
function isCommentLine(line: string,): boolean {
  const t = line.trim();
  return t.startsWith("*",) || t.startsWith("//",) || t.startsWith("<!--",) || t.startsWith("#",);
}

describe("CSP — no inline event handlers in shipped view HTML", () => {
  const offenders: { file: string; line: number; snippet: string }[] = [];
  const files = ROOTS.flatMap((r,) => walk(r,));

  for (const file of files) {
    const text = readFileSync(file, "utf8",);
    const lines = text.split("\n",);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line,)) { continue; }
      if (!EVENT_HANDLER_PATTERN.test(line,)) { continue; }
      offenders.push({
        file: path.relative(process.cwd(), file,),
        line: i + 1,
        snippet: line.trim().slice(0, 120,),
      },);
    }
  }

  test(`scanned ${files.length} files; expected zero offenders`, () => {
    if (offenders.length > 0) {
      const msg = offenders.map((o,) => `  ${o.file}:${o.line}  ${o.snippet}`).join("\n",);
      throw new Error(`Found inline event handlers that CSP will block:\n${msg}`,);
    }
    expect(offenders.length,).toBe(0,);
  });
});
