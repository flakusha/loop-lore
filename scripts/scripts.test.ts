// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for scripts/lib/check-utils.ts — shared pure functions for script guards.
 * Covers: globToRegex, parseReuseToml, checkHeader, findChainViolation,
 *         extractScriptBlocks, isExcluded, hasCheckableExtension.
 */

import { describe, expect, test, } from "bun:test";
import {
  checkHeader,
  extractScriptBlocks,
  extractString,
  extractStringArray,
  findChainViolation,
  globToRegex,
  hasCheckableExtension,
  isExcluded,
  parseLicenses,
  parseReuseToml,
} from "./lib/check-utils";

// ── globToRegex ────────────────────────────────────────────────

describe("globToRegex", () => {
  test("matches literal path", () => {
    const re = globToRegex("src/foo.ts",);
    expect(re.test("src/foo.ts",),).toBe(true,);
    expect(re.test("src/bar.ts",),).toBe(false,);
  });

  test("matches ** across directories", () => {
    const re = globToRegex("src/**/*.ts",);
    // ** requires at least one path segment (standard glob behavior)
    expect(re.test("src/bar/baz.ts",),).toBe(true,);
    expect(re.test("src/a/b/c.ts",),).toBe(true,);
    expect(re.test("docs/foo.md",),).toBe(false,);
  });

  test("matches * within single segment", () => {
    const re = globToRegex("src/*.ts",);
    expect(re.test("src/foo.ts",),).toBe(true,);
    expect(re.test("src/bar/baz.ts",),).toBe(false,);
  });

  test("escapes regex special chars", () => {
    const re = globToRegex("src/utils.ts",);
    expect(re.test("srcXutils.ts",),).toBe(false,);
    expect(re.test("src/utils.ts",),).toBe(true,);
  });
});

// ── extractString / extractStringArray ──────────────────────────

describe("extractString", () => {
  test("extracts double-quoted value", () => {
    expect(extractString('key = "value"', "key",),).toBe("value",);
  });

  test("extracts single-quoted value", () => {
    expect(extractString("key = 'value'", "key",),).toBe("value",);
  });

  test("returns null for missing key", () => {
    expect(extractString('other = "value"', "key",),).toBeNull();
  });
});

describe("extractStringArray", () => {
  test("extracts inline array", () => {
    expect(extractStringArray('paths = ["a", "b", "c"]', "paths",),).toEqual([
      "a",
      "b",
      "c",
    ],);
  });

  test("returns empty array for missing key", () => {
    expect(extractStringArray('other = ["a"]', "paths",),).toEqual([],);
  });

  test("handles single-quoted values", () => {
    expect(extractStringArray("paths = ['x', 'y']", "paths",),).toEqual([
      "x",
      "y",
    ],);
  });
});

// ── parseReuseToml ─────────────────────────────────────────────

describe("parseReuseToml", () => {
  test("parses a single annotation block", () => {
    const toml = `
[[annotations]]
path = ["src/**"]
SPDX-License-Identifier = "LGPL-3.0-or-later"
SPDX-FileCopyrightText = "2026 Loop Lore Contributors"
`;
    const rules = parseReuseToml(toml,);
    expect(rules,).toHaveLength(1,);
    expect(rules[0].paths,).toEqual(["src/**",],);
    expect(rules[0].license,).toBe("LGPL-3.0-or-later",);
    expect(rules[0].copyright,).toBe("2026 Loop Lore Contributors",);
  });

  test("parses multiple annotation blocks", () => {
    const toml = `
[[annotations]]
path = ["src/**"]
SPDX-License-Identifier = "LGPL-3.0-or-later"
SPDX-FileCopyrightText = "2026 Loop Lore Contributors"

[[annotations]]
path = ["docs/**"]
SPDX-License-Identifier = "MIT"
SPDX-FileCopyrightText = "2026 Loop Lore Contributors"
`;
    const rules = parseReuseToml(toml,);
    expect(rules,).toHaveLength(2,);
    expect(rules[0].paths,).toEqual(["src/**",],);
    expect(rules[1].paths,).toEqual(["docs/**",],);
    expect(rules[1].license,).toBe("MIT",);
  });

  test("skips blocks with no paths", () => {
    const toml = `
[[annotations]]
SPDX-License-Identifier = "MIT"
`;
    const rules = parseReuseToml(toml,);
    expect(rules,).toHaveLength(0,);
  });
});

// ── parseLicenses ──────────────────────────────────────────────

describe("parseLicenses", () => {
  test("parses single license", () => {
    expect(parseLicenses("MIT",),).toEqual(["MIT",],);
  });

  test("parses OR expression", () => {
    expect(parseLicenses("Apache-2.0 OR MIT",),).toEqual([
      "Apache-2.0",
      "MIT",
    ],);
  });

  test("handles case-insensitive OR", () => {
    expect(parseLicenses("MIT or Apache-2.0",),).toEqual([
      "MIT",
      "Apache-2.0",
    ],);
  });
});

// ── checkHeader ────────────────────────────────────────────────

