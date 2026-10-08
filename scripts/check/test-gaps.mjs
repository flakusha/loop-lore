#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 406

/**
 * test-gap ratchet — the static half of "auto generate the coverage": it
 * finds exported symbols under `src/` that no test can actually reach, and
 * fails only when that gap set GROWS past the committed baseline.
 *
 * Usage:
 *   bun run scripts/check/test-gaps.mjs [--baseline <path>] [--json]
 *   bun run scripts/check/test-gaps.mjs --write-baseline [--baseline <path>]
 *                                        [--accept-new-debt]
 *
 * - Gate mode (default): exit 0 while `fresh ⊆ baseline` (gaps may shrink),
 *   exit 1 naming the NEW gaps otherwise.
 * - `--write-baseline`: rewrite the baseline from the freshly measured gap
 *   set. Shrinking is free — that is the win case. GROWING it accepts new
 *   debt, so it additionally requires `--accept-new-debt`; the same reflex-
 *   guard jscpd-ratchet.mjs gets from refusing to raise. A baseline that does
 *   not exist yet is a first write, not a raise, and is always allowed.
 * - `--json`: suppress the human table on stderr. The machine-readable
 *   payload on stdout is always emitted (same split as
 *   scripts/check/coverage.mjs).
 *
 * Coverage rule — the whole point of this gate. An export is COVERED only
 * when some test file both (a) names the symbol in real code and (b) has a
 * RUNTIME import edge to the module that defines it, directly or through the
 * src/ re-export graph. Matching the bare identifier anywhere in the corpus was
 * the old rule and it was worthless: `get`/`run`/`load`/`map` occur in every
 * test file as comments, strings, or some unrelated object's member, so a
 * brand-new untested module of common names passed silently. (b) is what kills
 * those collisions; (a) is what stops a test that imports a module but never
 * touches the export from claiming it. "Runtime" excludes `import type`,
 * which loads nothing (see TYPE_ONLY_STATEMENT). Still a NAME-level signal, not
 * a coverage signal — a test may import a symbol and assert nothing about it.
 * The 80% line floor in scripts/check/coverage.mjs stays the real measure.
 *
 * Baseline shape deviates from `jscpd-baseline.json`'s `{ "clones": n }`
 * scalar: a count cannot express WHICH gaps are known, and only shrinking is
 * allowed, so the baseline must be the SET —
 * `{ "generatedAt", "count", "gaps": ["<path>#<export>", ...] }`.
 *
 * Resource contract — the check runner fires gates concurrently
 * (Promise.allSettled over a JOBS chunk, scripts/check/parallel/runner.mjs):
 * - Gate mode owns NO resource: it reads `src/**` and the baseline and writes
 *   nothing — no temp dir, port, DB, or global state. Every run is pure, so
 *   simultaneous runs give byte-identical stdout. The shared EXPORT_PATTERNS
 *   are safe because `String.matchAll` clones the regex rather than advancing
 *   its lastIndex.
 * - `--write-baseline` owns the baseline path and nothing else: the one fixed
 *   shared resource, written atomically (temp + rename, temp keyed by pid) so a
 *   concurrent reader sees the old file or the new one, never a torn one. A
 *   torn read still fails CLOSED (exit 2, never a silent pass); the atomic write
 *   removes the window anyway.
 */
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, } from "node:fs";
import path from "node:path";
import {
  flag,
  object,
  option,
  runScript,
  string,
  withDefault,
} from "../../src/cli/parser";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);
const SRC_DIR = path.join(PROJECT_ROOT, "src",);
const DEFAULT_BASELINE = path.join(import.meta.dir, "test-gaps-baseline.json",);

/**
 * Top-level export declarations. Anchored to line start with `[ \t]*`, never
 * `\s*` — `\s` spans newlines and would let a stray blank line manufacture
 * a match. The capture is a real identifier, so `export const { a } = …`
 * never yields a name. Matched against comment/string-stripped source, so a
 * commented-out declaration cannot manufacture an export either.
 *
 * `export let` / `export var` / `abstract class` are runtime surface exactly
 * like `const` / `class` — mutable module state and base classes both execute,
 * so both are gaps when untested.
 *
 * Deliberately NOT matched: `export default`, and `export { a, b } from "…"`
 * re-export lists. Neither names a symbol this file DEFINES — the defining
 * file is charged for its own symbol instead, so the debt lands where the
 * code is. Local `export { a, b };` (no `from`) IS matched: those symbols are
 * defined right here and only re-published.
 *
 * `export interface` / `export type` are excluded on purpose. A type export
 * is not behaviour: nothing executes it, and no test is expected to name one
 * — a row type is exercised through the function that returns it. They are the
 * majority of any measured gap set, so every new exported interface would fail
 * the gate and drown the actionable runtime half in unfixable noise. Type
 * safety already has a blocking gate (`typecheck - coverage`); duplicating it
 * here buys nothing. `enum` stays — an enum emits a real runtime object.
 */
