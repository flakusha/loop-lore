// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * audit-branches.ts — Classify local branches against a base ref.
 *
 * Answers "which of these branches can be deleted, which still carry work"
 * with the RIGHT primitive. `git merge-base --is-ancestor <branch> <base>` is
 * NOT it: on a repo where the base has moved hundreds of commits ahead, every
 * branch cut from an older base reports "unmerged" — including branches whose
 * content the base already holds. This script uses `git cherry` (patch-id
 * equivalence) plus a tree-vs-tree diff instead.
 *
 * Verdicts (only the two that are mechanically provable are auto-decided):
 *   MERGED      branch tip is an ancestor of the base — delete.
 *   PATCH-EQ    every commit's patch already exists on the base (`git cherry`
 *               reports no `+` lines) — delete.
 *   REVIEW      at least one commit is not patch-equivalent. The row prints the
 *               evidence (files the base lacks, which side is heavier) so a
 *               human decides. The script never guesses: a commit that looks
 *               superseded can still carry a lost line, and a branch can carry
 *               whole files the base deleted on purpose.
 *
 * Branches that still have a worktree are annotated, and a DIRTY worktree is
 * flagged loudly — a concurrent session may own it.
 *
 * Read-only: no ref is created, moved, or deleted.
 *
 * Usage:
 *   bun run scripts/audit-branches.ts                 # pretty table, base=dev
 *   bun run scripts/audit-branches.ts --base master   # different base
 *   bun run scripts/audit-branches.ts --json          # JSON output
 *   bun run scripts/audit-branches.ts --strict        # exit 1 if any REVIEW
 */

import process from "node:process";
import { flag, object, runScript, withDefault, } from "../src/cli/parser";

/** Branch names this script never audits (the base is added at runtime). */
const PROTECTED: Record<string, true> = { dev: true, master: true, };

interface BranchReport {
  name: string;
  merged: boolean;
  ahead: number;
  behind: number;
  novel: number;
  equivalent: number;
  verdict: "MERGED" | "PATCH-EQ" | "REVIEW";
  /** Files present on the branch but absent from the base. */
  branchOnlyFiles: string[];
  /** Files the base changed more than the branch did. */
  baseHeavier: number;
  branchHeavier: number;
  worktree: string | null;
  worktreeDirty: number;
}

function git(args: string[],): { out: string; code: number } {
  const proc = Bun.spawnSync(["git", ...args,], { stdout: "pipe", stderr: "pipe", },);
  return { out: proc.stdout.toString().trim(), code: proc.exitCode, };
}

function lines(text: string,): string[] {
  return text === "" ? [] : text.split("\n",);
}

function classify(base: string, branch: string,): BranchReport {
  const name = branch;
  const merged = git(["merge-base", "--is-ancestor", name, base,],).code === 0;

  const ahead = Number.parseInt(git(["rev-list", "--count", `${base}..${name}`,],).out, 10,) || 0;
  const behind = Number.parseInt(git(["rev-list", "--count", `${name}..${base}`,],).out, 10,) || 0;

  const cherry = lines(git(["cherry", base, name,],).out,);
  const novel = cherry.filter((l,) => l.startsWith("+",)).length;
  const equivalent = cherry.filter((l,) => l.startsWith("-",)).length;

  let verdict: BranchReport["verdict"] = "REVIEW";
  if (merged) {
    verdict = "MERGED";
  } else if (ahead > 0 && novel === 0) {
    verdict = "PATCH-EQ";
  }

  // Only a REVIEW row needs the (more expensive) tree comparison.
  let branchOnlyFiles: string[] = [];
  let baseHeavier = 0;
  let branchHeavier = 0;
  if (verdict === "REVIEW") {
    branchOnlyFiles = lines(git(["diff", "--diff-filter=A", "--name-only", base, name,],).out,);
    for (const row of lines(git(["diff", "--numstat", base, name,],).out,)) {
      const [a, d, ,] = row.split("\t",);
      const adds = Number.parseInt(a ?? "0", 10,) || 0;
      const dels = Number.parseInt(d ?? "0", 10,) || 0;
      if (adds >= dels) {
        baseHeavier++;
      } else {
        branchHeavier++;
      }
    }
  }

  const worktree = WORKTREES.get(name,) ?? null;
  const worktreeDirty = worktree === null
    ? 0
    : lines(git(["-C", worktree, "status", "--porcelain",],).out,).length;

  return {
    name,
    merged,
    ahead,
    behind,
    novel,
    equivalent,
    verdict,
    branchOnlyFiles,
    baseHeavier,
    branchHeavier,
    worktree,
    worktreeDirty,
  };
}

