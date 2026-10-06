// SPDX-License-Identifier: LGPL-3.0-or-later
// size-allow: 440
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan metadata normalizer — unify the header-field dialects that silently
 * split the generated matrices, and report the epic↔ticket↔code links that
 * stay broken.
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

// ── Field-line grammars ────────────────────────────────────────
// Header fields are matched PER LINE. giwt matches against the first 30
// lines joined into one blob, which is how a `**Related**:` line sitting
// directly under an empty `**Epic**:` came to be read as that epic's
// value; line-scoped matching is what the author wrote and what this
// script round-trips.
//
// Three historical spellings exist per field name:
//   `**Tags:**`  canonical — what sync-parse.ts and gen-docs.ts read
//   `**Tags**:`  colon outside the bold — emitted by the `giwt show`
//                template and by hand-written tickets
//   `**Tags**`   bare, no colon — ditto
const FIELD_LINE = /^\s*(?:[-*>]\s*)?\*\*(?<name>Tags|Labels|Epic):?\*\*\s*:?\s*(?<value>.*?)\s*$/i;
/** The canonical `**Epic:**` spelling — colon INSIDE the bold, the only form
 * giwt's ticket parser (sync-parse.ts) and the linkage gate read. */
const EPIC_CANONICAL = /^\s*(?:[-*>]\s*)?\*\*Epic:\*\*/i;

/** One parsed header field line. */
export interface FieldLine {
  index: number;
  name: string;
  value: string;
  raw: string;
}

/** Every `**Tags**`/`**Labels**`/`**Epic**` field line in a file, in order. */
export function fieldLines(text: string,): FieldLine[] {
  const out: FieldLine[] = [];
  for (const [index, line,] of text.split("\n",).entries()) {
    const groups = FIELD_LINE.exec(line,)?.groups;
    if (groups?.["name"] !== undefined) {
      out.push({ index, name: groups["name"], value: (groups["value"] ?? "").trim(), raw: line, },);
    }
  }
  return out;
}

/** Placeholder tag values that mean "no tags", never a literal tag. */
export const TAG_PLACEHOLDER = /^\(?\s*(none|n\/a|-|tbd)?\s*\)?$/i;
/** Epic values that name no epic. */
export const EPIC_PLACEHOLDER = /^\(?\s*(none|n\/a|-|if applicable)?\s*\)?$/i;

/**
 * Normalize one epic reference to its bare slug, or null when it does
 * not name exactly one epic file. Accepts the shapes tickets actually
 * use: `epic-x`, `epic-x.md`, `` `epic-x` ``, `.plan/epics/epic-x.md`,
 * `epic-x.md (MVP Tier 1)`, `epic-x (§7.6)`. Rejects anything listing
 * more than one epic and anything freeform (`Epic 26 (…)`, `proposed:x`).
 */
