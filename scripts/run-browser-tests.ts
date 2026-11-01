// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Run every browser flow and report all file results before exiting non-zero.
 * A single failing flow must not hide later browser regressions.
 *
 * Specs run through a bounded worker pool (BROWSER_JOBS, default 2) instead
 * of strictly one-at-a-time: each spec is parallel-safe by construction —
 * `Bun.serve({ port: 0 })` (ephemeral port), an in-memory DB per spec file,
 * and a lock-guarded, hash-named immutable frontend build tree
 * (`ensureFrontendBuild`) — so file-level concurrency collides on no SHARED
 * resource. The binding constraint is CPU: a full-corpus check run at
 * BROWSER_JOBS=3 (while the unit chunk drained and a second lane ran its
 * own suite) starved `new-chat-advanced-fields.browser.ts`'s 15s
 * `waitForRequest` into a timeout that the same spec passes in isolation —
 * load flake, not a collision, but a flake is a flake. Default 2 keeps
 * most of the win (the serial runner spent 187-473s here) without
 * observed flakes. Raise BROWSER_JOBS=N only on an idle box.
 * Each spec's own `bun test --max-concurrency=1` is untouched; the 300ms
 * post-exit grace (chromium teardown reclaim) also stays per file. The
 * e2e browser gate's 45-minute budget bounds the whole pool.
 */
import { readdir, } from "node:fs/promises";
import { join, resolve, } from "node:path";
import { ensureFrontendBuild, } from "../tests/e2e/helpers/browser-frontend-build";

const root = resolve(import.meta.dir, "..",);
const browserDir = join(root, "tests", "e2e", "flows", "browser",);
const files = (await readdir(browserDir,))
  .filter((file,) => file.endsWith(".browser.ts",))
  .sort()
  .map((file,) => `./${join("tests", "e2e", "flows", "browser", file,)}`);
if (files.length === 0) {
  console.error("Browser suite discovery found no *.browser.ts files.",);
  process.exit(1,);
}

// Warm the frontend build once, before workers race on the build lock: the
// helper itself is concurrency-safe (stale-PID lock + hash-named trees), but
// one warm build means every worker goes straight to serving.
ensureFrontendBuild();

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
  console.error(`Browser suite failed: ${failed.length}/${files.length} files failed:`,);
  for (const file of failed) { console.error(` - ${file}`,); }
  process.exitCode = 1;
} else {
  console.log(`Browser suite passed: ${files.length} files.`,);
}
