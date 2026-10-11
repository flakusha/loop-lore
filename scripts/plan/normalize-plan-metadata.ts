// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan metadata normalizer — the CLI that walks `.plan/`, applies the header
 * rewrites its field layer plans, and reports the epic↔ticket↔code links that
 * stay broken.
 *
 * The field grammars and the index.json projection live in sibling modules
 * (`plan-markdown-fields.ts`, `plan-index-projection.ts`); this file is the
 * orchestration, the linked-worktree guard, and the reporting around them.
 * `runPlanMetadata` is exported so the guard's write DECISION can be exercised
 * against a fixture tree, without a git repo and without touching `.plan/`.
 *
 * Root causes this fixes (measured; see `scripts/plan/README.md`):
 *
 *  1. `**Labels:**` vs `**Tags:**` — 395 tickets and 6 epics carry a
 *     populated `**Labels:**` line. Nothing in the repo reads that field,
 *     so those tags never reach `index.json` and every one of those
 *     tickets lands in the matrix's `(untagged)` row. This rewrites the
 *     field NAME to `**Tags:**`, keeping the author's value byte-for-byte.
 *
 *  2. `**Epic**:` (colon outside the bold) — 170 tickets use it. giwt's
 *     ticket parser matches `\/\*\*Epic:\*\*\/` only, so those values are
 *     invisible: the index records `epic: ""` and the matrix files them
 *     under `(unbound)`. This rewrites the line to the canonical
 *     `**Epic:**` spelling.
 *
 *  3. Dangling epic references — values naming an epic file that does not
 *     exist (`epic-chat-rich-engagement.md (proposed)`,
 *     `` `epic-frontend-keynav-mobile` ``). Reported, never auto-fixed:
 *     resolving them needs a human who knows which epic was meant.
 *
 * NOTHING is inferred. No tag is derived from a title, a body, or an
 * `src/` path — a wrong guessed tag is worse than no tag. Every rewrite
 * preserves an author-written value verbatim; a file is rewritten only
 * when a rewrite actually applies.
 *
 * `**Status:**` lines are never read, matched, or written here: each
 * rewrite replaces exactly one `**Tags**`/`**Labels**`/`**Epic**` line,
 * matched by its full source text.
 *
 * Usage:
 *   bun run scripts/plan/normalize-plan-metadata.ts            # apply
 *   bun run scripts/plan/normalize-plan-metadata.ts --dry-run  # report only
 *   bun run scripts/plan/normalize-plan-metadata.ts --json     # machine-readable
 *
 * Idempotent: a second run on a normalized tree reports 0 rewrites and
 * touches no files.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { flag, object, runScript, withDefault, } from "../../src/cli/parser";
import {
  canonicalIndexOrder,
  type IndexEntryLike,
  projectIndex,
} from "./plan-index-projection";
import {
  applyRewrites,
  planFile,
  type PlanRewrite,
  relatedRefs,
} from "./plan-markdown-fields";

// ── linked-worktree guard ──────────────────────────────────────────────────
//
// `index.json` must never be written from a linked worktree: a worktree-local
// index gets `git add -A`-ed onto the feature branch and conflicts at merge
// time, because giwt regenerates the index post-merge on the target branch.
// giwt refuses that write itself (`sync-index-write.ts:20`); this guard exists so
// `plan:metadata` does not quietly defeat it.
//
// The guard is split in two so the DECISION is testable without git:
//
//   probeWorktree      impure — spawns git; the only subprocess in this module
//   decideIndexWrite   pure  — the answer, from the probe's own output
//
// A probe that cannot run is NOT evidence of "main checkout": it resolves to
// "do not write", loudly (see `decideIndexWrite`).

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
 * Impure half of the guard, mirroring giwt's own probe
 * (`utils/worktree-probe.ts`). Never throws: an unrunnable probe comes back as
 * `{ ok: false, reason }` so the caller fails closed instead of reading the
 * absence of evidence as a clean bill of health.
 */
