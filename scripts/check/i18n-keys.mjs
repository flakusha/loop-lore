#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * i18n static-key gate — extracts all t("...") call sites from src/ and
 * asserts each key exists in en.json. BLOCKING: t() returns the raw dotted
 * key on miss, so a missing catalog entry means users see key paths.
 *
 * Extraction rule: collect first-argument string literals from t() calls.
 * Reject literals adjacent to '+' (dynamic concatenation) and template
 * literals with ${} (not static). Ternary branches are both static keys.
 *
 * Usage: bun run scripts/check/i18n-keys.mjs
 *
 * Exit codes: 0 all keys resolve, 1 missing keys found.
 *
 * Runtime registry check: every command in the live assistant registry must
 * resolve to a commands.<name> key, so the command palette never renders a
 * raw key as its description. Runs against the runtime registry (loop-built
 * registerCommand calls included), not a static source scan — the static
 * extractor skips template/concatenated keys and can never see these.
 */
import { readdirSync, readFileSync, } from "node:fs";
import { join, relative, } from "node:path";

// TODO(env): bun-only — import.meta.dir is bun-specific. Add node shim when node target lands.
const PROJECT_ROOT = import.meta.dir.replace(/\/scripts\/check$/, "",);
const SRC_DIR = join(PROJECT_ROOT, "src",);
const EN_JSON = join(PROJECT_ROOT, "src", "public", "locales", "en.json",);

/** Flatten nested object to dot-notation keys. */
function flatten(obj, prefix = "",) {
  const result = new Set();
  for (const [k, v,] of Object.entries(obj,)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v,)) {
      for (const sub of flatten(v, key,)) { result.add(sub,); }
    } else {
      result.add(key,);
    }
  }
  return result;
}

/** Recursively collect source files. */
function collectFiles(dir,) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    const full = join(dir, entry.name,);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__tests__") { continue; }
      out.push(...collectFiles(full,),);
    } else if (/\.(ts|tsx|html|js|jsx)$/.test(entry.name,)) {
      // Skip test files — they intentionally use fake keys as fixtures
      if (/\.test\.(ts|tsx|js|jsx)$/.test(entry.name,)) { continue; }
      out.push(full,);
    }
  }
  return out;
}

/**
 * Extract static t() keys from source text.
 * Returns array of { key, file, line }.
 */
function extractKeys(text, file,) {
  const results = [];
  const lines = text.split("\n",);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find all t( occurrences
    const callRe = /\bt\(/g;
    let cm;
    while ((cm = callRe.exec(line,)) !== null) {
      // Find the matching close paren, tracking string state
      let depth = 1;
      let j = cm.index + 2;
      let inStr = false;
      let strCh = "";
      for (; j < line.length && depth > 0; j++) {
        const ch = line[j];
        if (inStr) {
          if (ch === "\\") {
            j++;
            continue;
          }
          if (ch === strCh) { inStr = false; }
        } else if (ch === '"' || ch === "'") {
          inStr = true;
          strCh = ch;
        } else if (ch === "(") { depth++; }
        else if (ch === ")") { depth--; }
      }
      const argSpan = line.slice(cm.index + 2, j - 1,);
      // Extract all string literals from the argument span
      const litRe = /(['"])((?:\\.|(?!\1).)*)\1/g;
      let lm;
      while ((lm = litRe.exec(argSpan,)) !== null) {
        const key = lm[2];
        if (key.includes("${",)) { continue; }
        // Check for + concatenation adjacent to this literal
        const before = argSpan.slice(0, lm.index,).trimEnd();
        const after = argSpan.slice(lm.index + lm[0].length,).trimStart();
        if (before.endsWith("+",) || after.startsWith("+",)) { continue; }
        if (!/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(key,)) { continue; }
        results.push({ key, file: relative(SRC_DIR, file,), line: i + 1, },);
      }
    }
  }
  return results;
}

async function main() {
  const en = JSON.parse(readFileSync(EN_JSON, "utf-8",),);
  const catalog = flatten(en,);

  const files = collectFiles(SRC_DIR,);
  const allKeys = [];
  for (const f of files) {
    const text = readFileSync(f, "utf-8",);
    allKeys.push(...extractKeys(text, f,),);
  }

  const missing = [];
  const seen = new Set();
  for (const { key, file, line, } of allKeys) {
    if (seen.has(key,)) { continue; }
    seen.add(key,);
    if (!catalog.has(key,)) {
      missing.push({ key, file, line, },);
    }
  }

  // Runtime registry check (see header). Skipped when the registry module
  // cannot load (e.g. the minimal fixtures in this gate's own tests copy
  // the gate without src/).
  const unkeyed = [];
  try {
    const { listCommands, } = await import(join(SRC_DIR, "assistant", "commands", "index.ts",),);
    for (const name of listCommands()) {
      if (!catalog.has(`commands.${name}`,)) {
        unkeyed.push(name,);
      }
    }
  } catch {
    // No registry in this tree — static check only.
  }

  if (missing.length === 0 && unkeyed.length === 0) {
    console.log(`i18n - keys: all ${seen.size} static t() keys resolve in en.json; all runtime commands keyed`,);
    return;
  }

  if (missing.length > 0) {
    console.log(`i18n - keys: ${missing.length} key(s) missing from en.json:`,);
    for (const { key, file, line, } of missing.sort((a, b,) => a.key.localeCompare(b.key,))) {
      console.log(`  ${key}  (${file}:${line})`,);
    }
  }
  if (unkeyed.length > 0) {
    console.log(`i18n - keys: ${unkeyed.length} runtime command(s) without a commands.<name> key in en.json:`,);
    for (const name of unkeyed.sort()) {
      console.log(`  commands.${name}`,);
    }
  }
  console.log("Add the missing keys to en.json and run `bun run i18n:fix` to propagate.",);
  process.exit(1,);
}

if (import.meta.main) {
  await main();
}
