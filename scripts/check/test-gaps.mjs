#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * test-gap ratchet — the static half of "auto generate the coverage": it
 * finds exported symbols under `src/` that no test file ever names, and
 * fails only when that gap set GROWS past the committed baseline.
 *
 * Usage:
 *   bun run scripts/check/test-gaps.mjs [--baseline <path>] [--json]
 *   bun run scripts/check/test-gaps.mjs --write-baseline [--baseline <path>]
 *
 * - Gate mode (default): exit 0 while `fresh ⊆ baseline` (gaps may shrink),
 *   exit 1 naming the NEW gaps otherwise.
 * - `--write-baseline`: rewrite the baseline from the freshly measured gap
 *   set. Unlike jscpd-ratchet.mjs's `--update` (which refuses to raise),
 *   this moves in both directions — a shrinking gap set is the win case and a
 *   growing one is the intentional accept-new-debt case.
 * - `--json`: suppress the human table on stderr. The machine-readable
 *   payload on stdout is always emitted (same split as
 *   scripts/check/coverage.mjs).
 *
 * Baseline shape deviates from `jscpd-baseline.json`'s `{ "clones": n }`
 * scalar: a count cannot express WHICH gaps are known, and only shrinking is
 * allowed, so the baseline must be the SET —
 * `{ "generatedAt", "count", "gaps": ["<path>#<export>", ...] }`.
 *
 * This is a NAME-level signal, not a coverage signal — a symbol named in any
 * test file counts as exercised whether or not the test calls it. The 80%
 * line floor in scripts/check/coverage.mjs stays the real measure; this
 * catches only the structural signal a coverage number hides: an export no
 * test file has ever heard of.
 *
 * Resource contract — the check runner fires gates concurrently
 * (Promise.allSettled over a JOBS chunk, scripts/check/parallel/runner.mjs):
 * - Gate mode owns NO resource: it reads `src/**` and the baseline and writes
 *   nothing — no temp dir, port, DB, or global state. Verified — eight
 *   simultaneous runs give byte-identical stdout and leave `.tmp/` and the
 *   baseline untouched. The shared EXPORT_PATTERNS are safe because
 *   `String.matchAll` clones the regex instead of advancing its lastIndex.
 * - `--write-baseline` owns the baseline path and nothing else: the one fixed
 *   shared resource, written atomically (temp + rename, temp keyed by pid) so a
 *   concurrent reader sees the old file or the new one, never a torn one. A
 *   torn read still fails CLOSED (exit 2, never a silent pass); the atomic write
 *   removes the window anyway.
 * - Every run is order-independent and self-contained — no state persists
 *   between invocations, so running it alone, repeated, or interleaved with
 *   itself gives the same result.
 */
import { readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);
const SRC_DIR = path.join(PROJECT_ROOT, "src",);
const DEFAULT_BASELINE = path.join(import.meta.dir, "test-gaps-baseline.json",);

/**
 * Top-level export forms. Anchored to line start with `[ \t]*`, never
 * `\s*` — `\s` spans newlines and would let a stray blank line manufacture
 * a match. The capture is a real identifier, so `export const { a } = …`
 * never yields a name.
 *
 * Deliberately NOT matched: `export default`, `export { a, b } from "…"`
 * re-export lists, and the second name of a multi-declarator
 * `export const a = 1, b = 2` — none names a symbol reachable through the
 * module's own export surface, and guessing would only add false gaps.
 *
 * `export interface` / `export type` are excluded on purpose. A type export
 * is not behaviour: nothing executes it, and no test is expected to name one
 * — a row type is exercised through the function that returns it. They were
 * the majority of the measured gap set (1778 of 3254 entries), so every new
 * exported interface would fail the gate and drown the actionable runtime
 * half in unfixable noise. Type safety already has a blocking gate
 * (`typecheck - coverage`); duplicating it here buys nothing. `enum` stays —
 * an enum emits a real runtime object.
 */
