// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Run every browser flow and report all file results before exiting non-zero.
 * A single failing flow must not hide later browser regressions.
 */
import { readdir, } from "node:fs/promises";
import { join, resolve, } from "node:path";

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

const failed: string[] = [];

for (const file of files) {
  console.log(`Running ${file}...`,);
  const child = Bun.spawn(["bun", "test", "--max-concurrency=1", file,], {
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

if (failed.length > 0) {
  console.error(`Browser suite failed: ${failed.length}/${files.length} files failed:`,);
  for (const file of failed) { console.error(` - ${file}`,); }
  process.exitCode = 1;
} else {
  console.log(`Browser suite passed: ${files.length} files.`,);
}
