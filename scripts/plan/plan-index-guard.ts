// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The `.plan/tickets/index.json` write guard — the decision that decides
 * whether the ticket index may be written at all.
 *
 * `index.json` must never be written from a linked worktree: a worktree-local
 * index gets `git add -A`-ed onto the feature branch and conflicts at merge
 * time, because giwt regenerates the index post-merge on the target branch.
 * giwt refuses that write itself (`sync-index-write.ts:20`); this guard exists so
 * the repo's own normalizer does not quietly defeat it.
 *
 * The guard is split so the DECISION is testable without git and without a
 * filesystem:
 *
 *   probeWorktree      impure — spawns git; the only subprocess in this module
 *   decideIndexWrite   pure  — the answer, from the probe's own output
 *
 * A probe that cannot run, exits non-zero, or answers with anything other than
 * the two paths it was asked for is NOT evidence of "main checkout": it
 * resolves to "do not write", loudly. `projectIndexOntoDisk` is the only
 * caller-facing entry point that performs the write, and `loadIndex` is split
 * out so a caller can parse the index BEFORE any other file is touched.
 */
import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import {
  canonicalIndexOrder,
  type IndexEntryLike,
  projectIndex,
} from "./plan-index-projection";

/** What the git probe reported. `ok: false` is a FAILED PROBE, not a verdict. */
export type WorktreeProbe =
  | { ok: true; dirs: string[] }
  | { ok: false; reason: string };

/**
 * Pure: does this probe output describe a linked worktree?
 *
 * `git rev-parse --git-dir --git-common-dir` prints one path per line. In a
 * normal checkout both are `.git` (equal); in a linked worktree they diverge —
 * `<repo>/.git/worktrees/<name>` vs `<repo>/.git`. Anything that is not exactly
 * two lines is not a verdict this function will act on.
 */
export function isLinkedWorktreeFrom(dirs: string[],): boolean {
  return dirs.length === 2 && dirs[0] !== dirs[1];
}

/**
 * Pure: turn a finished probe's raw output into a verdict, FAILING CLOSED.
 *
 * Three shapes are not "main checkout", and none of them may authorize a
 * write: a non-zero exit, output that is not the two paths git was asked for
 * (a truncated pipe, a wrapper that prints usage), and an empty answer. All
 * three come back as `{ ok: false, reason }` naming which one it was.
 */
export function classifyProbe(probe: { exitCode: number; stdout: string; stderr: string },): WorktreeProbe {
  if (probe.exitCode !== 0) {
    const why = probe.stderr.trim() || "(no stderr)";
    return { ok: false, reason: `git rev-parse exited ${probe.exitCode}: ${why}`, };
  }
  const dirs = probe.stdout.trim().split("\n",).map((line,) => line.trim());
  if (dirs.length !== 2) {
    return {
      ok: false,
      reason: `unexpected git rev-parse output: ${dirs.length} line(s), expected 2 (--git-dir, --git-common-dir)`,
    };
  }
  return { ok: true, dirs, };
}

/**
 * Impure half of the guard, mirroring giwt's own probe
 * (`utils/worktree-probe.ts`). Never throws: an unrunnable probe comes back as
 * `{ ok: false, reason }` so the caller fails closed instead of reading the
 * absence of evidence as a clean bill of health.
 */
export function probeWorktree(root: string,): WorktreeProbe {
  try {
    const probe = Bun.spawnSync(
      ["git", "-C", root, "rev-parse", "--git-dir", "--git-common-dir",],
      { stdout: "pipe", stderr: "pipe", },
    );
    return classifyProbe({
      exitCode: probe.exitCode,
      stdout: probe.stdout.toString(),
      stderr: probe.stderr.toString(),
    },);
  } catch (err) {
    return { ok: false, reason: `git could not be run: ${err instanceof Error ? err.message : String(err,)}`, };
  }
}

/** The one decision this guard exists to make. */
export type IndexWrite =
  | "write"
  | "skip-dry-run"
  | "skip-no-change"
  | "skip-no-index"
  | "skip-linked-worktree"
  | "skip-probe-failed";

