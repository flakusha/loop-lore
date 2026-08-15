// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for scripts/lib/src-refs.ts — pure plan↔code cross-reference
 * extraction (TS comments → doc refs, markdown → src refs).
 */

import { describe, expect, test, } from "bun:test";
import {
  extractComments,
  extractDocRefs,
  extractSrcRefs,
} from "./src-refs";

describe("extractComments", () => {
  test("captures line + block + trailing comments, deduped", () => {
    const src = `// leading line
const x = 1; // trailing
/** block */
function f() {}
`;
    const comments = extractComments(src,);
    expect(comments,).toContain("// leading line",);
    expect(comments,).toContain("// trailing",);
    expect(comments,).toContain("/** block */",);
  });

  test("does not treat string literals as comments", () => {
    const src = `const a = "// not a comment";`;
    const comments = extractComments(src,);
    expect(comments.filter((c,) => c.includes("not a comment",)),).toEqual([],);
  });
});

describe("extractDocRefs", () => {
  test("finds docs/ and .plan/ .md citations, ignores § sections", () => {
    const refs = extractDocRefs("See docs/spec/lore.md §5 and .plan/design/x.md.",);
    expect(refs.map((r,) => r.path),).toEqual(["docs/spec/lore.md", ".plan/design/x.md",],);
  });

  test("dedupes repeated paths", () => {
    const refs = extractDocRefs("docs/spec/a.md twice docs/spec/a.md",);
    expect(refs,).toHaveLength(1,);
  });
});

describe("extractSrcRefs", () => {
  test("captures backticked + prose src paths", () => {
    const refs = extractSrcRefs(
      "see `src/prompts/registry.ts` and src/rpg/quests/service.ts:12",
    );
    const paths = refs.map((r,) => r.path);
    expect(paths,).toContain("src/prompts/registry.ts",);
    expect(paths,).toContain("src/rpg/quests/service.ts",);
  });

  test("strips fenced code blocks", () => {
    const md = "```ts\nconst x = src/not-real.ts;\n```\nreal src/real.ts";
    const refs = extractSrcRefs(md,);
    expect(refs.map((r,) => r.path),).toEqual(["src/real.ts",],);
  });

  test("skips globs, bare dirs, and trailing punctuation", () => {
    const refs = extractSrcRefs("src/**/*.ts, src/routes/, src/foo.ts).",);
    expect(refs.map((r,) => r.path),).toEqual(["src/foo.ts",],);
  });
});
