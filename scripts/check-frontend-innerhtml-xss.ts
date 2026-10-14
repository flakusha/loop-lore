#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend innerHTML XSS check.
 *
 * Scans src/frontend for `*.innerHTML = <rhs>` assignments and, within any
 * template literal in the RHS (including `Array.from(...).join("")` builders),
 * flags interpolated expressions that are NOT escaped (escapeHtml /
 * DOMPurify.sanitize) and are not a known-safe numeric/primitive/literal.
 * Server-derived asset ids/labels interpolated unescaped are a stored-XSS
 * vector (see BUG-stored-xss-unescaped-server-derived-asset-ids-labels-in-inne).
 *
 * Blocking: check-parallel.mjs runs this checker as a correctness gate.
 *
 * Run: `bun run scripts/check-frontend-innerhtml-xss.ts`
 */

import { readdirSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { argument, object, runScript, string, withDefault, } from "../src/cli/parser";

const ROOT = path.resolve(import.meta.dir, "..",);

const parser = object({
  target: withDefault(argument(string(),), path.join(ROOT, "src", "frontend",),),
},);

const { target, } = runScript(parser, {
  programName: "check-frontend-innerhtml-xss",
  brief: "Blocking XSS check for innerHTML and CSS assignments in frontend code.",
  help: "option",
},);
const TARGET = path.resolve(target,);

function walk(dir: string,): string[] {
  const out: string[] = [];
  if (!statSync(dir,).isDirectory()) { return out; }
  for (const e of readdirSync(dir,)) {
    const p = path.join(dir, e,);
    const s = statSync(p,);
    if (s.isDirectory()) { out.push(...walk(p,),); }
    else if (e.endsWith(".ts",) && !e.endsWith(".test.ts",)) { out.push(p,); }
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  expr: string;
  snippet: string;
}

function scanAssignments(assignRe: RegExp,): Finding[] {
  const findings: Finding[] = [];
  if (!statSync(TARGET,).isDirectory()) { return findings; }
  for (const file of walk(TARGET,)) {
    const src = readFileSync(file, "utf8",);
    const lines = src.split("\n",);
    const rel = path.relative(ROOT, file,);
    let am: RegExpExecArray | null;
    while ((am = assignRe.exec(src,)) !== null) {
      const rhsStart = am.index + am[0].length;
      let i = rhsStart;
      let depth = 0;
      let inStr = 0;
      let rhsEnd = src.length;
      while (i < src.length) {
        const ch = src[i];
        if (inStr) {
          if (ch === "\\") {
            i += 2;
            continue;
          }
          if ((inStr === 1 && ch === '"') || (inStr === 2 && ch === "'")) { inStr = 0; }
          i++;
          continue;
        }
        if (ch === "`") {
          depth = depth === 0 ? 1 : 0;
          i++;
          continue;
        }
        if (ch === '"') {
          inStr = 1;
          i++;
          continue;
        }
        if (ch === "'") {
          inStr = 2;
          i++;
          continue;
        }
        if (ch === ";" && depth === 0) {
          rhsEnd = i;
          break;
        }
        i++;
      }
      const rhs = src.slice(rhsStart, rhsEnd,);
      const baseLine = src.slice(0, rhsStart,).split("\n",).length;
      const tmplRe = /`([\s\S]*?)`/g;
      let tm: RegExpExecArray | null;
      while ((tm = tmplRe.exec(rhs,)) !== null) {
        const template = tm[1];
        const tmplLine = baseLine + rhs.slice(0, tm.index,).split("\n",).length - 1;
        const interp = /\$\{([^}]+)\}/g;
        let im: RegExpExecArray | null;
        while ((im = interp.exec(template,)) !== null) {
          const expr = im[1].trim();
          if (isSafe(expr, src,)) { continue; }
          const line = tmplLine + template.slice(0, im.index,).split("\n",).length - 1;
          findings.push({
            file: rel,
            line,
            expr,
            snippet: lines[line - 1]?.trim().slice(0, 140,) ?? "",
          },);
        }
      }
    }
  }
  return findings;
}

function isSafe(expr: string, src?: string,): boolean {
  const ex = expr.trim();
  if (/^\d+$/.test(ex,)) { return true; }
  if (
    /^(pct|percent|count|total|num|length|width|height|score|level|hp|maxHp|year|month|day|page|size|index|idx)\b/.test(
      ex,
    )
  ) { return true; }
  if (/^(escapeHtml|DOMPurify\s*\.sanitize|sanitizeCssUrl)\s*\(/.test(ex,)) { return true; }
  if (/escapeHtml\s*\(|DOMPurify|sanitizeCssUrl/.test(ex,)) { return true; }
  if (
    /\.(round|count|total|length|index|idx|page|size|width|height|pct|percent|year|month|day|score|level|hp|maxHp|num)\b/
      .test(ex,)
  ) { return true; }
  // ternary whose branches are string literals only (e.g. `acting ? " ➤" : ""`)
  if (/^\s*[\w$.]+\s*\?\s*"[^"]*"\s*:\s*"[^"]*"\s*$/.test(ex,)) { return true; }
  // variable whose definition is a string-literal ternary
  if (src) {
    const m = new RegExp(`(?:const|let|var)\\s+${ex}\\s*=\\s*([\\w$.]+\\s*\\?\\s*"[^"]*"\\s*:\\s*"[^"]*")`,).exec(src,);
    if (m) { return true; }
  }
  return false;
}

function scan(): Finding[] {
  return [
    ...scanAssignments(/\.innerHTML\s*[+-]?=\s*/g,),
    ...scanAssignments(/\.style\.(backgroundImage|cssText)\s*[+-]?=\s*/g,),
  ];
}

const findings = scan();
console.log("=== Frontend innerHTML/CSS-injection XSS check (blocking) ===",);
if (findings.length === 0) {
  console.log("OK: No unescaped interpolations in innerHTML or CSS assignments.",);
  process.exit(0,);
}
const seen = new Set<string>();
for (const f of findings) {
  const key = `${f.file}:${f.line}:${f.expr}`;
  if (seen.has(key,)) { continue; }
  seen.add(key,);
  console.log(`  ${f.file}:${f.line}  unsafe: \${${f.expr}}`,);
  if (f.snippet) { console.log(`    ${f.snippet}`,); }
}
console.log(
  `\nerror: ${seen.size} unescaped interpolation(s). Wrap with escapeHtml() or use textContent/property assignment.`,
);
process.exit(1,);