export function normalizeEpicRef(raw: string,): string | null {
  const v = raw.replace(/[`*]/g, "",).trim();
  if (!v || EPIC_PLACEHOLDER.test(v,)) { return null; }
  // Drop a trailing prose annotation (` (MVP Tier 1)`, ` (§7.6)`) BEFORE
  // stripping `.md` — otherwise `x.md (MVP Tier 1)` keeps the extension.
  const norm = v
    .replace(/^\.plan\/epics\//, "",)
    .replace(/\s*(?:§|\()[^)]*\)?\s*$/, "",)
    .replace(/\.md$/i, "",)
    .trim();
  // A comma or slash means the author listed two or more epics; there is no
  // single epic to bind to, so refuse rather than pick one.
  if (!norm.startsWith("epic-",) || /[,/;]/.test(norm,)) { return null; }
  return norm;
}

/** One line-level edit. `from` is the full source line, `to` its replacement. */
export interface PlanRewrite {
  file: string;
  kind: "labels-to-tags" | "epic-colon-outside";
  from: string;
  to: string;
}

/** Per-file analysis result. */
export interface FilePlan {
  rewrites: PlanRewrite[];
  dangling: { file: string; value: string }[];
  /** True when the file will carry at least one real tag after rewrite. */
  hasTags: boolean;
}

/** Rewrite a `**Labels**:` line to `**Tags**:`, keeping value and spacing. */
function tagsFromLabels(raw: string,): string {
  return raw.replace(/\bLabels(?=:?\*\*)/i, "Tags",);
}

/** Rewrite an `**Epic**:` line to the canonical `**Epic:**` spelling. */
function canonicalEpic(raw: string,): string {
  // Swallow a colon that already follows the bold, so `**Epic**: x` becomes
  // `**Epic:** x` and not `**Epic:**: x`.
  return raw.replace(/\*\*Epic\*\*(\s*):?\s*/, "**Epic:** ",);
}

/**
 * Analyze one plan file. Returns the edits that apply; an empty rewrite
 * list means the file already follows the canonical spelling.
 */
export function planFile(file: string, text: string, epicSlugs: Set<string>,): FilePlan {
  const rewrites: PlanRewrite[] = [];
  const dangling: { file: string; value: string }[] = [];
  let hasTags = false;

  for (const f of fieldLines(text,)) {
    if (f.name === "Labels") {
      if (!TAG_PLACEHOLDER.test(f.value,)) {
        rewrites.push({ file, kind: "labels-to-tags", from: f.raw, to: tagsFromLabels(f.raw,), },);
        hasTags = true;
      }
      continue;
    }
    if (f.name === "Tags") {
      if (!TAG_PLACEHOLDER.test(f.value,)) { hasTags = true; }
      continue;
    }
    // Epic: canonicalize the spelling, then check that it resolves.
    const slug = normalizeEpicRef(f.value,);
    if (!EPIC_CANONICAL.test(f.raw,)) {
      if (slug) {
        rewrites.push({ file, kind: "epic-colon-outside", from: f.raw, to: canonicalEpic(f.raw,), },);
        if (!epicSlugs.has(slug,)) { dangling.push({ file, value: f.value, },); }
      }
      continue;
    }
    if (slug && !epicSlugs.has(slug,)) { dangling.push({ file, value: f.value, },); }
  }
  return { rewrites, dangling, hasTags, };
}

/** Apply rewrites by exact full-line match, so no other line can shift. */
export function applyRewrites(text: string, rewrites: PlanRewrite[],): string {
  const lines = text.split("\n",);
  for (const r of rewrites) {
    const idx = lines.indexOf(r.from,);
    if (idx === -1) { continue; }
    lines[idx] = r.to;
  }
  return lines.join("\n",);
}

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

// ── index.json projection ─────────────────────────────────────
// `giwt sync --fix` writes `tags`/`epic` onto an index entry only when it
// ADOPTS an orphan file (sync-fix-index.ts:202). For an entry already in the
// index it repairs hashes and sources but never re-reads the .md fields — so
// adding `**Tags:**` to a long-filed ticket changes nothing until the ticket
// is deleted and re-added. That is why tickets carried tags in their .md and
// `tags: []` in the index. This pass projects the .md fields onto existing
// entries so the rewrite above actually reaches the generated matrix.
export interface IndexEntryLike {
  tags?: string[];
  epic?: string;
  source?: string;
}

/** Tags as giwt's sync-parse.ts splits them: comma-separated, trimmed. */
export function tagsOf(text: string,): string[] {
  const f = fieldLines(text,).find((l,) => l.name === "Tags");
  if (!f) { return []; }
  return f.value.split(",",).map((t,) => t.trim()).filter(Boolean,);
}

/** Epic as giwt's sync-parse.ts reads it: the canonical field, trimmed. */
export function epicOf(text: string,): string {
  const f = fieldLines(text,).find((l,) => l.name === "Epic");
  return f?.value ?? "";
}

/**
 * Project .md tags/epic onto index entries. Returns the updated index plus
 * per-field counts. Only `tags` and `epic` are touched — status, hash, and
 * provenance stay giwt's business.
 */
export function projectIndex(
  index: Record<string, IndexEntryLike>,
  readFile: (source: string,) => string | null,
): { next: Record<string, IndexEntryLike>; tagsFilled: number; epicsFilled: number } {
  const next = { ...index, };
  let tagsFilled = 0;
  let epicsFilled = 0;
  for (const [extid, entry,] of Object.entries(index,)) {
    if (!entry.source) { continue; }
    const text = readFile(entry.source,);
    if (text === null) { continue; }
    const tags = tagsOf(text,);
    const epic = epicOf(text,);
    const patch: IndexEntryLike = {};
    if (tags.length > 0 && (entry.tags ?? []).length === 0) {
      patch.tags = tags;
      tagsFilled++;
    }
    if (epic && !entry.epic) {
      patch.epic = epic;
      epicsFilled++;
    }
    if (patch.tags || patch.epic) { next[extid] = { ...entry, ...patch, }; }
  }
  return { next, tagsFilled, epicsFilled, };
}

// ── **Related:** scan ──────────────────────────────────────────
// Reported, never rewritten. `**Related:**` is the one field in the plan
// format with NO reader in giwt and NO validator — it is invisible to every
// generated artifact. This counts the well-formed refs it already contains
// and lists the ones that resolve to no file, so the existing cross-links
// become visible without inventing a hard gate over legacy prose.

/**
 * A ref token: an id or slug ending in `.md`, or a bare TYPED id
 * (`FEAT-036`, `BUG-nsfw-gate-not-logged`). An untyped bare slug is prose —
 * `epic-items` in a sentence is indistinguishable from a reference, so it is
 * only counted when written as a path.
 */
const RELATED_REF =
  /(?:^|[\s,(`])((?:[A-Z]{2,6}-)?[a-z0-9][a-z0-9._-]*\.md|(?:BUG|FEAT|TASK|TEST|DOC|EPIC)-[A-Za-z0-9][A-Za-z0-9._-]*)(?=$|[\s,)`])/gi;

/** Every `**Related:**` ref in a file that names a known plan file. */
export function relatedRefs(
  text: string,
  known: Set<string>,
): { refs: string[]; dangling: string[] } {
  const line = text.match(/^\s*\*\*Related:?\*\*\s*(.*)$/im,)?.[1]?.trim();
  const refs: string[] = [];
  const dangling: string[] = [];
  if (!line) { return { refs, dangling, }; }
  for (const hit of line.matchAll(RELATED_REF,)) {
    const ref = hit[1];
    const slug = ref.replace(/^\.plan\/(?:tickets|epics)\//, "",).replace(/\.md$/, "",);
    if (known.has(slug,) || known.has(slug.replace(/^[A-Z]{2,6}-/, "",),)) { refs.push(ref,); }
    else { dangling.push(ref,); }
  }
  return { refs, dangling, };
}

// ── CLI ────────────────────────────────────────────────────────
if (import.meta.main) {
  const argv = process.argv.slice(2,);
  const dryRun = argv.includes("--dry-run",);
  const json = argv.includes("--json",);
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
      const sorted: Record<string, IndexEntryLike> = {};
      for (const k of Object.keys(next,).sort()) { sorted[k] = next[k]; }
      writeFileSync(indexPath, JSON.stringify(sorted, null, 2,) + "\n",);
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
