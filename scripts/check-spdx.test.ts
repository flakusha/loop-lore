// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the argv contract of check-spdx.ts after the Optique migration: the
// two flags still parse, and TRAILING POSITIONAL PATHS still reach the file
// collector alongside them — the shape `bun run scripts/check-spdx.ts a.ts
// b.ts` and `--fix a.ts` both use.
//
// RESOURCE CONTRACT — what each `runSpdx` call owns:
// - DISK: exactly one `mkdtempSync(join(tmpdir(), "check-spdx-test-"))` root.
//   mkdtemp creates the random suffix atomically, so concurrent calls — in
//   this process or another `bun test` process — cannot collide on a path.
//   Nothing outside that root is written.
// - TEARDOWN: `rmSync` is in `finally`, so it runs even when an assertion
//   throws. A failing test cannot leave a fixture behind to poison the rest.
// - THE `--fix` SAFETY POINT: `--fix` rewrites files IN PLACE, so every file
//   it can touch is inside this call's own temp root. No test here names a
//   real tracked file, which is why two parallel `--fix` runs cannot race
//   each other or the repo.
// - REUSE.toml is resolved from the SCRIPT's own location (`../REUSE.toml`
//   relative to import.meta.url), NOT from cwd — so the real rules apply and
//   are read-only. That is what makes a fixture named `src/bad.ts` a
//   meaningful "no valid header" case.
// - STDOUT/STDERR: violations are reported through console.error/console.warn,
//   BOTH of which are stderr, so the file list is asserted on stderr.
// - PROCESS: one spawn per call; no handles, ports, or globals shared.
// - Ordering: no module-level mutable state; tests pass alone and in any order.

import { expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, } from "node:path";

const SCRIPT = join(import.meta.dir, "check-spdx.ts",);

const HEADER = "// SPDX-License-Identifier: LGPL-3.0-or-later\n" +
  "// SPDX-FileCopyrightText: 2026 Loop Lore Contributors\n\n";

/**
 * Run the guard over throwaway files.
 *
 * @param files - repo-relative path -> content written into the temp root.
 * @param args - argv to pass after the script path.
 * @returns exit code, both streams, and the resulting contents by path.
 */
function runSpdx(files: Record<string, string>, args: string[],) {
  const root = mkdtempSync(join(tmpdir(), "check-spdx-test-",),);
  try {
    for (const [name, content,] of Object.entries(files,)) {
      const file = join(root, name,);
      mkdirSync(dirname(file,), { recursive: true, },);
      writeFileSync(file, content,);
    }
    const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPDX_CHECK: "1", },
    },);
    const after: Record<string, string> = {};
    for (const name of Object.keys(files,)) {
      after[name] = readFileSync(join(root, name,), "utf8",);
    }
    return {
      code: proc.exitCode,
      out: new TextDecoder().decode(proc.stdout,),
      err: new TextDecoder().decode(proc.stderr,),
      after,
    };
  } finally {
    rmSync(root, { recursive: true, force: true, },);
  }
}

test("trailing positional paths are the files that get checked", () => {
  const { code, err, } = runSpdx({
    "src/good.ts": `${HEADER}export const ok = 1;\n`,
    "src/bad.ts": "// nothing here\n",
  }, ["src/good.ts", "src/bad.ts",],);
  expect(code,).toBe(1,);
  expect(err,).toContain("src/bad.ts",);
  expect(err,).not.toContain("src/good.ts",);
});

test("--staged parses alongside positional paths", () => {
  // With explicit paths present the positional list wins over the index
  // scan; the point is that the flag is DECLARED, not that it wins.
  const { code, } = runSpdx({ "src/bad.ts": "// nothing here\n", }, [
    "--staged",
    "src/bad.ts",
  ],);
  expect(code,).toBe(1,);
});

test("--fix parses alongside positional paths and rewrites the named file", () => {
  const { code, after, } = runSpdx({ "src/bare.ts": "export const x = 1;\n", }, [
    "--fix",
    "src/bare.ts",
  ],);
  // --fix always exits 0; the rewrite is the assertion.
  expect(code,).toBe(0,);
  expect(after["src/bare.ts"],).toContain("SPDX-License-Identifier",);
});

test("--help prints the brief and exits 0", () => {
  const proc = Bun.spawnSync(["bun", SCRIPT, "--help",], { stdout: "pipe", stderr: "pipe", },);
  expect(proc.exitCode,).toBe(0,);
  expect(new TextDecoder().decode(proc.stdout,),).toContain("Validate (or --fix) the SPDX headers",);
});

test("an undeclared flag is a parse error, not a silent file path", () => {
  // The old `filter(a => a !== "--staged" && a !== "--fix")` would have
  // treated "--nope" as a filename and reported it as a header violation.
  const proc = Bun.spawnSync(["bun", SCRIPT, "--nope",], { stdout: "pipe", stderr: "pipe", },);
  expect(proc.exitCode,).toBe(1,);
  expect(new TextDecoder().decode(proc.stderr,),).toContain("--nope",);
});
