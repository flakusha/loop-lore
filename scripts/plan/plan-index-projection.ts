// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `.plan/tickets/index.json` projection — pushes the `.md` header fields
 * onto entries giwt already indexes. Separate from the markdown pass because
 * it targets a different artifact (index.json, regenerated post-merge by
 * giwt) under a different write policy.
 */
import { epicOf, tagsOf, } from "./plan-markdown-fields";

// `giwt sync --fix` writes `tags`/`epic` onto an index entry only when it
// ADOPTS an orphan file (sync-fix-index.ts:202). For an entry already in the
// index it repairs hashes and sources but never re-reads the .md fields — so
// adding `**Tags:**` to a long-filed ticket changes nothing until the ticket
// is deleted and re-added. That is why tickets carried tags in their .md and
// `tags: []` in the index. This pass projects the .md fields onto existing
// entries so the rewrite above actually reaches the generated matrix.
//
// Tags are frontmatter-wins, not fill-only: giwt's parser reads each field as
// the FIRST bold-colon match inside the first 30 lines, so an inline field
// mention in header prose can scrape prose fragments into an entry's tags
// (it happened to TASK-PLAN-INDEX-TAGGING-BINDING-RECONCILIATION), and a
// fill-only rule would preserve that corruption forever — nothing else
// re-reads .md fields for entries already in the index. A .md with no Tags
// line still leaves the entry alone; nothing is inferred. Epic stays
// fill-only-empty — ownership has its own resolver (epic-owner-pick.ts).
export interface IndexEntryLike {
  tags?: string[];
  epic?: string;
  source?: string;
}

/**
 * Index entries in the canonical order giwt writes them.
 *
 * `localeCompare`, NOT the default comparator: giwt sorts with
 * `localeCompare` (sync-index.ts:218), the default sort is code-unit order.
 * Where both `BUG-redos-…` and `BUG-REDOS-…` exist, a code-unit sort moves
 * the lowercase key on every write — a diff that looks like the pass touched an
 * entry it never read. Matching giwt makes the write a no-op on key order.
 */
export function canonicalIndexOrder(
  index: Record<string, IndexEntryLike>,
): Record<string, IndexEntryLike> {
  return Object.fromEntries(
    Object.entries(index,).sort(([a,], [b,],) => a.localeCompare(b,)),
  );
}

/**
 * Project .md tags/epic onto index entries. Returns the updated index plus
 * per-field counts. Tags are frontmatter-wins: an entry whose `tags` are
 * empty OR diverge from the .md list is (re)written from the .md; a .md with
 * no Tags line leaves the entry untouched. Epic stays fill-only-empty.
 * Status, hash, and provenance stay giwt's business.
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
    if (
      tags.length > 0 &&
      JSON.stringify(tags,) !== JSON.stringify(entry.tags ?? [],)
    ) {
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
