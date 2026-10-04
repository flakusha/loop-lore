#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Conflict-marker scan — fails when any tracked file still contains git
 * merge/rebase conflict markers.
 *
 * Conflict markers reached dev twice in the 2026-10-01..04 window
 * (82124d0b5 left markers in entities.ts — behind them an unbounded
 * `keywords` update schema survived ~2 days; ab4fc259a committed markers in
 * locale/UI files, fixed by 668097e8f). Both survived typecheck and lint —
 * markers sit inside string/locale values or dead branches that still
 * parse — and only the unit suite noticed. `git grep` over the tracked
 * working tree is the mechanical signal both cases needed.
 *
 * Usage: bun run scripts/check/conflict-markers.mjs
 *
 * Exit codes: 0 clean, 1 markers found, 2 git failure. `git grep` uses
 * exit 1 for "no matches", so a tooling failure must never read as clean.
 *
 * Scans tracked working-tree files only (git grep default): untracked dirt
 * is refused earlier by the finalize clean-state check, and merges commit
 * their resolutions, so markers reach this gate through tracked paths.
 */
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/**
 * Marker line shapes at git's fixed 7-char width, with the one deliberate
 * false-positive boundary: `={7}$` is pinned to the exact full-line form, so
 * a markdown setext underline of eight or more `=` (a legal heading
 * underline) does not match — pattern verified clean against the whole
 * tracked tree on 2026-10-04.
 */
export const CONFLICT_MARKER_PATTERN = "^(<{7,} |={7}$|>{7,} |\\|{7,} )";

function main() {
  // git grep exit codes: 0 = matches found, 1 = clean, anything higher = error.
  const proc = Bun.spawnSync(
    ["git", "grep", "-n", "-I", "-E", CONFLICT_MARKER_PATTERN, "--", ".",],
    { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe", },
  );
  if (proc.exitCode === null) {
    throw new Error("git grep did not run (spawn failure)",);
  }
  if (proc.exitCode > 1) {
    throw new Error(
      `git grep exited ${proc.exitCode}: ${new TextDecoder().decode(proc.stderr,)}`,
    );
  }
  const out = new TextDecoder().decode(proc.stdout,).trim();
  if (proc.exitCode === 1 || out === "") {
    console.log("conflict - markers: clean (no merge/rebase markers in tracked files)",);
    return;
  }

  const findings = out.split("\n",);
  console.log(`conflict - markers: ${findings.length} marker line(s) in tracked files:`,);
  for (const finding of findings) {
    console.log(`  ${finding}`,);
  }
  console.log("Resolve the merge/rebase conflict markers by hand and re-run.",);
  process.exit(1,);
}

// Guarded so importing this module (the test) cannot run the scan against
// the importer's argv and call process.exit out from under it.
if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error("conflict - markers scan failed:", error.message,);
    process.exit(2,);
  }
}