/** branch name -> worktree path, from `git worktree list --porcelain`. */
const WORKTREES = ((): Map<string, string> => {
  const map = new Map<string, string>();
  let current: string | null = null;
  for (const line of lines(git(["worktree", "list", "--porcelain",],).out,)) {
    if (line.startsWith("worktree ",)) {
      current = line.slice("worktree ".length,);
    } else if (line.startsWith("branch refs/heads/",) && current !== null) {
      map.set(line.slice("branch refs/heads/".length,), current,);
    }
  }
  return map;
})();

function printTable(base: string, reports: BranchReport[],): void {
  const out = process.stdout;
  out.write(`\nBranches vs ${base} (${reports.length} audited, protected names skipped)\n\n`,);

  for (const r of reports) {
    const tag = r.verdict === "PATCH-EQ"
      ? "DELETE (patch-equivalent)"
      : r.verdict === "MERGED"
      ? "DELETE (merged)"
      : "REVIEW";
    out.write(`  ${r.name}\n`,);
    out.write(`    ${tag}  ahead=${r.ahead} behind=${r.behind} novel=${r.novel} equivalent=${r.equivalent}\n`,);
    if (r.verdict === "REVIEW") {
      out.write(
        `    files the base lacks: ${r.branchOnlyFiles.length}  base-heavier: ${r.baseHeavier}  branch-heavier: ${r.branchHeavier}\n`,
      );
      for (const f of r.branchOnlyFiles.slice(0, 10,)) {
        out.write(`      + ${f}\n`,);
      }
      if (r.branchOnlyFiles.length > 10) {
        out.write(`      … ${r.branchOnlyFiles.length - 10} more\n`,);
      }
    }
    if (r.worktree !== null) {
      out.write(`    worktree: ${r.worktree}${r.worktreeDirty > 0 ? `  DIRTY (${r.worktreeDirty} files)` : ""}\n`,);
    }
    out.write("\n",);
  }

  const dirty = reports.filter((r,) => r.worktreeDirty > 0);
  if (dirty.length > 0) {
    out.write(`warn: ${dirty.length} worktree(s) have uncommitted changes — they may belong to another session.\n`,);
  }
}

if (import.meta.main) {
  const { base, json, strict, } = runScript(
    object({
      base: withDefault(flag("--base",), "dev",),
      json: withDefault(flag("--json",), false,),
      strict: withDefault(flag("--strict",), false,),
    },),
    {
      programName: "audit-branches",
      brief: "Classify local branches against a base ref (delete / review).",
      help: "option",
    },
  );

  if (git(["rev-parse", "--verify", base,],).code !== 0) {
    process.stderr.write(`error: base ref '${base}' does not exist\n`,);
    process.exit(1,);
  }

  const all = lines(git(["for-each-ref", "--format=%(refname:short)", "refs/heads/",],).out,);
  const reports = all
    .filter((b,) => b !== base && PROTECTED[b] !== true)
    .map((b,) => classify(base, b,));

  if (json) {
    process.stdout.write(JSON.stringify(reports, null, 2,) + "\n",);
  } else {
    printTable(base, reports,);
  }

  if (strict && reports.some((r,) => r.verdict === "REVIEW")) {
    process.exit(1,);
  }
}
