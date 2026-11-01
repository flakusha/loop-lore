// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the lcov chunk merger (`coverage-merge.mjs`), driven as a
 * subprocess like the other check-script suites (see weave-damage.test.mjs):
 * the script's contract is a file transform + exit code, so each case builds
 * chunk lcov files in a throwaway dir and asserts on the merged artifact.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = new URL("./coverage-merge.mjs", import.meta.url,).pathname;

const dirs = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "covmerge-",),);
  dirs.push(dir,);
  return dir;
}
afterEach(() => {
  for (const dir of dirs) { rmSync(dir, { recursive: true, force: true, },); }
},);

function runMerge(chunks, out, extra = [],) {
  return Bun.spawnSync(["bun", SCRIPT, `--chunks=${chunks.join(",",)}`, `--out=${out}`, ...extra,], {
    stdout: "pipe",
    stderr: "pipe",
  },);
}

const RECORD_A = [
  "SF:src/chat/service.ts",
  "DA:1,2",
  "DA:5,0",
  "DA:9,1",
  "LF:3",
  "LH:2",
  "end_of_record",
  "",
].join("\n",);

describe("coverage-merge", () => {
  test("merges disjoint chunks, recounting LH/LF", () => {
    const dir = scratch();
    const c1 = join(dir, "c1.info",);
    const c2 = join(dir, "c2.info",);
    writeFileSync(c1, RECORD_A,);
    writeFileSync(c2, ["SF:src/db/schema.ts", "DA:1,0", "LF:1", "LH:0", "end_of_record", "",].join("\n",),);
    const out = join(dir, "merged", "lcov.info",);
    const r = runMerge([c1, c2,], out,);
    expect(r.exitCode,).toBe(0,);
    const text = readFileSync(out, "utf8",);
    // Sorted by SF: src/chat before src/db.
    expect(text.indexOf("src/chat/service.ts",),).toBeLessThan(text.indexOf("src/db/schema.ts",),);
    const chat = text.slice(text.indexOf("SF:src/chat/service.ts",), text.indexOf("src/db/schema.ts",),);
    expect(chat,).toContain("DA:1,2",);
    expect(chat,).toContain("DA:5,0",);
    expect(chat,).toContain("DA:9,1",);
    expect(chat,).toContain("LF:3",);
    expect(chat,).toContain("LH:2",);
  });

  test("same SF in two chunks unions DA lines by max hit count", () => {
    const dir = scratch();
    const c1 = join(dir, "c1.info",);
    const c2 = join(dir, "c2.info",);
    // src/chat/service.ts measured twice: line 1 hit 2x then 5x (max 5),
    // line 3 only in chunk 2, line 5 never hit in either.
    writeFileSync(c1, RECORD_A,);
    writeFileSync(
      c2,
      ["SF:src/chat/service.ts", "DA:1,5", "DA:3,0", "DA:5,0", "LF:3", "LH:1", "end_of_record", "",].join("\n",),
    );
    const out = join(dir, "merged", "lcov.info",);
    const r = runMerge([c1, c2,], out,);
    expect(r.exitCode,).toBe(0,);
    const text = readFileSync(out, "utf8",);
    expect(text.match(/SF:src\/chat\/service\.ts/g,) ?? [],).toHaveLength(1,);
    expect(text,).toContain("DA:1,5",);
    expect(text,).toContain("DA:3,0",);
    expect(text,).toContain("LF:4",);
    expect(text,).toContain("LH:2",);
  });

  test("a missing chunk is a loud failure, not a partial merge", () => {
    const dir = scratch();
    const c1 = join(dir, "c1.info",);
    writeFileSync(c1, RECORD_A,);
    const missing = join(dir, "coverage-e2e", "lcov.info",);
    const out = join(dir, "merged", "lcov.info",);
    const r = runMerge([c1, missing,], out,);
    expect(r.exitCode,).toBe(1,);
    expect(r.stderr.toString(),).toContain("chunk lcov missing",);
    expect(r.stderr.toString(),).toContain("coverage-e2e",);
    expect(existsSync(out,),).toBe(false,);
  });

  test("--dry-run reports the totals and writes nothing", () => {
    const dir = scratch();
    const c1 = join(dir, "c1.info",);
    writeFileSync(c1, RECORD_A,);
    const out = join(dir, "merged", "lcov.info",);
    const r = runMerge([c1,], out, ["--dry-run",],);
    expect(r.exitCode,).toBe(0,);
    expect(r.stdout.toString(),).toContain("1 chunks -> 1 files",);
    expect(r.stdout.toString(),).toContain("LH/LF 2/3",);
    expect(existsSync(out,),).toBe(false,);
  });
});
