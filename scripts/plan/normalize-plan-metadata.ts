// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan metadata normalizer — the CLI that walks `.plan/`, applies the header
 * rewrites its field layer plans, and reports the epic↔ticket↔code links that
 * stay broken.
 *
 * The field grammars and the index.json projection live in sibling modules
 * (`plan-markdown-fields.ts`, `plan-index-projection.ts`); this file is the
 * orchestration and reporting around them.
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

/**
 * True when `root` is a linked git worktree rather than the main checkout
 * (git-dir differs from git-common-dir). Mirrors giwt's own probe
 * (`utils/worktree-probe.ts`): a worktree-local index.json is never the right
 * artifact to write, because the index is regenerated on the target branch
 * post-merge.
 */
export function isLinkedWorktree(root: string,): boolean {
  try {
    const probe = Bun.spawnSync(
      ["git", "-C", root, "rev-parse", "--git-dir", "--git-common-dir",],
      { stdout: "pipe", stderr: "pipe", },
    );
    if (probe.exitCode !== 0) { return false; }
    const dirs = probe.stdout.toString().trim().split("\n",);
    return dirs.length === 2 && dirs[0] !== dirs[1];
  } catch {
    return false;
  }
}

/** Every plan markdown file in a directory, sorted for stable output. */
function planFiles(dir: string,): string[] {
  if (!existsSync(dir,)) { return []; }
  return readdirSync(dir,).filter((f,) => f.endsWith(".md",)).sort().map((f,) => join(dir, f,));
}

// ── CLI ────────────────────────────────────────────────────────
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
  const ROOT = resolve(import.meta.dir, "..", "..",);

  const epicsDir = join(ROOT, ".plan", "epics",);
  const epicSlugs = new Set(
    existsSync(epicsDir,)
      ? readdirSync(epicsDir,)
        .filter((f,) => f.startsWith("epic-",) && f.endsWith(".md",))
        .map((f,) => f.replace(/\.md$/, "",))
      : [],
  );

  const rewrites: PlanRewrite[] = [];
  const danglingEpics: { file: string; value: string }[] = [];
  const untagged: string[] = [];
  let changed = 0;

  // Every plan file that exists, by slug — the resolution target for
  // `**Related:**` refs.
  const known = new Set<string>();
  for (const dir of [epicsDir, join(ROOT, ".plan", "tickets",),]) {
    for (const f of existsSync(dir,) ? readdirSync(dir,) : []) {
      if (f.endsWith(".md",)) { known.add(f.replace(/\.md$/, "",),); }
    }
  }
  let relatedRefsTotal = 0;
  let relatedFiles = 0;
  const danglingRelated: { file: string; ref: string }[] = [];

  for (const abs of [...planFiles(epicsDir,), ...planFiles(join(ROOT, ".plan", "tickets",),),]) {
    const rel = abs.slice(ROOT.length + 1,);
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
  // markdown pass so it reads the canonical spellings written above.
  //
  // In a linked worktree this is REPORT-ONLY. `giwt` deliberately refuses to
  // write index.json there (sync-index-write.ts:20): a worktree-local index
  // gets `git add -A`-ed onto the feature branch and conflicts at merge time,
  // because the index is regenerated post-merge on the target branch. Writing
  // it here would defeat that guard, so the projection is emitted as a count
  // and the caller re-runs it in the main checkout.
  const indexPath = join(ROOT, ".plan", "tickets", "index.json",);
  const linkedWorktree = isLinkedWorktree(ROOT,);
  let tagsFilled = 0;
  let epicsFilled = 0;
  let indexChanged = false;
  if (existsSync(indexPath,)) {
    const index = JSON.parse(readFileSync(indexPath, "utf8",),) as Record<string, IndexEntryLike>;
    const { next, tagsFilled: tf, epicsFilled: ef, } = projectIndex(index, (src,) => {
      const abs = join(ROOT, src,);
      return existsSync(abs,) ? readFileSync(abs, "utf8",) : null;
    },);
    tagsFilled = tf;
    epicsFilled = ef;
    indexChanged = tf > 0 || ef > 0;
    if (indexChanged && !dryRun && !linkedWorktree) {
      // Sorted, not written in insertion order, so a key added out of band
      // lands where giwt expects it instead of wherever it was appended.
      writeFileSync(indexPath, JSON.stringify(canonicalIndexOrder(next,), null, 2,) + "\n",);
    }
  }

  if (json) {
    console.log(JSON.stringify(
      {
        dryRun,
        filesChanged: changed,
        labelsToTags,
        epicColonOutside,
        indexTagsFilled: tagsFilled,
        indexEpicsFilled: epicsFilled,
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
    process.exit(0,);
  }

  console.log("=== Plan metadata normalization ===",);
  console.log(`dry-run: ${dryRun}`,);
  console.log(`epic slugs known: ${epicSlugs.size}`,);
  console.log(`  **Labels:** → **Tags:** rewrites: ${labelsToTags}`,);
  console.log(`  **Epic** → **Epic:**    rewrites: ${epicColonOutside}`,);
  console.log(`  files changed: ${changed}`,);
  console.log(`  index.json — tags backfilled: ${tagsFilled}, epic bindings backfilled: ${epicsFilled}`,);
  if (linkedWorktree && tagsFilled + epicsFilled > 0) {
    console.log(
      "  ^ NOT WRITTEN: linked worktree. giwt regenerates index.json post-merge on the target branch;" +
        " re-run this script in the main checkout to persist.",
    );
  }
  console.log("\nAdvisory — needs a human decision:",);
  console.log(`  epic refs naming no epic file: ${danglingEpics.length}`,);
  for (const d of danglingEpics.slice(0, 15,)) { console.log(`    ${d.file}: ${d.value}`,); }
  if (danglingEpics.length > 15) { console.log(`    ... and ${danglingEpics.length - 15} more`,); }
  console.log(`  tickets still carrying no tags: ${untagged.length} (no deterministic source — left untagged)`,);
  console.log(`  **Related:** refs resolving to a plan file: ${relatedRefsTotal} across ${relatedFiles} files`,);
  console.log(`  **Related:** refs naming no plan file: ${danglingRelated.length}`,);
  for (const d of danglingRelated.slice(0, 10,)) { console.log(`    ${d.file}: ${d.ref}`,); }
  console.log("\nThen regenerate the matrices: bun run plan:sync && bun run plan:matrix && bun run plan:map",);
}