const EXPORT_PATTERNS = [
  /^[ \t]*export[ \t]+(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export[ \t]+(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export[ \t]+(?:abstract[ \t]+)?class[ \t]+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export[ \t]+enum[ \t]+([A-Za-z_$][\w$]*)/gm,
];

/** A local re-export list, `export { a, b };` — the `from "…"` form is rejected. */
const EXPORT_LIST = /^[ \t]*export[ \t]*(?:\r?\n[ \t]*)?\{([^}]*)\}/gm;

/**
 * Generated / machine-owned files, excluded from the scan entirely: they are
 * regenerated wholesale by scripts/generate-db-types.ts and
 * scripts/generate-schema-manifest.ts, so "add a test naming this export"
 * is not an actionable answer for anything they emit. Mirrors the ignore
 * list scripts/check/parallel/gates.mjs already hands jscpd, and the regexes
 * in scripts/lib/spdx-discovery.ts.
 */
const SKIP_PATTERNS = [
  /^src\/db\/schema[a-z-]*\.ts$/,
  /^src\/db\/migrations\//,
  /^src\/test-utils\/insert-helpers\.ts$/,
  /^src\/validation\/db-schemas\.ts$/,
];

function walk(dir, out = [],) {
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    const full = path.join(dir, entry.name,);
    if (entry.isDirectory()) {
      walk(full, out,);
    } else if (entry.isFile() && entry.name.endsWith(".ts",)) {
      out.push(full,);
    }
  }
  return out;
}

/**
 * Blanks comments and string/template bodies in place — length and newlines
 * preserved — so an identifier scan sees code only. Hand-rolled rather than
 * driven by a parser: the gate only asks "is this token real code", and every
 * ambiguity (an unterminated literal, a regex literal holding a quote)
 * resolves toward "not an identifier". That is the conservative direction: a
 * missed coverage signal can only ADD a gap, never hide one.
 */
function stripNonCode(text,) {
  const out = text.split("",);
  const blank = (from, to,) => {
    for (let i = from; i < to; i++) { if (out[i] !== "\n") { out[i] = " "; } }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i,);
      const end = nl < 0 ? text.length : nl;
      blank(i, end,);
      i = end - 1;
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2,);
      const end = close < 0 ? text.length : close + 2;
      blank(i, end,);
      i = end - 1;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        if (text[j] === "\\") { j++; }
        j++;
      }
      blank(i + 1, j,);
      i = j;
    }
  }
  return out.join("",);
}

