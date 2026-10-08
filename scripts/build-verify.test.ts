// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the argv contract of `build:verify` after the Optique migration: the
// no-arg local-only run still exits 0, `--url` still drives the remote
// comparison (exit 2 on an unreachable origin), `--admin` still parses
// alongside it, and an undeclared flag is now a parse error instead of being
// silently ignored by the old hand-rolled loop.
//
// RESOURCE CONTRACT — each test owns nothing and shares nothing mutable:
// - DISK: none. No fixture is written; this suite allocates no temp directory,
//   so there is nothing to tear down and nothing that can leak into a sibling.
// - PROCESS: one `Bun.spawnSync` per test, each its own OS process. They never
//   share a handle and none writes to the repo.
// - READ-ONLY on the working tree: `computeBuildIdentity` hashes the source
//   tree and memoizes IN-PROCESS only (`force: true` bypasses the cache). It
//   writes nothing, and it resolves projectRoot from `import.meta.dir` rather
//   than cwd. A concurrent `git checkout` is the only thing that could change
//   its output, and no assertion here pins the hash VALUE — only that the line
//   is printed — so the suite cannot flake on an unrelated edit.
// - NETWORK: the two `--url` tests dial 127.0.0.1:1, reserved and never
//   listening. Nothing here binds a port, so no two tests can collide on one.
// - ENV: `env` is merged into a COPY (`{...process.env, ...env}`); the parent
//   environment is never mutated, so ordering cannot matter.
// - No module-level mutable state: `SCRIPT` is a constant path.
//
// Verified: 5 pass alone, under --rerun-each=3, and alongside five other
// files under --parallel=6 --isolate.

import { expect, test, } from "bun:test";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "build-verify.ts",);

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the script with `args`.
 *
 * @param args - argv after the script path.
 * @param env - extra env vars, merged into a copy of the parent environment.
 * @returns exit code and both decoded streams.
 */
function run(args: string[], env: Record<string, string> = {},): Run {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env, },
  },);
  return {
    code: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout,),
    stderr: new TextDecoder().decode(proc.stderr,),
  };
}

test("no args prints the local identity and exits 0", () => {
  const { code, stdout, } = run([],);
  expect(code,).toBe(0,);
  expect(stdout,).toContain("local buildHash:",);
  // No remote line without --url: the local-only path is unchanged.
  expect(stdout,).not.toContain("remote buildHash:",);
});

test("--url against an unreachable origin reports a fetch failure with exit 2", () => {
  // Port 1 is reserved and never listening, so this needs no network.
  const { code, stderr, } = run(["--url", "http://127.0.0.1:1",],);
  expect(code,).toBe(2,);
  expect(stderr,).toContain("remote fetch failed:",);
});

test("--admin alongside --url parses (exit 2 from the fetch, not 1 from the parser)", () => {
  const { code, stderr, } = run(["--url", "http://127.0.0.1:1", "--admin",], {
    BUILD_VERIFY_ADMIN_TOKEN: "",
  },);
  expect(code,).toBe(2,);
  expect(stderr,).toContain("remote fetch failed:",);
});

test("--help prints the brief and exits 0", () => {
  const { code, stdout, } = run(["--help",],);
  expect(code,).toBe(0,);
  expect(stdout,).toContain("Recompute the local build hash",);
});

test("an undeclared flag is a parse error, not a silent no-op", () => {
  const { code, stderr, } = run(["--nope",],);
  expect(code,).toBe(1,);
  expect(stderr,).toContain("--nope",);
});
