// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Regression tests for `runTests` output handling in finalize.ts.
 *
 * A red `finalize` Step 3 used to print only "Tests failed - fix before
 * finalizing": both streams were piped into a discarded local. The operator
 * could not tell which test failed without re-running the whole suite by hand.
 * These drive a real failing `bun run test:unit` in a throwaway worktree and
 * assert the failure is actually reported and persisted.
 *
 * The fixture is a real worktree-shaped dir with its own package.json mapping
 * `test:unit` to a test file that fails -- so the spawn, the exit code and the
 * stream handling are all production code paths, not stand-ins.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { runTests, } from "./finalize.ts";

let worktree: string,
  stderrChunks: string[],
  restoreStderr: () => void;

/** Build a worktree whose `bun run test:unit` runs a real failing test. */
function makeWorktree(testSource: string,): string {
  const dir = mkdtempSync(join(tmpdir(), "finalize-test-output-",),);
  mkdirSync(join(dir, "tests",), { recursive: true, },);
  writeFileSync(
    join(dir, "package.json",),
    JSON.stringify(
      { name: "fixture-worktree", private: true, scripts: { "test:unit": "bun test tests/unit.test.ts", }, },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(join(dir, "tests", "unit.test.ts",), testSource, "utf8",);
  // A lock file so callers that gate on it are not short-circuited.
  writeFileSync(join(dir, "bun.lock",), "", "utf8",);
  return dir;
}

/** Capture everything runTests writes to stderr. */
function captureStderr(): { chunks: string[]; restore: () => void } {
  const chunks: string[] = [],
    original = process.stderr.write.bind(process.stderr,);
  const spy = ((chunk: string,) => {
    chunks.push(String(chunk,),);
    return true;
  }) as typeof process.stderr.write;
  process.stderr.write = spy;
  return {
    chunks,
    restore: () => {
      process.stderr.write = original;
    },
  };
}

beforeEach(() => {
  const cap = captureStderr();
  stderrChunks = cap.chunks;
  restoreStderr = cap.restore;
},);

afterEach(() => {
  restoreStderr();
  if (worktree !== undefined && worktree !== "") { rmSync(worktree, { recursive: true, force: true, },); }
  worktree = "";
},);

describe("runTests — failing suite", () => {
  test("returns false and names the failing assertion on stderr", () => {
    worktree = makeWorktree(
      'import { expect, test } from "bun:test";\n' +
        'test("the distinctive failure marker", () => { expect(1).toBe(2); });\n',
    );

    const passed = runTests(worktree,),
      captured = stderrChunks.join("",);

    expect(passed, "a failing suite must not report success",).toBe(false,);
    // The whole point: the operator learns WHICH test failed without re-running.
    expect(captured,).toContain("the distinctive failure marker",);
  });

  test("persists the untruncated output and points at the file", () => {
    worktree = makeWorktree(
      'import { expect, test } from "bun:test";\n' +
        'test("persist me", () => { expect("needle-in-full-log").toBe("nope"); });\n',
    );

    runTests(worktree,);

    const logFile = join(worktree, ".tmp", "finalize-test-unit.log",);
    expect(existsSync(logFile,), "test output must be persisted, not piped into a discard",).toBe(true,);
    const persisted = readFileSync(logFile, "utf8",);
    expect(persisted,).toContain("persist me",);
    // The stderr tail must name the file so it is reachable without guessing.
    expect(stderrChunks.join("",),).toContain(logFile,);
  });

  test("a passing suite writes no log and says nothing on stderr", () => {
    worktree = makeWorktree(
      'import { expect, test } from "bun:test";\n' +
        'test("green", () => { expect(1).toBe(1); });\n',
    );

    const passed = runTests(worktree,);

    expect(passed,).toBe(true,);
    // A green step must stay quiet: no log file, no stderr noise.
    expect(stderrChunks.join("",).trim(),).toBe("",);
    expect(existsSync(join(worktree, ".tmp", "finalize-test-unit.log",),),).toBe(false,);
  });

  test("stderr survives when the log cannot be written (read-only worktree)", () => {
    worktree = makeWorktree(
      'import { expect, test } from "bun:test";\n' +
        'test("readonly marker", () => { expect(1).toBe(2); });\n',
    );
    // Block log creation by parking a file where the .tmp directory must go.
    writeFileSync(join(worktree, ".tmp",), "not a directory", "utf8",);

    const passed = runTests(worktree,);

    // The failure must still be reported even when persistence is impossible --
    // a write error must not escalate into a crash that hides the real cause.
    expect(passed,).toBe(false,);
    expect(stderrChunks.join("",),).toContain("readonly marker",);
  });
});