/** Exported names in one file, deduped, first-seen order. `text` must be stripped. */
function exportedNames(text,) {
  const names = [];
  const add = (name,) => {
    if (name && !names.includes(name,)) { names.push(name,); }
  };
  for (const pattern of EXPORT_PATTERNS) {
    for (const match of text.matchAll(pattern,)) { add(match[1],); }
  }
  for (const match of text.matchAll(EXPORT_LIST,)) {
    // A `from "…"` clause re-publishes another file's symbol — not our gap.
    const after = text.slice(match.index + match[0].length,);
    if (/^[ \t]*(?:\r?\n[ \t]*)*from\b/.test(after,)) { continue; }
    for (const clause of match[1].split(",",)) {
      const words = clause.replace(/\/\*[\s\S]*?\*\//g, " ",).trim().split(/\s+/,).filter(Boolean,);
      // `type Foo` and `Foo as Bar` both export the LAST word of the clause.
      if (words.length > 1 && words[0] === "type") { words.shift(); }
      add(words.at(-1,),);
    }
  }
  return names;
}

/** Every identifier token in code. Membership testing IS whole-word matching. */
function identifierSet(code,) {
  const found = new Set();
  for (const token of code.matchAll(/[A-Za-z_$][\w$]*/g,)) { found.add(token[0],); }
  return found;
}

/** Every quoted string in a raw source — that is where module specifiers live. */
function stringLiterals(raw,) {
  const found = [];
  for (const m of raw.matchAll(/["'`]([^"'`\n]*)["'`]/g,)) { found.push(m[1],); }
  return found;
}

/**
 * A type-only statement — `import type { T } from "./x"`, `export type { T } from
 * "./x"`. It loads nothing at runtime, so it must NOT create a reach edge:
 * 766 of this tree's 1328 test files reach a module through a type-only import
 * alone, and four exports were cleared by nothing but a name in a type clause.
 * Erasing the statement (as spaces, so literal boundaries stay intact) before
 * the specifier scan keeps that class of mention out of the coverage signal.
 */
const TYPE_ONLY_STATEMENT = /\b(?:import|export)[ \t]+type[ \t]+[^;"']*["'][^"']*["'];?/g;

/** Extensionless repo-relative module id a specifier points at, or null. */
function resolveSpecifier(spec, importerId,) {
  const joined = spec.startsWith("@/",)
    ? `src/${spec.slice(2,)}`
    : spec.startsWith(".",)
    ? path.posix.join(path.posix.dirname(importerId,), spec,)
    : null;
  if (joined === null) { return null; }
  return path.posix.normalize(joined,).replace(/\.(?:ts|tsx|js|mjs)$/, "",).replace(/\/index$/, "",);
}

/**
 * Sorted `"<repo-relative-path>#<exportName>"` keys for every export no test
 * file reaches. Coverage needs BOTH halves: the name must appear in the
 * stripped source of a test that imports (directly, or transitively through
 * the src/ re-export graph) the file defining it. Test files are skipped as
 * subjects; generated files are excluded from BOTH sides so a name only a
 * generated helper mentions cannot mask a real gap elsewhere.
 */
function collectGaps(files,) {
  const raw = new Map(), stripped = new Map();
  for (const abs of files) {
    const rel = path.relative(PROJECT_ROOT, abs,).split(path.sep,).join("/",);
    const text = readFileSync(abs, "utf8",);
    raw.set(rel.replace(/\.ts$/, "",), text,);
    stripped.set(rel.replace(/\.ts$/, "",), stripNonCode(text,),);
  }
  const edges = new Map();
  for (const id of raw.keys()) { edges.set(id, [],); }
  for (const [id, text,] of raw) {
    const runtime = text.replace(TYPE_ONLY_STATEMENT, (m,) => " ".repeat(m.length,),);
    for (const spec of stringLiterals(runtime,)) {
      const target = resolveSpecifier(spec, id,);
      if (target === null || target === id) { continue; }
      // A directory import (`./deep`) resolves through that directory's
      // index.ts, exactly as the runtime and the bundler resolve it.
      const dest = edges.has(target,) ? target : `${target}/index`;
      // Unresolvable (package, built-in) or dangling: no edge, no false reach.
      if (edges.has(dest,) && dest !== id) { edges.get(id,).push(dest,); }
    }
  }
  const reachedBy = new Map(), names = new Map();
  for (const [id, code,] of stripped) {
    if (!id.endsWith(".test",)) { continue; }
    names.set(id, identifierSet(code,),);
    const seen = new Set([id,],), queue = [id,];
    for (let i = 0; i < queue.length; i++) {
      const frontier = edges.get(queue[i],);
      for (const next of frontier) {
        if (seen.has(next,)) { continue; }
        seen.add(next,);
        queue.push(next,);
      }
    }
    for (const reached of seen) { reachedBy.set(reached, [...reachedBy.get(reached,) ?? [], id,],); }
  }
  const coveredBy = (id, name,) => {
    for (const test of reachedBy.get(id,) ?? []) {
      if (names.get(test,).has(name,)) { return true; }
    }
    return false;
  };

  const gaps = [];
  for (const [id, code,] of stripped) {
    const rel = `${id}.ts`;
    if (id.endsWith(".test",) || SKIP_PATTERNS.some((re,) => re.test(rel,))) { continue; }
    for (const name of exportedNames(code,)) {
      if (!coveredBy(id, name,)) { gaps.push(`${rel}#${name}`,); }
    }
  }
  return gaps.sort();
}

function parseArgs() {
  const parser = object({
    acceptNewDebt: withDefault(flag("--accept-new-debt",), false,),
    baseline: withDefault(option("--baseline", string(),), DEFAULT_BASELINE,),
    write: withDefault(flag("--write-baseline",), false,),
    quiet: withDefault(flag("--json",), false,),
  },);

  return runScript(parser, {
    programName: "test:gaps",
    brief: "Fail when the set of src/ exports no test reaches grows past the committed baseline.",
    help: "option",
  },);
}

function readBaseline(baselinePath,) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(baselinePath, "utf8",),);
  } catch (error) {
    throw new Error(`cannot read baseline ${baselinePath} (run with --write-baseline): ${error.message}`,);
  }
  if (!Array.isArray(raw.gaps,) || raw.gaps.some((g,) => typeof g !== "string")) {
    throw new Error(`baseline has no usable gaps[] array: ${baselinePath}`,);
  }
  return raw;
}