const EXPORT_PATTERNS = [
  /^[ \t]*export[ \t]+(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export[ \t]+const[ \t]+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export[ \t]+class[ \t]+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export[ \t]+enum[ \t]+([A-Za-z_$][\w$]*)/gm,
];

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

function walk(dir, out = []) {
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

/** Top-level exported names in one file's source, deduped, first-seen order. */
function exportedNames(source) {
  const names = [];
  for (const pattern of EXPORT_PATTERNS) {
    for (const match of source.matchAll(pattern,)) {
      if (!names.includes(match[1],)) { names.push(match[1],); }
    }
  }
  return names;
}

/**
 * Every identifier token anywhere in the test corpus. Tokenizing once and
 * testing set membership IS whole-word matching, at one pass instead of one
 * compiled regex per export.
 */
function identifierSet(text) {
  const found = new Set();
  for (const token of text.matchAll(/[A-Za-z_$][\w$]*/g,)) { found.add(token[0],); }
  return found;
}

/**
 * Sorted `"<repo-relative-path>#<exportName>"` keys for every export no test
 * file names. Test files are skipped as subjects; generated files are
 * excluded from BOTH sides so a name only a generated helper mentions cannot
 * mask a real gap elsewhere.
 */
function collectGaps(files) {
  const sources = files.map((abs) => ({
    rel: path.relative(PROJECT_ROOT, abs,).split(path.sep,).join("/",),
    text: readFileSync(abs, "utf8",),
  }));
  const tested = sources.filter((f,) => f.rel.endsWith(".test.ts",));
  const subjects = sources.filter((f,) =>
    !f.rel.endsWith(".test.ts",) && !SKIP_PATTERNS.some((re) => re.test(f.rel,),)
  );
  const corpus = identifierSet(tested.map((f,) => f.text,).join("\n",),);

  const gaps = [];
  for (const file of subjects) {
    for (const name of exportedNames(file.text,)) {
      if (!corpus.has(name,)) { gaps.push(`${file.rel}#${name}`,); }
    }
  }
  return gaps.sort();
}

function parseArgs(argv) {
  const args = { baseline: DEFAULT_BASELINE, write: false, quiet: false, };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--baseline" && argv[i + 1] !== undefined) {
      args.baseline = argv[i + 1];
      i++;
    } else if (argv[i] === "--write-baseline") {
      args.write = true;
    } else if (argv[i] === "--json") {
      args.quiet = true;
    }
  }
  return args;
}

function readBaseline(baselinePath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(baselinePath, "utf8",),);
  } catch (error) {
    throw new Error(`cannot read baseline ${baselinePath} (run with --write-baseline): ${error.message}`,);
  }
  if (!Array.isArray(raw.gaps) || raw.gaps.some((g,) => typeof g !== "string",)) {
    throw new Error(`baseline has no usable gaps[] array: ${baselinePath}`,);
  }
  return raw;
}

function main() {
  const args = parseArgs(process.argv.slice(2,),);
  // stderr is the human channel and is dropped entirely under --json.
  const human = args.quiet ? () => {} : (line) => console.error(line,);
  const baselinePath = path.resolve(args.baseline,);
  const fresh = collectGaps(walk(SRC_DIR,),);

  if (args.write) {
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
      try { unlinkSync(tmpPath); } catch { /* already renamed away */ }
    }
    human(`test-gaps: baseline written — ${fresh.length} gap(s) (${baselinePath})`,);
    console.log(JSON.stringify({ mode: "write-baseline", count: fresh.length, gaps: fresh, },),);
    return;
  }

  const baseline = readBaseline(baselinePath,);
  const known = new Set(baseline.gaps,);
  const newGaps = fresh.filter((gap,) => !known.has(gap,),);

  if (newGaps.length > 0) {
    human("| new test gap |",);
    human("|---|---|",);
    for (const gap of newGaps) { human(`| ${gap} |`,); }
    human(
      `test-gaps: FAIL — ${newGaps.length} NEW gap(s) (${fresh.length} total, ${baseline.gaps.length} baselined)`,
    );
    human("  Cover the new exports with a test, or accept them:",);
    human("  bun run scripts/check/test-gaps.mjs --write-baseline",);
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

// Guarded so importing this module (a future unit test) cannot run the scan
// against the importer's argv and call process.exit out from under it.
if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: test-gaps: ${error.message}`,);
    process.exit(2,);
  }
}
