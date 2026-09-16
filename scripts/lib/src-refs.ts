// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure helpers for plan↔code cross-reference extraction.
 *
 * Parses a TypeScript file's comments (AST) and pulls out `docs/…` / `.plan/…`
 * path references (used by check-md-links to catch stale source-comment
 * citations). Kept free of process.exit / argv / fs so it's unit-testable.
 */

import ts from "typescript";

/**
 * Extract every comment (leading + trailing, block + line) from a TS source
 * string using the TypeScript AST. Deduped by start offset so a comment
 * attached to multiple nodes is reported once.
 */
export function extractComments(source: string,): string[] {
  const sf = ts.createSourceFile(
    "probe.ts",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const text = sf.getFullText();
  const seen = new Set<number>();
  const out: string[] = [];

  const visit = (n: ts.Node,): void => {
    const lead = ts.getLeadingCommentRanges(text, n.pos,);
    if (lead) {
      for (const r of lead) {
        if (!seen.has(r.pos,)) {
          seen.add(r.pos,);
          out.push(text.slice(r.pos, r.end,),);
        }
      }
    }
    const trail = ts.getTrailingCommentRanges(text, n.end,);
    if (trail) {
      for (const r of trail) {
        if (!seen.has(r.pos,)) {
          seen.add(r.pos,);
          out.push(text.slice(r.pos, r.end,),);
        }
      }
    }
    ts.forEachChild(n, visit,);
  };
  visit(sf,);

  return out;
}

/** A doc/plan path reference found inside a source comment. */
export interface DocRef {
  /** The raw path token, e.g. `docs/spec/lore.md`. */
  path: string;
}

/**
 * Path-token regex matching intra-repo doc/plan citations. Captures the path
 * up to (and including) `.md`; trailing `§section`, `#fragment`, punctuation
 * and quotes are left out of the match.
 */
const DOC_REF_RE = /(?:docs|\.plan)\/[A-Za-z0-9/._-]+\.md/g;

/** Extract doc/plan path references (deduped) from a comment body. */
export function extractDocRefs(commentText: string,): DocRef[] {
  const refs: DocRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(DOC_REF_RE.source, "g",);
  while ((m = re.exec(commentText,)) !== null) {
    const path = m[0];
    if (seen.has(path,)) { continue; }
    seen.add(path,);
    refs.push({ path, },);
  }
  return refs;
}