/** The committed gap set, or null when no baseline exists yet (a first write). */
function readBaselineIfPresent(baselinePath,) {
  // Presence, not readability: a file that exists but cannot be parsed must
  // still fail closed through readBaseline rather than read as "no baseline".
  if (!existsSync(baselinePath,)) { return null; }
  return new Set(readBaseline(baselinePath,).gaps,);
}

function main() {
  const args = parseArgs();
  // stderr is the human channel and is dropped entirely under --json.
  const human = args.quiet ? () => {} : (line,) => console.error(line,);
  const baselinePath = path.resolve(args.baseline,);
  const fresh = collectGaps(walk(SRC_DIR,),);

  if (args.write) {
    const known = readBaselineIfPresent(baselinePath,);
    const added = known === null ? [] : fresh.filter((gap,) => !known.has(gap,));
    if (added.length > 0 && !args.acceptNewDebt) {
      throw new Error(
        `--write-baseline would accept ${added.length} NEW gap(s) (e.g. ${added[0]}); ` +
          `pass --accept-new-debt if that is the intent`,
      );
    }
    const payload = { generatedAt: new Date().toISOString(), count: fresh.length, gaps: fresh, };
    // Atomic temp+rename (report.mjs convention; rationale in the header).
    // The pid in the temp name keeps simultaneous --write-baseline runs off
    // one shared scratch path.
    const tmpPath = `${baselinePath}.${process.pid}.tmp`;
    try {
      writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2,)}\n`, "utf8",);
      renameSync(tmpPath, baselinePath,);
    } finally {
      // Rename consumed the temp; this only fires if the write threw.
      try {
        unlinkSync(tmpPath,);
      } catch { /* already renamed away */ }
    }
    human(`test-gaps: baseline written — ${fresh.length} gap(s) (${baselinePath})`,);
    console.log(JSON.stringify({ mode: "write-baseline", count: fresh.length, gaps: fresh, },),);
    return;
  }

  const baseline = readBaseline(baselinePath,);
  const known = new Set(baseline.gaps,);
  const newGaps = fresh.filter((gap,) => !known.has(gap,));

  if (newGaps.length > 0) {
    human("| new test gap |",);
    human("|---|---|",);
    for (const gap of newGaps) { human(`| ${gap} |`,); }
    human(
      `test-gaps: FAIL — ${newGaps.length} NEW gap(s) (${fresh.length} total, ${baseline.gaps.length} baselined)`,
    );
    human("  Cover the new exports with a test, or accept the debt deliberately:",);
    human("  bun run scripts/check/test-gaps.mjs --write-baseline --accept-new-debt",);
  } else {
    human(`test-gaps: OK — ${fresh.length} gap(s), all in the baseline (${baseline.gaps.length} known)`,);
    if (fresh.length < baseline.gaps.length) {
      human("  Gaps shrank — tighten the baseline:",);
      human("  bun run scripts/check/test-gaps.mjs --write-baseline",);
    }
  }

  console.log(
    JSON.stringify({
      ok: newGaps.length === 0,
      baselineCount: baseline.gaps.length,
      count: fresh.length,
      newGaps,
    },),
  );
  process.exit(newGaps.length > 0 ? 1 : 0,);
}

// Guarded so importing this module cannot run the scan against the importer's
// argv and call process.exit out from under it.
if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: test-gaps: ${error.message}`,);
    process.exit(2,);
  }
}
