// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Run the QA-subset browser flows (`tests/e2e/flows/browser/qa-subset.txt`)
 * and report all file results before exiting non-zero. A single failing flow
 * must not hide later regressions.
 *
 * Identical execution model to `run-browser-tests.ts` — same per-spec env
 * (E2E_SAFEGUARD=1, HTTP_PROXY="", NO_PROXY="*"), same
 * `E2E_FRONTEND_BUILD_DIR` warm build, same BROWSER_JOBS=2 pool (each spec
 * is parallel-safe: ephemeral port, per-file in-memory DB, hash-named
 * immutable frontend build tree) — except discovery reads the curated list
 * instead of the whole directory. The subset is the fast-trustworthy slice
 * (target <5 min wall); the full baseline covers the rest.
 */
import { readFile, } from "node:fs/promises";
import { join, resolve, } from "node:path";
import { ensureFrontendBuild, } from "../tests/e2e/helpers/browser-frontend-build";

const root = resolve(import.meta.dir, "..",);
const browserDir = join(root, "tests", "e2e", "flows", "browser",);
const subsetFile = join(browserDir, "qa-subset.txt",);
const raw = await readFile(subsetFile, "utf8",);
const files = raw
  .split("\n",)
  .map((line,) => line.trim())
  .filter((line,) => line !== "" && !line.startsWith("#",))
  .map((file,) => `./${join("tests", "e2e", "flows", "browser", file,)}`);
if (files.length === 0) {
  console.error("QA subset discovery found no specs in qa-subset.txt.",);
  process.exit(1,);
}

// Warm the frontend build once, before workers race on the build lock: the
// helper itself is concurrency-safe (stale-PID lock + hash-named trees), but
// one warm build means every worker goes straight to serving. The published
// tree is handed down through E2E_FRONTEND_BUILD_DIR instead of being rebuilt
// per worker: a worker that rebuilds re-runs the whole frontend build, and a
// build that FAILS then costs every spec the full build timeout instead of
// failing the gate once, here.
const buildDir = ensureFrontendBuild();

const BROWSER_JOBS = Math.max(
  1,
  Number.parseInt(process.env.BROWSER_JOBS ?? "2", 10,) || 2,
);

const failed: string[] = [];
let next = 0;

async function runSpec(file: string,): Promise<void> {
  console.log(`Running ${file}...`,);
  // process.execPath, not "bun": the gate runner invokes this script with a
  // PATH that need not contain bun, and a by-name spawn died with ENOENT.
  const child = Bun.spawn([process.execPath, "test", "--max-concurrency=1", file,], {
    cwd: root,
    env: {
      ...process.env,
      E2E_FRONTEND_BUILD_DIR: buildDir,
      E2E_SAFEGUARD: "1",
      HTTP_PROXY: "",
      NO_PROXY: "*",
    },
    stdout: "inherit",
    stderr: "inherit",
  },);
  const exitCode = await child.exited;
  if (exitCode !== 0) { failed.push(file,); }
  await Bun.sleep(300,);
}

async function worker(): Promise<void> {
  while (next < files.length) {
    const file = files[next++]!;
    await runSpec(file,);
  }
}

await Promise.all(
  Array.from({ length: Math.min(BROWSER_JOBS, files.length,), }, () => worker(),),
);

if (failed.length > 0) {
  console.error(`QA subset failed: ${failed.length}/${files.length} files failed:`,);
  for (const file of failed) { console.error(` - ${file}`,); }
  process.exitCode = 1;
} else {
  console.log(`QA subset passed: ${files.length} files.`,);
}
