// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Diff-scoped static gates. `--diff-base` already narrows the coverage gate
 * (test SET and per-file FLOOR) and the browser baseline (spec SET) in
 * `gates.mjs`; this module narrows the two remaining whole-tree scans worth
 * narrowing. Own module because `gates.mjs` is already near the 250L
 * `size - strict` limit and this is a separate concern with its own test.
 *
 * ponytail: ceiling — narrowing is a PATH rule, not an import graph. A change
 * to a shared type can newly violate a typed lint rule in a file the diff never
 * touched, and that file is not re-linted. The bias is deliberate (a slower
 * gate is merely slow; a wrong narrowing is a false green) and the escape
 * hatch is `--gates "lint - eslint"` without `--diff-base`, which is the full
 * run.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import { PROJECT_ROOT, } from "./config.mjs";
import { CHANGED_FILES, DIFF_BASE, } from "./context.mjs";

const FULL_ESLINT = "bun run lint:eslint";
const FULL_MD_LINT = "bun run md:lint";
// Files that decide what the OTHER files mean. A diff touching any of them
// changes the rules themselves, so every scoped gate falls back to the full
// run: narrowing on a config change is how you get a green gate that checked
// nothing.
const SCOPE_BREAKERS = new Set([
  ".markdownlint.json",
  "dprint.json",
  "eslint.config.mjs",
  "oxlint.config.ts",
  "package.json",
  "tsconfig.backend.json",
  "tsconfig.frontend.json",
  "tsconfig.json",
  "tsconfig.scripts.json",
],);
// Shell-safe by construction: the gate command is executed through `bash -c`
// (gate-timeout.mjs), so a path carrying a space or a quote would split or
// break out of its argument. Anything outside this alphabet forces the full
// run instead — a slower gate, never a wrong one.
const SAFE_PATH = /^[A-Za-z0-9._/@-]+$/;
// Past this many files the full run is cheaper than the command line, and a
// diff that wide is a merge, not a change.
const SCOPED_PATH_MAX = 200;

/**
 * Pick the diff-touched files a file-list-scoped gate should run on.
 *
 * Exported for the unit test, which feeds it fixtures so the guard rails
 * (breaker file, deleted path, unsafe path, empty set, oversized set) are
 * pinned without spawning a gate.
 *
 * @param files - Changed repo-relative paths (CHANGED_FILES).
 * @param extPattern - Which of them this gate can actually consume.
 * @param exists - Existence probe, injected so the test needs no filesystem.
 * @returns The paths to pass, or null meaning "run the FULL gate". Null is
 *   never "run nothing": an empty file list exits 0 having linted zero files,
 *   which is exactly the NOOP_OK false green the runner already guards against
 *   elsewhere.
 */
export function pickScopedFiles(files, extPattern, exists,) {
  if (files.some((f,) => SCOPE_BREAKERS.has(f,))) { return null; }
  const picked = files.filter(
    (f,) => extPattern.test(f,) && exists(f,) && SAFE_PATH.test(f,),
  );
  if (picked.length === 0 || picked.length > SCOPED_PATH_MAX) { return null; }
  return picked;
}

const onDisk = (f,) => existsSync(path.resolve(PROJECT_ROOT, f,),);

/**
 * Narrow `lint - eslint` and `md - lint` to the diff, in place. No-op without
 * `--diff-base`: plain runs keep the static registry commands verbatim.
 *
 * Measured on this host at the same commit (`bun .tmp/finalize-profile.ts
 * --measure`, see docs/meta/tooling/finalize-speedup.md):
 * `bun run lint:eslint` 18.4s / 19395 MB peak RSS against 5.8s / 2137 MB on a
 * 5-file diff — the memory, not the time, is the OOM lever, since `HEAVY_NAMES`
 * serializes gates by footprint and 19 GB is why eslint sits in it.
 *
 * @param checks - The assembled gate table; mutated in place.
 * @throws When a plain-mode command was changed without a diff to justify it.
 */
export function applyDiffScopedStaticGates(checks,) {
  if (DIFF_BASE) {
    const scopedLint = pickScopedFiles(CHANGED_FILES, /\.(ts|tsx|js|jsx|mjs|cjs|md)$/, onDisk,);
    // `--concurrency=8` mirrors package.json's `lint:eslint`; the file list is
    // appended to the same invocation, so the config is identical either way.
    if (scopedLint) {
      checks["lint - eslint"] = `bunx eslint --concurrency=8 ${scopedLint.join(" ",)}`;
    }
    const scopedMd = pickScopedFiles(CHANGED_FILES, /\.md$/, onDisk,);
    if (scopedMd) {
      // Called directly rather than through `bun run md:lint`, whose script
      // hard-codes the two tree globs — appending files to it lints the globs
      // AND the files, i.e. no narrowing at all. markdownlint-cli2
      // auto-discovers `.markdownlint.json`, which is why that file is a scope
      // breaker.
      checks["md - lint"] = `bunx markdownlint-cli2 ${scopedMd.join(" ",)}`;
    }
  }

  // The plain-mode registry must be untouched. Run BEFORE the --gates filter
  // deletes gates the caller did not ask for, and throw rather than let a
  // silently half-scoped gate report as green.
  if (!DIFF_BASE && (checks["lint - eslint"] !== FULL_ESLINT || checks["md - lint"] !== FULL_MD_LINT)) {
    throw new Error(
      "plain-mode lint/md:lint commands changed — the diff-scoped override must only run when DIFF_BASE is set",
    );
  }
}
