// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { countContentLines, exceedsSizeAllow, sizeAllowFor, } from "./check-file-size";

/**
 * Resource contract: these tests own NOTHING.
 *
 * Both functions under test are pure — they take a string and return a
 * number. No test allocates a tmp file, binds a port, opens a database or
 * writes a shared global, so there is nothing to tear down and nothing for a
 * parallel runner to interleave. Every test builds its own in-memory fixture
 * via `fileOf`, so results do not depend on execution order or on any other
 * suite. Any future test added here that DOES take a resource must own it
 * uniquely and release it in afterEach.
 *
 * Importing check-file-size.ts is side-effect free: the gate body sits behind
 * `import.meta.main`, so this file cannot trigger a repo-wide scan or exit the
 * runner process.
 */

/** Build a newline-terminated file body of exactly `n` content lines. */
function fileOf(n: number,): string {
  return `${Array.from({ length: n, }, (_, i,) => `line ${i + 1}`,).join("\n",)}\n`;
}

describe("countContentLines", () => {
  test("a trailing newline terminates the last line, it does not start a new one", () => {
    expect(countContentLines(fileOf(300,),),).toBe(300,);
  });

  test("counts the final partial line of a file with no trailing newline", () => {
    expect(countContentLines("a\nb",),).toBe(2,);
  });

  test("single line without a trailing newline", () => {
    expect(countContentLines("a",),).toBe(1,);
  });

  test("empty file has no content lines", () => {
    expect(countContentLines("",),).toBe(0,);
  });

  test("regression: the old count reported a 300-line file as 301", () => {
    // The gate used split("\n").length, which counts the empty tail left by
    // the final newline. That is the defect this function exists to remove.
    expect(fileOf(300,).split("\n",).length,).toBe(301,);
    expect(countContentLines(fileOf(300,),),).toBe(300,);
  });
});

describe("exceedsSizeAllow", () => {
  test("a file at exactly its size-allow passes", () => {
    expect(exceedsSizeAllow(fileOf(300,), 300,),).toBe(false,);
  });

  test("a file one line over its size-allow fails", () => {
    expect(exceedsSizeAllow(fileOf(301,), 300,),).toBe(true,);
  });

  test("a file under its size-allow passes", () => {
    expect(exceedsSizeAllow(fileOf(299,), 300,),).toBe(false,);
  });

  test("the default 250L budget holds a 250-line file", () => {
    expect(exceedsSizeAllow(fileOf(250,), 250,),).toBe(false,);
    expect(exceedsSizeAllow(fileOf(251,), 250,),).toBe(true,);
  });
});

describe("sizeAllowFor", () => {
  test("uses the file's own size-allow directive", () => {
    expect(sizeAllowFor("// size-allow: 300\nconst x = 1;\n", 250,),).toBe(300,);
  });

  test("accepts any N — the declared budget is not capped", () => {
    // AGENTS.md documents size-allow as uncapped; a large cohesive file must
    // not silently fall back to the 250L default.
    expect(sizeAllowFor("// size-allow: 600\nconst x = 1;\n", 250,),).toBe(600,);
  });

  test("falls back to the default when no directive is present", () => {
    expect(sizeAllowFor("const x = 1;\n", 250,),).toBe(250,);
  });

  test("ignores a directive past the 512-byte header window", () => {
    const body = `${Array.from({ length: 80, }, () => "// filler",).join("\n",)}// size-allow: 900\n`;
    expect(sizeAllowFor(body, 250,),).toBe(250,);
  });
});