export function probeWorktree(root: string,): WorktreeProbe {
  let probe: { exitCode: number; stdout: Uint8Array; stderr: Uint8Array };
  try {
    probe = Bun.spawnSync(
      ["git", "-C", root, "rev-parse", "--git-dir", "--git-common-dir",],
      { stdout: "pipe", stderr: "pipe", },
    );
  } catch (err) {
    return { ok: false, reason: `git could not be run: ${err instanceof Error ? err.message : String(err,)}`, };
  }
  if (probe.exitCode !== 0) {
    const why = probe.stderr.toString().trim() || "(no stderr)";
    return { ok: false, reason: `git rev-parse exited ${probe.exitCode}: ${why}`, };
  }
  return { ok: true, dirs: probe.stdout.toString().trim().split("\n",).map((line,) => line.trim()), };
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

/** Every plan markdown file in a directory, sorted for stable output. */
function planFiles(dir: string,): string[] {
  if (!existsSync(dir,)) { return []; }
  return readdirSync(dir,).filter((f,) => f.endsWith(".md",)).sort().map((f,) => join(dir, f,));
}

// ── run ──────────────────────────────────────────────────────────────────────

export interface RunOptions {
  dryRun: boolean;
  json: boolean;
  /** Injected by tests; defaults to stdout. */
  log?: (line: string,) => void;
  /** Injected by tests; defaults to stderr. */
  warn?: (line: string,) => void;
  /** Injected by tests; defaults to the real git probe. */
  probe?: WorktreeProbe;
}

export interface RunResult {
  filesChanged: number;
  labelsToTags: number;
  epicColonOutside: number;
  index: IndexOutcome;
  danglingEpics: number;
  relatedRefs: number;
  relatedDangling: number;
  stillUntagged: number;
}

/**
 * The whole CLI minus flag parsing and `process.exit`. `root` is a parameter so
 * the guard and the write ordering can be exercised against a fixture tree —
 * the decision under test is whether `index.json` gets written, not whether a
 * string came back non-empty.
 */
export function runPlanMetadata(root: string, opts: RunOptions,): RunResult {
  const log = opts.log ?? ((line: string,) => {
    console.log(line,);
  });
  const warn = opts.warn ?? ((line: string,) => {
    console.error(line,);
  });
  const { dryRun, json, } = opts;

  const epicsDir = join(root, ".plan", "epics",);
  const ticketsDir = join(root, ".plan", "tickets",);
  const indexPath = join(ticketsDir, "index.json",);
  const probe = opts.probe ?? probeWorktree(root,);
  const epicSlugs = new Set(
    existsSync(epicsDir,)
      ? readdirSync(epicsDir,)
        .filter((f,) => f.startsWith("epic-",) && f.endsWith(".md",))
        .map((f,) => f.replace(/\.md$/, "",))
      : [],
  );

  // Read the index BEFORE the markdown pass. A malformed index — conflict
  // markers left in index.json by a ticket-branch merge are the usual cause —
  // must abort HERE, with zero files rewritten; otherwise the run leaves N .md
  // files changed on disk and then dies on a raw SyntaxError, which at the
  // terminal is indistinguishable from a failed no-op. A missing index still
  // degrades to `null` (markdown pass only), as before.
  const index = loadIndex(indexPath,);

  const rewrites: PlanRewrite[] = [];
  const danglingEpics: { file: string; value: string }[] = [];
  const untagged: string[] = [];
  const danglingRelated: { file: string; ref: string }[] = [];
  let changed = 0;

  // Every plan file that exists, by slug — the resolution target for
  // `**Related:**` refs.
  const known = new Set<string>();
  for (const dir of [epicsDir, ticketsDir,]) {
    for (const f of existsSync(dir,) ? readdirSync(dir,) : []) {
      if (f.endsWith(".md",)) { known.add(f.replace(/\.md$/, "",),); }
    }
  }
  let relatedRefsTotal = 0;
  let relatedFiles = 0;

  for (const abs of [...planFiles(epicsDir,), ...planFiles(ticketsDir,),]) {
    const rel = abs.slice(root.length + 1,);
    const text = readFileSync(abs, "utf8",);
    const plan = planFile(rel, text, epicSlugs,);
    rewrites.push(...plan.rewrites,);
    danglingEpics.push(...plan.dangling,);
    if (!plan.hasTags && rel.startsWith(".plan/tickets/",)) { untagged.push(rel,); }
    const rel4 = relatedRefs(text, known,);
    if (rel4.refs.length + rel4.dangling.length > 0) { relatedFiles++; }
    relatedRefsTotal += rel4.refs.length;
    for (const ref of rel4.dangling) { danglingRelated.push({ file: rel, ref, },); }
    if (plan.rewrites.length > 0 && !dryRun) {
      writeFileSync(abs, applyRewrites(text, plan.rewrites,),);
      changed++;
    }
  }

  const labelsToTags = rewrites.filter((r,) => r.kind === "labels-to-tags").length;
  const epicColonOutside = rewrites.length - labelsToTags;

  // Project the normalized .md fields onto the ticket index. Runs AFTER the
  // markdown pass so it reads the canonical spellings written above, and writes
  // only when `decideIndexWrite` authorizes it — never from a linked worktree,
  // never when the worktree probe could not be evaluated.
  const indexOutcome = projectIndexOntoDisk(root, indexPath, index, probe, dryRun,);
  if (indexOutcome.error) { warn(indexOutcome.error,); }

  if (json) {
    log(JSON.stringify(
      {
        dryRun,
        filesChanged: changed,
        labelsToTags,
        epicColonOutside,
        indexTagsFilled: indexOutcome.tagsFilled,
        indexEpicsFilled: indexOutcome.epicsFilled,
        indexWrite: indexOutcome.decision,
        danglingEpics: danglingEpics.length,
        danglingSample: danglingEpics.slice(0, 20,),
        relatedRefs: relatedRefsTotal,
        relatedDangling: danglingRelated.length,
        relatedDanglingSample: danglingRelated.slice(0, 20,),
        stillUntagged: untagged.length,
      },
      null,
      1,
    ),);
  } else {
    log("=== Plan metadata normalization ===",);
    log(`dry-run: ${dryRun}`,);
    log(`epic slugs known: ${epicSlugs.size}`,);
    log(`  **Labels:** → **Tags:** rewrites: ${labelsToTags}`,);
    log(`  **Epic** → **Epic:**    rewrites: ${epicColonOutside}`,);
    log(`  files changed: ${changed}`,);
    log(
      `  index.json — tags backfilled: ${indexOutcome.tagsFilled}, epic bindings backfilled: ${indexOutcome.epicsFilled} (${indexOutcome.decision})`,
    );
    if (indexOutcome.notice) { log(indexOutcome.notice,); }
    log("\nAdvisory — needs a human decision:",);
    log(`  epic refs naming no epic file: ${danglingEpics.length}`,);
    for (const d of danglingEpics.slice(0, 15,)) { log(`    ${d.file}: ${d.value}`,); }
    if (danglingEpics.length > 15) { log(`    ... and ${danglingEpics.length - 15} more`,); }
    log(`  tickets still carrying no tags: ${untagged.length} (no deterministic source — left untagged)`,);
    log(`  **Related:** refs resolving to a plan file: ${relatedRefsTotal} across ${relatedFiles} files`,);
    log(`  **Related:** refs naming no plan file: ${danglingRelated.length}`,);
    for (const d of danglingRelated.slice(0, 10,)) { log(`    ${d.file}: ${d.ref}`,); }
    log("\nThen regenerate the matrices: bun run plan:sync && bun run plan:matrix && bun run plan:map",);
  }

  return {
    filesChanged: changed,
    labelsToTags,
    epicColonOutside,
    index: indexOutcome,
    danglingEpics: danglingEpics.length,
    relatedRefs: relatedRefsTotal,
    relatedDangling: danglingRelated.length,
    stillUntagged: untagged.length,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const parser = object({
    dryRun: withDefault(flag("--dry-run",), false,),
    json: withDefault(flag("--json",), false,),
  },);
  const { dryRun, json, } = runScript(parser, {
    programName: "plan:metadata",
    brief: "Unify .plan header-field dialects (**Tags:**/**Labels:**, **Epic**:) and report broken epic links.",
    help: "option",
  },);
  runPlanMetadata(resolve(import.meta.dir, "..", "..",), { dryRun, json, },);
}
