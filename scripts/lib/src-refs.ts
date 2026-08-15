// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure helpers for plan↔code cross-reference extraction.
 *
 * Two directions:
 *   1. `extractComments` + `extractDocRefs` — parse a TypeScript file's
 *      comments (AST) and pull out `docs/…` / `.plan/…` path references
 *      (used by check-md-links to catch stale source-comment citations).
 *   2. `extractSrcRefs` — pull `src/…` path tokens out of plan / spec
 *      markdown (used by plan-code-map to build the reverse index).
 *
 * Kept free of process.exit / argv / fs so both are unit-testable.
 */

import ts from "typescript";

// ── Direction 1: TS comments → doc refs ────────────────────────

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

// ── Direction 2: markdown → src refs ────────────────────────────

/**
 * Strip fenced code blocks (```…```) from markdown. Inline code spans are
 * KEPT — in plan/spec prose, backticked `src/…` tokens are the primary
 * reference format (not example code to ignore).
 */
export function stripMarkdownCode(text: string,): string {
  return text.replace(/```[\s\S]*?```/g, "",);
}

/** A `src/…` path token found in plan/spec prose. */
export interface SrcRef {
  /** Normalized path token, e.g. `src/rpg/quests/service`. */
  path: string;
}

const SRC_REF_RE = /src\/[A-Za-z0-9/._-]+/g;

/**
 * Extract `src/…` path tokens from markdown prose (code stripped). Normalizes
 * each token by trimming trailing punctuation and `:line` suffixes, and skips
 * glob/pattern tokens (containing `*`).
 */
export function extractSrcRefs(markdown: string,): SrcRef[] {
  const body = stripMarkdownCode(markdown,);
  const refs: SrcRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = SRC_REF_RE.exec(body,)) !== null) {
    let path = m[0];
    // Trim trailing punctuation / inline-code remnants / line refs.
    path = path.replace(/[:;,).\]'"*]+$/, "",);
    // Skip glob patterns and bare directory tokens.
    if (path.includes("*",)) { continue; }
    if (path === "src" || path === "src/" || path.endsWith("/",)) { continue; }
    if (seen.has(path,)) { continue; }
    seen.add(path,);
    refs.push({ path, },);
  }
  return refs;
}
