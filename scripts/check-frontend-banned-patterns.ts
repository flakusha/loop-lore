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
const re = {
  voidFire: /\bvoid\s+[A-Za-z_$][\w$]*\s*\(/,
  fetchNoCatch: /\bfetch\s*\(/,
  storage: /(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)/,
  eval: /\b(eval|new\s+Function)\s*\(/,
  addEv: /\.addEventListener\s*\(/,
  rmEv: /\.removeEventListener\s*\(/,
};

let inBlock = false;
for (const file of walk(TARGET,)) {
  const rel = path.relative(ROOT, file,);
  const lines = readFileSync(file, "utf8",).split("\n",);
  const hasRm = lines.some((l,) => re.rmEv.test(l,));
  lines.forEach((line, i,) => {
    const ln = i + 1;
    const t = line.trim();
    if (t.startsWith("//",)) { return; }
    if (t.includes("/*",)) { inBlock = true; }
    if (inBlock) {
      if (t.includes("*/",)) { inBlock = false; }
      return;
    }
    if (re.voidFire.test(line,)) { add("void-fire-forget", `${rel}:${ln}`, t,); }
    if (re.fetchNoCatch.test(line,)) { add("fetch-no-catch", `${rel}:${ln}`, t,); }
    if (re.storage.test(line,)) { add("storage-no-try", `${rel}:${ln}`, t,); }
    if (re.eval.test(line,)) { add("eval-usage", `${rel}:${ln}`, t,); }
    if (re.addEv.test(line,) && !hasRm) { add("listener-leak", `${rel}:${ln}`, t,); }
  },);
}

console.log("=== Frontend heuristic banned-pattern report (advisory, ESLint-gap) ===",);
const keys = Object.keys(buckets,);
if (keys.length === 0) {
  console.log("✓ No banned patterns found.",);
  process.exit(0,);
}
let total = 0;
for (const k of keys) {
  const b = buckets[k];
  total += b.count;
  console.log(`\n## ${k} — ${b.count}`,);
  for (const ex of b.examples) { console.log(`  ${ex}`,); }
}
console.log(`\n⚠ ${total} finding(s) across ${keys.length} bucket(s). Advisory only — not blocking.`,);
process.exit(1,);
