#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend heuristic banned-pattern reporter (ESLint-gap complement).
 *
 * Scans src/frontend production code (.ts, excluding *.test.ts) for the banned
 * patterns the project lists (see .agents/references/banned-patterns.md) that
 * ESLint cannot express as rules: fire-and-forget `void fn()` (no .catch), raw
 * `fetch(` without catch, localStorage/sessionStorage without try, eval/new
 * Function, and addEventListener without a matching removeEventListener
 * (listener-leak heuristic). console.* / empty-catch / as any / bare JSON are
 * owned by the ESLint frontend override (warn-level) — not duplicated here.
 *
 * This is a REPORTER (advisory): it exits non-zero when findings exist so it can
 * be promoted to a blocking gate later, but is wired as advisory in
 * check-parallel.mjs to avoid blocking on pre-existing debt.
 *
 * Run: `bun run scripts/check-frontend-banned-patterns.ts`
 */

import { readdirSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..",);
const TARGET = path.join(ROOT, "src", "frontend",);

type Bucket = { count: number; examples: string[] };
const buckets: Record<string, Bucket> = {};
function add(bucket: string, loc: string, snippet: string,) {
  const b = (buckets[bucket] ??= { count: 0, examples: [], });
  b.count++;
  if (b.examples.length < 4) { b.examples.push(`${loc}  ${snippet.slice(0, 90,)}`,); }
}

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

// ESLint owns console.* / empty-catch / as any / bare JSON (see eslint.config.mjs
// frontend override). This script covers only the heuristic gaps ESLint cannot
// express: fire-and-forget void, fetch without catch, storage without try,
// eval/new Function, and addEventListener without a matching removeEventListener.
//
// The "no-try"/"no-catch" buckets are try-aware: a call inside a `try {` or
// `catch {` block is already handled and must not be reported, or the bucket
// reports its own premise as a finding. `void` is exempt when the statement it
// opens ends in `.catch(` — that is the difference between fire-and-forget and
// a deliberately swallowed rejection.
const re = {
  voidFire: /\bvoid\s+[A-Za-z_$][\w$]*\s*\(/,
  fetchNoCatch: /\bfetch\s*\(/,
  // Both storages are matched: sessionStorage throws outright in some privacy
  // modes and localStorage.setItem throws on quota, so neither is assumed safe.
  storage: /(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)/,
  eval: /\b(eval|new\s+Function)\s*\(/,
  addEv: /\.addEventListener\s*\(/,
  // Receiver capture, used only to pair an add with its own remove.
  addTarget: /([\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*addEventListener\s*\(/,
  rmTarget: /([\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*removeEventListener\s*\(/,
  guardOpen: /\b(?:try|catch)\s*\{/,
};

/**
 * The statement starting at line `i`, up to the line where its parens balance.
 * Used to see whether a `void fn(...)` is followed by `.catch(...)`.
 * ponytail: paren counting is fooled by parens inside string literals; a real
 * parse earns its keep only if this bucket is promoted to a blocking gate.
 */
function statementAt(lines: string[], i: number,): string {
  let text = lines[i] ?? "";
  let bal = 0;
  for (let j = i; j < Math.min(i + 12, lines.length,); j++) {
    for (const c of lines[j] ?? "") {
      if (c === "(") { bal++; }
      else if (c === ")") { bal--; }
    }
    const part = (lines[j] ?? "").trim();
    text += ` ${part}`;
    if (bal <= 0) { break; }
  }
  return text;
}

let inBlock = false;
// ponytail: brace counting is fooled by braces inside string literals, so a
// `try` opened inside a template string can mask later lines in that file.
// Acceptable for an advisory reporter; revisit only if this gate is enforced.
let depth = 0;
/** Brace depths at which a `try`/`catch` block was opened, innermost last. */
const guards: number[] = [];

for (const file of walk(TARGET,)) {
  const rel = path.relative(ROOT, file,);
  const lines = readFileSync(file, "utf8",).split("\n",);
  depth = 0;
  guards.length = 0;
  // Pairing is per receiver, not per file: a removeEventListener on an
  // unrelated object does not retire an addEventListener on this one.
  const removed = new Set<string>();
  for (const l of lines) {
    const rm = re.rmTarget.exec(l,);
    if (rm?.[1] !== undefined) { removed.add(rm[1].replace(/\s+/g, "",),); }
  }

  lines.forEach((line, i,) => {
    const ln = i + 1;
    const t = line.trim();
    if (t.startsWith("//",)) { return; }
    if (t.includes("/*",)) { inBlock = true; }
    if (inBlock) {
      if (t.includes("*/",)) { inBlock = false; }
      return;
    }
    // A guard that closed before this line no longer covers it.
    while (guards.length > 0 && (guards[guards.length - 1] ?? 0) >= depth) { guards.pop(); }
    const guardAt = line.search(re.guardOpen,);
    /** True when a `try`/`catch` already encloses the match at `idx`. */
    const guarded = (idx: number,): boolean => {
      if (guards.length > 0) { return true; }
      // `try { localStorage.getItem(...) }` — the guard opened on this line.
      return guardAt >= 0 && idx > guardAt;
    };

    if (re.voidFire.test(line,) && !/\.catch\s*\(/.test(statementAt(lines, i,),)) {
      add("void-fire-forget", `${rel}:${ln}`, t,);
    }
    const fetchAt = line.search(re.fetchNoCatch,);
    if (fetchAt >= 0 && !guarded(fetchAt,)) { add("fetch-no-catch", `${rel}:${ln}`, t,); }
    const storageAt = line.search(re.storage,);
    if (storageAt >= 0 && !guarded(storageAt,)) { add("storage-no-try", `${rel}:${ln}`, t,); }
    if (re.eval.test(line,)) { add("eval-usage", `${rel}:${ln}`, t,); }
    if (re.addEv.test(line,)) {
      const target = re.addTarget.exec(line,)?.[1]?.replace(/\s+/g, "",);
      // No capturable receiver (optional chain, computed access) — cannot prove
      // a matching remove exists, so report it.
      if (target === undefined || !removed.has(target,)) {
        add("listener-leak", `${rel}:${ln}`, t,);
      }
    }

    if (guardAt >= 0) { guards.push(depth,); }
    for (const c of line) {
      if (c === "{") { depth++; }
      else if (c === "}") { depth--; }
    }
  },);
}

console.log("=== Frontend heuristic banned-pattern report (advisory, ESLint-gap) ===",);
const keys = Object.keys(buckets,);
if (keys.length === 0) {
  console.log("OK: No banned patterns found.",);
  process.exit(0,);
}
let total = 0;
for (const k of keys) {
  const b = buckets[k];
  total += b.count;
  console.log(`\n## ${k} - ${b.count}`,);
  for (const ex of b.examples) { console.log(`  ${ex}`,); }
}
console.log(`\nwarn: ${total} finding(s) across ${keys.length} bucket(s). Advisory only - not blocking.`,);
process.exit(1,);
