// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, test, } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { resolveNativeBinaryPath, } from "./loader";

/** Own temp roots only; no global env or module-cache mutation. */
const roots: string[] = [];
const binaryNames: Record<string, string | undefined> = {
  linux: "libloop_lore_native.so",
  darwin: "libloop_lore_native.dylib",
  win32: "loop_lore_native.dll",
};

afterEach(async () => {
  for (const root of roots.splice(0,)) {
    await rm(root, { recursive: true, force: true, },);
  }
},);

test("resolves release/debug binaries from an explicit cargo target dir", async () => {
  const fileName = binaryNames[process.platform];
  if (!fileName) { return; }

  const root = await mkdtemp(join(tmpdir(), "loop-lore-cargo-target-",),);
  roots.push(root,);
  await mkdir(join(root, "debug",), { recursive: true, },);
  await mkdir(join(root, "release",), { recursive: true, },);
  await writeFile(join(root, "debug", fileName,), "",);
  await writeFile(join(root, "release", fileName,), "",);

  expect(resolveNativeBinaryPath(root,),).toBe(join(root, "release", fileName,),);

  await rm(join(root, "release", fileName,),);
  expect(resolveNativeBinaryPath(root,),).toBe(join(root, "debug", fileName,),);
});
