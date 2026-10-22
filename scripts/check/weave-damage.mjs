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
 *   bun run scripts/check/weave-damage.mjs   # base derived from the root branch
 *
 * Compares every file that differs from <base> (committed or unstaged) and
 * exits 1 when its consecutive-duplicate-line count grew vs the base
 * version. Paths absent at <base> are skipped rather than scored against a
 * zero baseline: a new file has no growth to measure, and the resolver only
 * rewrites paths present on both sides of a conflict, so new files are
 * outside its damage surface.
 *
 * With no base named, the base is DERIVED: the merge-base of HEAD and the
 * root branch (`giwt.toml`'s `[branches] root`) — the point the branch
 * forked from, which is the base a weave rebase replays commits onto. When
 * no base can be derived (detached HEAD, no root branch) the scan reports
 * skipped and exits 0 rather than failing.
 *
 * The scan also runs `dprint check` over the files it touches: the weave
 * driver once resolved a conflict by unioning both sides' import blocks in
 * the wrong order, which typecheck accepted and only dprint rejected.
 */
import { existsSync, readFileSync, } from "node:fs";
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

/**
 * The root branch the repo's worktrees fork from (`giwt.toml`'s
 * `[branches] root`). Falls back to "dev" when the config is absent, so a
 * fixture repo without giwt.toml still has a base to try.
 */
export function rootBranch() {
  try {
    const toml = Bun.TOML.parse(readFileSync(path.join(PROJECT_ROOT, "giwt.toml",), "utf8",),);
    return toml?.branches?.root ?? "dev";
  } catch {
    return "dev";
  }
}

/** Run git in `cwd` and return its stdout, or null when git failed. */
function gitOut(args, cwd,) {
  const proc = Bun.spawnSync(["git", ...args,], { cwd, stdout: "pipe", stderr: "pipe", },);
  return proc.exitCode === 0 ? new TextDecoder().decode(proc.stdout,) : null;
}

/**
 * The base the scan measures against when the caller names none: the
 * merge-base of HEAD and the root branch — the point the branch forked from,
 * which is the base a weave rebase replays commits onto.
 *
 * Returns null when no base can be derived (detached HEAD, no root branch,
 * no merge base); the scan then skips instead of failing.
 */
export function deriveWeaveBase(cwd = PROJECT_ROOT,) {
  // A detached HEAD has no branch that could have been based on something.
  if (gitOut(["symbolic-ref", "-q", "HEAD",], cwd,) === null) { return null; }
  const root = rootBranch();
  for (const ref of [root, `origin/${root}`,]) {
    // --fork-point follows the root branch's reflog, so a branch that MERGED
    // the root branch's newer commits still measures against them. The plain
    // merge-base would stay at the old fork point there and charge the root
    // branch's own changes to this branch.
    const forkPoint = gitOut(["merge-base", "--fork-point", "HEAD", ref,], cwd,);
    if (forkPoint !== null) { return forkPoint.trim(); }
    const base = gitOut(["merge-base", "HEAD", ref,], cwd,);
    if (base !== null) { return base.trim(); }
  }
  return null;
}

/**
 * `dprint check` over the files the scan already touches. The weave driver
 * resolved one conflict by unioning both sides' import blocks in the WRONG
 * ORDER: typecheck stayed green and only `dprint check` caught it (exit 20).
 *
 * "clean" when the files are formatted (or when there is nothing to check
 * against), "diff" when dprint reports formatting differences, "error" when
 * dprint itself failed.
 */
function dprintCheck(files,) {
  const output = (proc,) => new TextDecoder().decode(proc.stdout,) + new TextDecoder().decode(proc.stderr,);
  if (files.length === 0) { return { status: "clean", output: "", }; }
  // No config, no rules: there is nothing for dprint to check against.
  if (!existsSync(path.join(PROJECT_ROOT, "dprint.json",),)) {
    return { status: "clean", output: "", };
  }
  const proc = Bun.spawnSync(["bunx", "dprint", "check", ...files,], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  if (proc.exitCode === 20) { return { status: "diff", output: output(proc,), }; }
  // 14 = no files matched dprint's config; 0 = clean.
  if (proc.exitCode === 0 || proc.exitCode === 14) {
    return { status: "clean", output: output(proc,), };
  }
  return { status: "error", output: output(proc,), };
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
  const base = args.base ?? process.env.WEAVE_BASE ?? deriveWeaveBase();
  if (!base) {
    console.log(
      "weave - damage scan: skipped (no base ref; set WEAVE_BASE, pass <ref>, or work on a branch of the root branch)",
    );
    return;
  }

  // Fail fast on an unusable ref. Without this, every `git show` below would
  // fail exactly as an absent path does, and each file would be scored
  // against a zero baseline instead of reporting the real problem.
  spawnStdout(["git", "rev-parse", "--verify", `${base}^{commit}`,],);

  const files = changedFiles(base,);
  const offenders = [];
  const scanned = [];
  let newFiles = 0;
  for (const file of files) {
    let current;
    try {
      current = readFileSync(path.join(PROJECT_ROOT, file,), "utf8",);
    } catch {
      continue; // deleted in the working tree
    }
    scanned.push(file,);
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
    const dprint = dprintCheck(scanned,);
    if (dprint.status === "diff") {
      console.log("weave - damage scan: dprint reports formatting drift in the files the scan touched:",);
      console.log(dprint.output.trim(),);
      console.log("Weave damage — the resolved conflict reordered code. Run `bun run format:fix`.",);
      process.exit(1,);
    }
    if (dprint.status === "error") {
      // dprint itself failed (a missing plugin, a broken toolchain). The
      // format gate owns dprint's failures; this gate owns weave damage, so a
      // formatter that cannot run is reported and skipped, never a failure of
      // the scan itself.
      console.error("weave - damage scan: dprint check could not run:",);
      console.error(dprint.output.trim(),);
    }
    const dprintNote = dprint.status === "error" ? "; dprint could not run" : "; dprint clean";
    console.log(`weave - damage scan: clean (${files.length} file(s) vs ${base}${newNote}${dprintNote})`,);
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
