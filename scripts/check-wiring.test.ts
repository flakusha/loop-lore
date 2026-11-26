// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, test, } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const roots: string[] = [];

async function write(root: string, rel: string, text: string,) {
  const file = join(root, rel,);
  await mkdir(join(file, "..",), { recursive: true, },);
  await writeFile(file, text,);
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "loop-lore-wiring-",),);
  roots.push(root,);
  await write(root, "src/app/register-plugins.ts", "",);
  await write(root, "src/elysia-app.ts", "",);
  // Canonical loader holds the scan roots; the app-root file is a shim.
  await write(
    root,
    "packages/plugins/src/plugins/loader.ts",
    'export const PLUGIN_DIRS = ["plugins/core", "plugins/community"];\n',
  );
  await write(root, "src/plugins/loader.ts", 'export * from "@loop-lore/plugins/plugins/loader";\n',);
  for (const [tier, name,] of [["core", "alpha",], ["community", "beta",],]) {
    await write(root, `packages/plugins/${tier}/${name}/plugin.ts`, `export const plugin = { name: "${name}" };\n`,);
    await write(
      root,
      `plugins/${tier}/${name}/plugin.ts`,
      `export * from "@loop-lore/plugins/root/${tier}/${name}/plugin";\n`,
    );
  }
  return root;
}

async function run(root: string,) {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "check-wiring.ts",),], {
    cwd: join(import.meta.dir, "..",),
    env: { ...process.env, WIRING_ROOT: root, },
    stdout: "pipe",
    stderr: "pipe",
  },);
  const [stdout, stderr, exitCode,] = await Promise.all([
    new Response(proc.stdout,).text(),
    new Response(proc.stderr,).text(),
    proc.exited,
  ],);
  return { stdout, stderr, exitCode, };
}

afterEach(async () => {
  for (const root of roots.splice(0,)) {
    await rm(root, { recursive: true, force: true, },);
  }
},);

test("discovers canonical package plugin manifests and loader scan roots", async () => {
  const root = await fixture();
  const { exitCode, stderr, } = await run(root,);
  expect(exitCode,).toBe(0,);
  expect(stderr,).not.toContain("wiring violation",);
});

test("keeps the manifest-name check on canonical package files", async () => {
  const root = await fixture();
  await write(root, "packages/plugins/core/alpha/plugin.ts", 'export const plugin = { name: "wrong" };\n',);
  const { exitCode, stderr, } = await run(root,);
  expect(exitCode,).toBe(1,);
  expect(stderr,).toContain(
    "plugin `alpha` (packages/plugins/core/alpha/plugin.ts) manifest name mismatch or missing",
  );
});

test("asserts a missing loader explicitly instead of fabricating one", async () => {
  const root = await fixture();
  await rm(join(root, "packages/plugins/src/plugins/loader.ts",),);
  await rm(join(root, "src/plugins/loader.ts",),);
  const { exitCode, stderr, } = await run(root,);
  expect(exitCode,).toBe(1,);
  expect(stderr,).toContain("plugin loader not found",);
});
