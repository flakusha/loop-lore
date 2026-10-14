// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { exceedsSizeAllow, sizeAllowFor, tallyLines, } from "./check-file-size";

/**
 * Resource contract: these tests own NOTHING.
 *
 * Every function under test is pure — it takes a string or a number and
 * returns a number. No test allocates a tmp file, binds a port, opens a
 * database or writes a shared global, so there is nothing to tear down and
 * nothing for a parallel runner to interleave. Every test builds its own
 * in-memory fixture, so results do not depend on execution order or on any
 * other suite. Any future test added here that DOES take a resource must own
 * it uniquely and release it in afterEach.
 *
 * Importing check-file-size.ts is side-effect free: the gate body sits behind
 * `import.meta.main`, so this file cannot trigger a repo-wide scan or exit the
 * runner process.
 */

/** Build a newline-terminated file body of exactly `n` code lines. */
function codeOf(n: number,): string {
  return `${Array.from({ length: n, }, (_, i,) => `const v${i + 1} = ${i + 1};`,).join("\n",)}\n`;
}

/** Build `n` body lines of a JSDoc block; wrap it in `/**` … ` *\/` yourself. */
function jsdocOf(n: number,): string {
  return Array.from({ length: n, }, (_, i,) => ` * @param a${i} documented`,).join("\n",);
}

describe("tallyLines", () => {
  test("a trailing newline terminates the last line, it does not start a new one", () => {
    expect(tallyLines(codeOf(300,),),).toEqual({ code: 300, comment: 0, },);
  });

  test("counts the final partial line of a file with no trailing newline", () => {
    expect(tallyLines("const a = 1;\nconst b = 2;",),).toEqual({ code: 2, comment: 0, },);
  });

  test("empty file has neither code nor comment lines", () => {
    expect(tallyLines("",),).toEqual({ code: 0, comment: 0, },);
  });

  test("blank lines are neither — padding paragraphs never tip the budget", () => {
    expect(tallyLines("const a = 1;\n\n   \nconst b = 2;\n",),).toEqual({ code: 2, comment: 0, },);
  });

  test("500 lines of JSDoc above 30 lines of code counts as 30 code lines", () => {
    // The whole reason comments are excluded: a doc sweep adding @param/@returns
    // must not push a comfortably-sized module over the ceiling.
    // jsdocOf's last body line shares the closing `*/`, so 1 + 499 = 500.
    const file = `/**\n${jsdocOf(499,)} */\n${codeOf(30,)}`;
    expect(tallyLines(file,),).toEqual({ code: 30, comment: 500, },);
    expect(exceedsSizeAllow(tallyLines(file,).code, 250,),).toBe(false,);
  });

  test("300 lines of real code with no comments is still over the 250L budget", () => {
    expect(exceedsSizeAllow(tallyLines(codeOf(300,),).code, 250,),).toBe(true,);
  });

  test("a `//` inside a string literal is code, not a comment", () => {
    expect(tallyLines('const url = "https://example.com/a//b";\n',),).toEqual({ code: 1, comment: 0, },);
  });

  test("a `/*` inside a string literal is code, not a comment", () => {
    expect(tallyLines('const s = "/* not a comment */";\n',),).toEqual({ code: 1, comment: 0, },);
  });

  test("comment-looking text inside a regex literal is code", () => {
    expect(tallyLines("const re = /a\\/\\//b/;\n",),).toEqual({ code: 1, comment: 0, },);
  });

  test("a trailing comment never demotes the code line it sits on", () => {
    expect(tallyLines("const x = 1; // note\n",),).toEqual({ code: 1, comment: 0, },);
  });

  test("block comments opening and closing mid-line count as code, once", () => {
    expect(tallyLines("/* one */ const a = 1; /* two */ const b = 2;\n",),).toEqual({ code: 1, comment: 0, },);
  });

  test("a line holding only a closing brace is code", () => {
    // Token-KIND classification alone would miss it; the character tally counts
    // every non-whitespace character that is not inside a comment.
    expect(tallyLines("if (a) {\n  b();\n}\n",),).toEqual({ code: 3, comment: 0, },);
  });

  test("a multi-line template literal's interior is not documentation", () => {
    expect(tallyLines("const t = `one\ntwo`;\n",),).toEqual({ code: 2, comment: 0, },);
  });

  test("comment-only lines tally as comment, never as code", () => {
    expect(tallyLines("// a\n// b\n",),).toEqual({ code: 0, comment: 2, },);
  });

  test("a `//` comment does not swallow the code line below it", () => {
    expect(tallyLines("// leading\nconst x = 1;\n",),).toEqual({ code: 1, comment: 1, },);
  });
});

