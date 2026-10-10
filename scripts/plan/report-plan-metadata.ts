// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `plan:report` — read-only reconciliation reporting over the plan index and
 * `.plan/` frontmatter. This is the repo-side vehicle for the reporting scope
 * of TASK-plan-index-tagging-binding-reconciliation: giwt is a pinned external
 * dependency, so the command ships here instead of as a `giwt plan report`
 * subcommand. Parsing is shared with the normalizer (tagsOf/epicOf/relatedRefs)
 * and the epic-owner resolver (splitEpicCandidates) — one implementation.
 *
 * Subcommands:
 *   (default)     aggregate: totals, top tags, top epics, orphan count
 *   tags <tag>    every index entry whose tags include <tag> (case-insensitive)
 *   epic <id>     every index entry bound to epic <id> (case-insensitive slug)
 *   orphans       three sections:
 *                   (a) orphan tags — a tag on an index entry that NO plan .md
 *                       frontmatter declares (stale adoption or corruption)
 *                   (b) orphan bindings — an `epic` value naming no
 *                       .plan/epics/<slug>.md
 *                   (c) dangling **Related:** refs — prose refs naming no plan
 *                       file
 *
 * Read-only: never writes. Orphans are advisory, not a gate.
 */
import { existsSync, readdirSync, readFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import {
  argument,
  flag,
  multiple,
  object,
  runScript,
  string,
  withDefault,
} from "../../src/cli/parser";
import { splitEpicCandidates, } from "./epic-owner-pick";
import {
  epicOf,
  type IndexEntryLike,
  relatedRefs,
  TAG_PLACEHOLDER,
  tagsOf,
} from "./normalize-plan-metadata";

/** Placeholder tokens (`(none)`, `n/a`, `-`, `tbd`) mean "no tags". */
function isRealTag(t: string,): boolean {
  return t.length > 0 && !TAG_PLACEHOLDER.test(t,);
}

export type PlanIndex = Record<string, IndexEntryLike>;

/** Every tag declared by any plan .md frontmatter, lowercased for matching. */
export function declaredTags(files: Record<string, string>,): Set<string> {
  const out = new Set<string>();
  for (const text of Object.values(files,)) {
    for (const t of tagsOf(text,)) { if (isRealTag(t,)) { out.add(t.toLowerCase(),); } }
  }
  return out;
}

/** (a) Index tags no plan .md frontmatter declares — stale or corrupted rows. */
export function orphanTags(
  index: PlanIndex,
  declared: Set<string>,
): { extid: string; tag: string }[] {
  const rows: { extid: string; tag: string }[] = [];
  for (const [extid, entry,] of Object.entries(index,)) {
    for (const tag of entry.tags ?? []) {
      if (isRealTag(tag,) && !declared.has(tag.toLowerCase(),)) {
        rows.push({ extid, tag, },);
      }
    }
  }
  return rows;
}

/** (b) Index `epic` bindings (any candidate) naming no .plan/epics/<slug>.md. */
export function orphanBindings(
  index: PlanIndex,
  epicExists: (slug: string,) => boolean,
): { extid: string; epic: string }[] {
  const rows: { extid: string; epic: string }[] = [];
  for (const [extid, entry,] of Object.entries(index,)) {
    const raw = epicOf(entryText(entry,),);
    if (!raw) { continue; }
    const bad = splitEpicCandidates(raw,).filter((c,) => !epicExists(c,));
    if (bad.length > 0) { rows.push({ extid, epic: bad.join(", ",), },); }
  }
  return rows;
}

/** epicOf reads .md text, so re-spell an index entry's epic as a field line. */
function entryText(entry: IndexEntryLike,): string {
  return entry.epic ? `**Epic:** ${entry.epic}\n` : "";
}

/** (c) **Related:** refs in plan .md files that name no known plan file. */
export function danglingRelated(
  files: Record<string, string>,
  known: Set<string>,
): { file: string; ref: string }[] {
  const rows: { file: string; ref: string }[] = [];
  for (const [file, text,] of Object.entries(files,)) {
    for (const ref of relatedRefs(text, known,).dangling) { rows.push({ file, ref, },); }
  }
  return rows;
}

/** Case-insensitive `tags <tag>` query over index entries. */
export function byTag(
  index: PlanIndex,
  tag: string,
): { extid: string; status: string; source: string }[] {
  const needle = tag.toLowerCase();
  const rows: { extid: string; status: string; source: string }[] = [];
  for (const [extid, entry,] of Object.entries(index,)) {
    if ((entry.tags ?? []).some((t,) => t.toLowerCase() === needle)) {
      rows.push({ extid, status: entryStatus(entry,), source: entry.source ?? "", },);
    }
  }
  return rows;
}

/** Case-insensitive `epic <id>` query over index bindings. */
export function byEpic(
  index: PlanIndex,
  epicId: string,
): { extid: string; status: string; source: string }[] {
  const needle = epicId.toLowerCase().replace(/\.md$/i, "",);
  const rows: { extid: string; status: string; source: string }[] = [];
  for (const [extid, entry,] of Object.entries(index,)) {
    const candidates = splitEpicCandidates(entry.epic ?? "",)
      .map((c,) => c.toLowerCase());
    if (candidates.includes(needle,)) {
      rows.push({ extid, status: entryStatus(entry,), source: entry.source ?? "", },);
    }
  }
  return rows;
}

function entryStatus(entry: IndexEntryLike,): string {
  return (entry as { status?: string }).status ?? "";
}

export interface Aggregate {
  tickets: number;
  distinctTags: number;
  bindings: number;
  topTags: [string, number,][];
  topEpics: [string, number,][];
}

/** Totals + top-10 tags/epics by frequency, matching the ticket's aggregate AC. */
export function aggregate(index: PlanIndex,): Aggregate {
  const tagCounts = new Map<string, number>();
  const epicCounts = new Map<string, number>();
  let bindings = 0;
  for (const entry of Object.values(index,)) {
    for (const t of entry.tags ?? []) {
      if (!isRealTag(t,)) { continue; }
      tagCounts.set(t, (tagCounts.get(t,) ?? 0) + 1,);
    }
    const epic = (entry as { epic?: string }).epic ?? "";
    if (epic) {
      bindings++;
      epicCounts.set(epic, (epicCounts.get(epic,) ?? 0) + 1,);
    }
  }
  const top = (m: Map<string, number>,): [string, number,][] =>
    [...m.entries(),].sort((a, b,) => b[1] - a[1]).slice(0, 10,);
  return {
    tickets: Object.keys(index,).length,
    distinctTags: tagCounts.size,
    bindings,
    topTags: top(tagCounts,),
    topEpics: top(epicCounts,),
  };
}

// ── CLI ────────────────────────────────────────────────────────
if (import.meta.main) {
  const parser = object({
    args: multiple(argument(string(),),),
    json: withDefault(flag("--json",), false,),
  },);
  const { args, json, } = runScript(parser, {
    programName: "plan:report",
    brief: "Read-only plan-index reporting: tags/epics queries, orphans, aggregate.",
    help: "option",
  },);
  const ROOT = resolve(import.meta.dir, "..", "..",);
  const command = args[0] ?? "aggregate";
  const value = args[1];

  const index: PlanIndex = existsSync(join(ROOT, ".plan", "tickets", "index.json",),)
    ? JSON.parse(readFileSync(join(ROOT, ".plan", "tickets", "index.json",), "utf8",),)
    : {};
  const files: Record<string, string> = {};
  const known = new Set<string>();
  for (const dir of [".plan/epics", ".plan/tickets",]) {
    const abs = join(ROOT, dir,);
    for (const f of existsSync(abs,) ? readdirSync(abs,) : []) {
      if (!f.endsWith(".md",)) { continue; }
      files[join(dir, f,)] = readFileSync(join(abs, f,), "utf8",);
      known.add(f.replace(/\.md$/, "",),);
    }
  }
  const declared = declaredTags(files,);
  const epicExists = (slug: string,): boolean => existsSync(join(ROOT, ".plan", "epics", `${slug}.md`,),);
  const printRows = (r: { extid: string; status: string; source: string }[],): void => {
    for (const x of r) { console.log(`${x.extid}  ${x.status}  ${x.source}`,); }
    console.log(`(${r.length} ticket(s),)`,);
  };

  if (json) {
    console.log(JSON.stringify(
      {
        command,
        value: value ?? null,
        result: command === "tags"
          ? byTag(index, value ?? "",)
          : command === "epic"
          ? byEpic(index, value ?? "",)
          : command === "orphans"
          ? {
            orphanTags: orphanTags(index, declared,),
            orphanBindings: orphanBindings(index, epicExists,),
            danglingRelated: danglingRelated(files, known,),
          }
          : aggregate(index,),
      },
      null,
      1,
    ),);
    process.exit(0,);
  }

  if (command === "tags" || command === "epic") {
    if (!value) {
      console.error(`usage: plan:report ${command} <${command === "tags" ? "tag" : "epic-id"}>`,);
      process.exit(1,);
    }
    printRows(command === "tags" ? byTag(index, value,) : byEpic(index, value,),);
  } else if (command === "orphans") {
    const ot = orphanTags(index, declared,);
    const ob = orphanBindings(index, epicExists,);
    const dr = danglingRelated(files, known,);
    console.log(`(a) orphan tags (declared by no plan .md): ${ot.length}`,);
    for (const x of ot) { console.log(`    ${x.extid}: ${x.tag}`,); }
    console.log(`(b) orphan epic bindings (naming no epic file): ${ob.length}`,);
    for (const x of ob) { console.log(`    ${x.extid}: ${x.epic}`,); }
    console.log(`(c) dangling **Related:** refs: ${dr.length}`,);
    for (const x of dr) { console.log(`    ${x.file}: ${x.ref}`,); }
  } else if (command === "aggregate") {
    const a = aggregate(index,);
    console.log(`tickets: ${a.tickets}  distinct tags: ${a.distinctTags}  bindings: ${a.bindings}`,);
    console.log("top tags:",);
    for (const [t, n,] of a.topTags) { console.log(`  ${n}  ${t}`,); }
    console.log("top epics:",);
    for (const [e, n,] of a.topEpics) { console.log(`  ${n}  ${e}`,); }
    const orphans = orphanTags(index, declared,).length +
      orphanBindings(index, epicExists,).length;
    console.log(`orphan rows (see \`plan:report orphans\`): ${orphans}`,);
  } else {
    console.error(`unknown command: ${command} (aggregate | tags | epic | orphans)`,);
    process.exit(1,);
  }
}
