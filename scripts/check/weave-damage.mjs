#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Weave-damage scan — catches merge/rebase artifacts that typecheck, lint,
 * and duplicate-line scanners all miss.
 *
 * The weave auto-resolver behind `giwt rebase` can silently DUPLICATE lines
 * (and, worse, DROP whole code blocks). Dropped blocks leave the file
 * syntactically valid, so every static gate stays green while tests fail —
 * observed 2026-10-01 when a `mock.module("./api", …)` registration
 * vanished from src/tui/chat/index.test.ts and only the unit suite noticed.
 *
 * This scan catches the duplication half mechanically. The drop half needs
 * a manual `git diff <pre-rebase-sha> -- <file>` per auto-resolved file;
 * there is no cheap mechanical signal for "content that should be there".
 *
 * Usage:
 *   WEAVE_BASE=<pre-rebase-ref> bun run scripts/check/weave-damage.mjs
 *   bun run scripts/check/weave-damage.mjs <pre-rebase-ref>
 *
 * Compares every file that differs from <base> (committed or unstaged) and
 * exits 1 when its consecutive-duplicate-line count grew vs the base
 * version. Paths absent at <base> are skipped rather than scored against a
 * zero baseline: a new file has no growth to measure, and the resolver only
 * rewrites paths present on both sides of a conflict, so new files are
 * outside its damage surface.
 *
 * Without a base ref it reports skipped and exits 0, so the gate entry in
 * check-parallel.mjs is a no-op on normal runs.
 */
import { readFileSync, } from "node:fs";
import path from "node:path";
import { argument, object, optional, runScript, string, } from "../../src/cli/parser";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/** Longer than this: short repeats (`});`, `}`) are normal code shape. */
const MIN_DUPE_LENGTH = 15;

/** Consecutive identical lines — the weave's duplication fingerprint. */
export function countConsecutiveDupes(text,) {
  const lines = text.split("\n",);
  let dupes = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MIN_DUPE_LENGTH && line === lines[i - 1]) { dupes++; }
  }
  return dupes;
}

function spawnStdout(args,) {
  const proc = Bun.spawnSync(args, { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe", },);
  if (proc.exitCode !== 0) {
    throw new Error(`${args.join(" ",)} exited ${proc.exitCode}: ${new TextDecoder().decode(proc.stderr,)}`,);
  }
  return new TextDecoder().decode(proc.stdout,);
}

function changedFiles(base,) {
  const out = spawnStdout(["git", "diff", "--name-only", "--diff-filter=d", base,],);
  return out.split("\n",).map((line,) => line.trim()).filter(Boolean,);
}

/**
 * Content of `file` at `base`, or null when the path is absent from that
 * tree. `main` verifies the ref before the loop, so a `git show` failure
 * here can only mean absence — it is not standing in for an unusable ref.
 */
function readAtBase(base, file,) {
  try {
    return spawnStdout(["git", "show", `${base}:${file}`,],);
  } catch {
    return null; // absent at base
  }
}

function main() {
  // Inside `main`, not at module scope: the colocated test IMPORTS this
  // module, and a module-scope runScript would parse the importer's argv.
  const args = runScript(
    object({ base: optional(argument(string(),),), },),
    {
      programName: "weave-damage",
      brief: "Fail when files gained consecutive duplicate lines vs a pre-rebase base ref.",
      examples:
        "weave-damage <pre-rebase-ref>   # scan against the given ref\n  WEAVE_BASE=<ref> weave-damage   # same, ref from the environment",
      help: "option",
    },
  );
  const base = args.base ?? process.env.WEAVE_BASE;
  if (!base) {
    console.log("weave - damage scan: skipped (no base ref; set WEAVE_BASE or pass <ref>)",);
    return;
  }

  // Fail fast on an unusable ref. Without this, every `git show` below would
  // fail exactly as an absent path does, and each file would be scored
  // against a zero baseline instead of reporting the real problem.
  spawnStdout(["git", "rev-parse", "--verify", `${base}^{commit}`,],);

  const files = changedFiles(base,);
  const offenders = [];
  let newFiles = 0;
  for (const file of files) {
    let current;
    try {
      current = readFileSync(path.join(PROJECT_ROOT, file,), "utf8",);
    } catch {
      continue; // deleted in the working tree
    }
    const atBase = readAtBase(base, file,);
    if (atBase === null) {
      newFiles++;
      continue;
    } // no baseline: growth undefined
    const before = countConsecutiveDupes(atBase,);
    const after = countConsecutiveDupes(current,);
    if (after > before) { offenders.push({ file, before, after, },); }
  }

  if (offenders.length === 0) {
    const newNote = newFiles > 0 ? `, ${newFiles} new (no baseline)` : "";
    console.log(`weave - damage scan: clean (${files.length} file(s) vs ${base}${newNote})`,);
    return;
  }

  console.log(`weave - damage scan: ${offenders.length} file(s) gained consecutive duplicate lines vs ${base}:`,);
  for (const offender of offenders) {
    console.log(`  ${offender.file}: ${offender.before} → ${offender.after}`,);
  }
  console.log("Weave duplication artifact — resolve the merge/rebase conflict by hand.",);
  process.exit(1,);
}

// Guarded so importing this module (the test below) cannot run the scan
// against the importer's argv and call process.exit out from under it.
if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error("weave - damage scan failed:", error.message,);
    process.exit(1,);
  }
}