describe("exceedsSizeAllow", () => {
  test("a file at exactly its size-allow passes", () => {
    expect(exceedsSizeAllow(tallyLines(codeOf(300,),).code, 300,),).toBe(false,);
  });

  test("a file one line over its size-allow fails", () => {
    expect(exceedsSizeAllow(tallyLines(codeOf(301,),).code, 300,),).toBe(true,);
  });

  test("a file under its size-allow passes", () => {
    expect(exceedsSizeAllow(tallyLines(codeOf(299,),).code, 300,),).toBe(false,);
  });

  test("the default 250L budget holds a 250-line file", () => {
    expect(exceedsSizeAllow(tallyLines(codeOf(250,),).code, 250,),).toBe(false,);
    expect(exceedsSizeAllow(tallyLines(codeOf(251,),).code, 250,),).toBe(true,);
  });

  test("a size-allow budget is applied to CODE lines, not raw lines", () => {
    // 40 code lines under a declared budget of 300, padded to 300 raw lines
    // with documentation: compliant. Under the old raw count those 300 raw
    // lines sat exactly at 300 and the directive bought nothing.
    const padded = `// size-allow: 300\n/**\n${jsdocOf(298,)} */\n${codeOf(40,)}`;
    expect(sizeAllowFor(padded, 250,),).toBe(300,);
    expect(tallyLines(padded,).code,).toBe(40,);
    expect(exceedsSizeAllow(tallyLines(padded,).code, sizeAllowFor(padded, 250,),),).toBe(false,);
    // And the directive still bites on real code: 301 code lines over a 300
    // size-allow fails, so the override was not silently widened to raw lines.
    const over = `// size-allow: 300\n${codeOf(301,)}`;
    expect(exceedsSizeAllow(tallyLines(over,).code, sizeAllowFor(over, 300,),),).toBe(true,);
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

  test("a directive may also LOWER the budget below the default", () => {
    // The directive REPLACES the budget rather than raising it, so a file can
    // opt into a tighter limit than the 250L default. Raise-only is the reading
    // this pins against.
    expect(sizeAllowFor("// size-allow: 100\nconst x = 1;\n", 250,),).toBe(100,);
  });

  test("size-allow: 0 zeroes the budget — the declared N is not clamped", () => {
    // AGENTS.md states the declared value is uncapped in both directions. 0 is
    // the degenerate end: the file is held to no lines at all.
    expect(sizeAllowFor("// size-allow: 0\n", 250,),).toBe(0,);
  });

  test("the window is 512 CHARACTERS, not the first 5 lines", () => {
    // The window is 512 CHARACTERS, not lines: a directive on a short line 8
    // sits well inside the first 512 chars and IS honoured. Pin the real window
    // so it cannot be silently narrowed to a line count.
    const pastLine5 = `${Array.from({ length: 7, }, () => "// x",).join("\n",)}\n// size-allow: 777\n`;
    expect(pastLine5.slice(0, pastLine5.indexOf("// size-allow",),).length,).toBeLessThan(512,);
    expect(sizeAllowFor(pastLine5, 250,),).toBe(777,);
  });
});

// ── CLI ────────────────────────────────────────────────────────

const CLI_SCRIPT = `${import.meta.dir}/check-file-size.ts`;
const ROOT = `${import.meta.dir}/..`;

/**
 * Spawn the gate: `runScript` exits the process on a parse error or on
 * `--help`, so nothing here is observable in-process. The gate only READS the
 * tree — it owns no fixture, so parallel runs cannot collide.
 */
function run(...args: string[]) {
  const proc = Bun.spawnSync(["bun", CLI_SCRIPT, ...args,], { cwd: ROOT, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("check-file-size CLI", () => {
  test("--help prints the brief and exits 0", () => {
    const result = run("--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("over the per-file CODE-line budget",);
  });

  test("a violation reports both the code and the comment tally", () => {
    const result = run("--limit=1", "--strict",);
    expect(result.stderr,).toMatch(/\[size\] \S+: \d+ lines \(\d+ code, \d+ comment\) — limit 1/,);
  });

  test("exempts *.test.*, /migrations/ and DO-NOT-EDIT-MANUALLY files", async () => {
    // --limit=1 puts every non-exempt file over, so any violation naming an
    // exempt path proves that filter let it through. Read-only over the live
    // tree — the gate owns no fixture, so parallel runs cannot collide.
    const { stderr, } = run("--limit=1", "--strict",);
    expect(stderr,).not.toContain(".test.",);
    expect(stderr,).not.toContain("/migrations/",);
    // src/db/schema-core.ts is well over one code line and is generated, so it
    // gives the banner exemption a real subject rather than a vacuous pass.
    expect(await Bun.file(`${ROOT}/src/db/schema-core.ts`,).text(),).toContain("DO NOT EDIT MANUALLY",);
    expect(stderr,).not.toContain("src/db/schema-core.ts",);
  });

  test("--limit above every file: non-strict run exits 0", () => {
    const result = run("--limit=100000",);
    expect(result.exitCode,).toBe(0,);
  });

  test("--limit 1 --strict fails the gate with exit 1", () => {
    const result = run("--limit=1", "--strict",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("CI gate failed",);
  });

  test("non-numeric --limit is rejected with exit 1", () => {
    const result = run("--limit=abc",);
    expect(result.exitCode,).toBe(1,);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run("--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });
});
