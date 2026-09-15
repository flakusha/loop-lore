// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression sweep for BUG-csp-unsafe-inline-defeats-per-request-nonce.
 *
 * Scans every string literal that becomes HTML at runtime: both the
 * shipped HTML strings (`src/routes/views/**`, `src/views/**`,
 * `src/partials/**`, `src/components/**`) AND any `innerHTML` /
 * `outerHTML` assignment in `src/frontend/pages/**` — both are HTML
 * sinks the strict CSP will block. With `'unsafe-inline'` removed,
 * inline event handlers are silently blocked by the browser — the
 * user clicks a button and nothing happens.
 *
 * The sweep is intentionally loose (substring match on raw source
 * files) rather than a full HTML parser: the goal is to catch any
 * string literal that could land in an htmx response, before it
 * ships. Comment lines are skipped so JSDoc examples mentioning
 * `onclick=...` do not trigger.
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

/** Second sweep root: frontend page modules that assign to `.innerHTML`. */
const FRONTEND_PAGES_ROOT = path.resolve(import.meta.dir, "..", "..", "src", "frontend", "pages",);

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

describe("CSP — no inline event handlers in frontend pages innerHTML sinks", () => {
  const offenders: { file: string; line: number; snippet: string }[] = [];
  const files = (() => {
    try { return walk(FRONTEND_PAGES_ROOT,); } catch { return []; }
  })();

  for (const file of files) {
    const text = readFileSync(file, "utf8",);
    const lines = text.split("\n",);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line,)) { continue; }
      // Trigger: this line assigns to .innerHTML or .outerHTML.
      if (!/(?:innerHTML|outerHTML)\s*[+=]/.test(line,)) { continue; }
      // Look ahead in the file content for an on*= within the next ~4 KB
      // (typical max template-literal body for an htmx fragment). The line
      // number we report is where the offending on*= token actually appears.
      const lineStart = text.indexOf(line,);
      if (lineStart < 0) { continue; }
      const window = text.slice(lineStart, lineStart + 4096,);
      const m = window.match(EVENT_HANDLER_PATTERN,);
      if (!m || m.index === undefined) { continue; }
      const absOffset = lineStart + m.index;
      const lineNo = text.slice(0, absOffset,).split("\n",).length;
      offenders.push({
        file: path.relative(process.cwd(), file,),
        line: lineNo,
        snippet: lines[lineNo - 1]?.trim().slice(0, 120,) ?? "(see file)",
      },);
      // Same file:line may match multiple innerHTML lines if the template
      // literal is reachable from several RHSs; report each line once.
      break;
    }
  }

  test(`scanned ${files.length} files; expected zero innerHTML offenders`, () => {
    if (offenders.length > 0) {
      const msg = offenders.map((o,) => `  ${o.file}:${o.line}  ${o.snippet}`).join("\n",);
      throw new Error(`Found innerHTML + inline event handler combination that CSP will block:\n${msg}`,);
    }
    expect(offenders.length,).toBe(0,);
  });
});