/**
 * May `index.json` be written? Pure, and FAIL CLOSED: `ok: false` resolves to
 * `skip-probe-failed`, never `write`. A git missing from PATH, a repo blocked by
 * `safe.directory`, or a spawn failure previously reported "not a linked
 * worktree", which authorized the exact write this guard exists to prevent.
 */
export function decideIndexWrite(probe: WorktreeProbe, indexChanged: boolean, dryRun: boolean,): IndexWrite {
  if (dryRun) { return "skip-dry-run"; }
  if (!indexChanged) { return "skip-no-change"; }
  if (!probe.ok) { return "skip-probe-failed"; }
  // Re-check the shape HERE, not only in `classifyProbe`: `WorktreeProbe` is an
  // exported type, so any caller may hand this function a structurally-valid
  // `ok: true` carrying the wrong number of paths. Without this line such a
  // probe reads as "not a linked worktree" and authorizes the write.
  if (probe.dirs.length !== 2) { return "skip-probe-failed"; }
  return isLinkedWorktreeFrom(probe.dirs,) ? "skip-linked-worktree" : "write";
}

/** Everything the caller needs to know about the guarded write. */
export interface IndexOutcome {
  tagsFilled: number;
  epicsFilled: number;
  decision: IndexWrite;
  written: boolean;
  /** Operator-facing explanation; non-null only when a guard held the write. */
  notice: string | null;
  /** LOUD; non-null when the guard itself could not be evaluated at all. */
  error: string | null;
}

/**
 * Project the normalized `.md` fields onto the ticket index, then write it only
 * if `decideIndexWrite` says so.
 *
 * `index` arrives already-parsed (see `loadIndex`) so the parse can happen
 * BEFORE the markdown pass and abort a malformed index with the tree untouched.
 */
export function projectIndexOntoDisk(
  root: string,
  indexPath: string,
  index: Record<string, IndexEntryLike> | null,
  probe: WorktreeProbe,
  dryRun: boolean,
): IndexOutcome {
  const base = { tagsFilled: 0, epicsFilled: 0, written: false, notice: null, error: null, };
  if (index === null) { return { ...base, decision: "skip-no-index", }; }

  const { next, tagsFilled, epicsFilled, } = projectIndex(index, (src,) => {
    const abs = join(root, src,);
    return existsSync(abs,) ? readFileSync(abs, "utf8",) : null;
  },);
  const decision = decideIndexWrite(probe, tagsFilled > 0 || epicsFilled > 0, dryRun,);
  if (decision === "write") {
    // Sorted, not written in insertion order, so a key added out of band lands
    // where giwt expects it instead of wherever it was appended.
    writeFileSync(indexPath, JSON.stringify(canonicalIndexOrder(next,), null, 2,) + "\n",);
  }

  const held = tagsFilled + epicsFilled;
  let notice: string | null = null;
  let error: string | null = null;
  if (!probe.ok) {
    error = `plan:metadata: could NOT verify the worktree layout — ${probe.reason}. ` +
      "index.json is left untouched on purpose: this script will not write the ticket index when it " +
      "cannot prove it is in the main checkout. Restore git (PATH / safe.directory) and re-run.";
    if (held > 0) {
      notice = `  ^ NOT WRITTEN: the worktree probe failed, so plan:metadata cannot prove this is the main ` +
        `checkout. ${held} backfill(s) are pending — re-run it in the main checkout.`;
    }
  } else if (decision === "skip-linked-worktree" && held > 0) {
    notice = "  ^ NOT WRITTEN: linked worktree. giwt regenerates index.json post-merge on the target branch;" +
      " re-run this script in the main checkout to persist.";
  }
  return { tagsFilled, epicsFilled, decision, written: decision === "write", notice, error, };
}

/**
 * The ticket index, or `null` when there is no index file (a repo without one
 * degrades: the markdown pass still runs). Throws on malformed JSON on purpose
 * — callers MUST call this before any write, so conflict markers left in
 * `index.json` by a ticket-branch merge abort the run instead of leaving half
 * the `.md` files rewritten with no report at all.
 */
export function loadIndex(indexPath: string,): Record<string, IndexEntryLike> | null {
  if (!existsSync(indexPath,)) { return null; }
  return JSON.parse(readFileSync(indexPath, "utf8",),) as Record<string, IndexEntryLike>;
}
