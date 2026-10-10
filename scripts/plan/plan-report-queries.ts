// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-only reconciliation queries over the plan index and `.plan/`
 * frontmatter — the analysis behind `plan:report`. Split from the CLI so the
 * queries stay pure (in-memory index/files in, rows out) and testable without
 * a filesystem; `report-plan-metadata.ts` only loads, dispatches, and renders.
 */
import { splitEpicCandidates, } from "./epic-owner-pick";
import { type IndexEntryLike, } from "./plan-index-projection";
import {
  epicOf,
  relatedRefs,
  TAG_PLACEHOLDER,
  tagsOf,
} from "./plan-markdown-fields";

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