describe("checkHeader", () => {
  const rule = {
    paths: ["src/**",],
    license: "LGPL-3.0-or-later",
    copyright: "2026 Loop Lore Contributors",
    matchers: [],
    precedence: "aggregate",
  };

  test("valid header passes", () => {
    const content = `// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { foo } from "./bar";
`;
    const result = checkHeader(content, rule,);
    expect(result.valid,).toBe(true,);
    expect(result.licenseOk,).toBe(true,);
    expect(result.copyrightOk,).toBe(true,);
  });

  test("missing license fails", () => {
    const content = `// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { foo } from "./bar";
`;
    const result = checkHeader(content, rule,);
    expect(result.valid,).toBe(false,);
    expect(result.licenseOk,).toBe(false,);
    expect(result.copyrightOk,).toBe(true,);
  });

  test("missing copyright fails", () => {
    const content = `// SPDX-License-Identifier: LGPL-3.0-or-later

import { foo } from "./bar";
`;
    const result = checkHeader(content, rule,);
    expect(result.valid,).toBe(false,);
    expect(result.licenseOk,).toBe(true,);
    expect(result.copyrightOk,).toBe(false,);
  });

  test("wrong license fails", () => {
    const content = `// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { foo } from "./bar";
`;
    const result = checkHeader(content, rule,);
    expect(result.valid,).toBe(false,);
    expect(result.licenseOk,).toBe(false,);
  });

  test("no header at all fails", () => {
    const content = `import { foo } from "./bar";
`;
    const result = checkHeader(content, rule,);
    expect(result.valid,).toBe(false,);
    expect(result.licenseOk,).toBe(false,);
    expect(result.copyrightOk,).toBe(false,);
  });
});

// ── findChainViolation ─────────────────────────────────────────

describe("findChainViolation", () => {
  test("detects unsafe chain (.method().method())", () => {
    expect(findChainViolation(".foo().bar()",),).toBe(true,);
    expect(findChainViolation("x = .trim().bar()",),).toBe(true,);
  });

  test("allows safe chains", () => {
    expect(findChainViolation(".trim().split(",),).toBe(false,);
    expect(findChainViolation(".toString().length",),).toBe(false,);
    expect(findChainViolation(".selectAll().execute(",),).toBe(false,);
    expect(findChainViolation(".ifExists().execute(",),).toBe(false,);
  });

  test("allows standalone method calls (no dot prefix)", () => {
    expect(findChainViolation("foo().bar()",),).toBe(false,);
  });

  test("allows single method call", () => {
    expect(findChainViolation("foo()",),).toBe(false,);
  });

  test("allows no chaining", () => {
    expect(findChainViolation("const x = 1;",),).toBe(false,);
  });
});

// ── extractScriptBlocks ────────────────────────────────────────

describe("extractScriptBlocks", () => {
  test("extracts a simple script block", () => {
    const html = `<div>hello</div>
<script>
console.log("hi");
</script>`;
    const blocks = extractScriptBlocks(html,);
    expect(blocks,).toHaveLength(1,);
    expect(blocks[0].startLine,).toBe(2,);
    expect(blocks[0].lineCount,).toBe(1,);
    expect(blocks[0].hasMustache,).toBe(false,);
  });

  test("detects mustache templates", () => {
    const html = `<script>
{{var}}
console.log("hi");
</script>`;
    const blocks = extractScriptBlocks(html,);
    expect(blocks,).toHaveLength(1,);
    expect(blocks[0].hasMustache,).toBe(true,);
  });

  test("extracts multiple script blocks", () => {
    const html = `<script>console.log(1);</script>
<div>middle</div>
<script>console.log(2);</script>`;
    const blocks = extractScriptBlocks(html,);
    expect(blocks,).toHaveLength(2,);
  });

  test("returns empty array for no scripts", () => {
    const html = `<div>hello</div><p>world</p>`;
    const blocks = extractScriptBlocks(html,);
    expect(blocks,).toHaveLength(0,);
  });
});

// ── isExcluded / hasCheckableExtension ─────────────────────────

describe("isExcluded", () => {
  test("excludes migration files", () => {
    expect(isExcluded("src/db/migrations/001_init.ts",),).toBe(true,);
  });

  test("excludes test files", () => {
    expect(isExcluded("src/utils/date.test.ts",),).toBe(true,);
  });

  test("excludes .d.ts files", () => {
    expect(isExcluded("src/types/index.d.ts",),).toBe(true,);
  });

  test("excludes node_modules", () => {
    expect(isExcluded("./node_modules/foo/bar.ts",),).toBe(true,);
  });

  test("allows normal source files", () => {
    expect(isExcluded("src/utils/date.ts",),).toBe(false,);
  });
});

describe("hasCheckableExtension", () => {
  test("allows .ts", () => {
    expect(hasCheckableExtension("foo.ts",),).toBe(true,);
  });

  test("allows .html", () => {
    expect(hasCheckableExtension("foo.html",),).toBe(true,);
  });

  test("allows .md", () => {
    expect(hasCheckableExtension("foo.md",),).toBe(true,);
  });

  test("rejects .json", () => {
    expect(hasCheckableExtension("foo.json",),).toBe(false,);
  });

  test("rejects .png", () => {
    expect(hasCheckableExtension("foo.png",),).toBe(false,);
  });
});
