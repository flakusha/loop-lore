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
  type IndexOutcome,
  loadIndex,
  probeWorktree,
  projectIndexOntoDisk,
  type WorktreeProbe,
} from "./plan-index-guard";
import {
  applyRewrites,
  planFile,
  type PlanRewrite,
  relatedRefs,
} from "./plan-markdown-fields";

// ── linked-worktree guard ──────────────────────────────────────────────────
//
// The guard that decides whether `.plan/tickets/index.json` may be written —
// fail-closed, and split so the decision is testable without git — lives in
// `plan-index-guard.ts`. This file is the orchestration and the reporting.

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
