// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the render-path asset rewrite (src/routes/views/hashed-assets.ts).
 *
 * Contract: `<script src>` / `<link href>` references to a logical bundle name
 * are rewritten to the hashed build output when one exists; references with no
 * hashed twin, and any tree without build output, pass through untouched — a
 * missing or partial build must degrade to the old URL, never a 404. The
 * lookup is mtime-cached, so a rebuild whose mtime moved must win over the
 * cached map.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, } from "node:path";
import { resolveHashedAssets, } from "./hashed-assets";

const trees: string[] = [];

/** A build-output tree holding `relPath → contents`, every entry a hashed name. */
function buildTree(files: Record<string, string>,): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-hashed-assets-",),);
  trees.push(dir,);
  for (const [relPath, contents,] of Object.entries(files,)) {
    const abs = join(dir, relPath,);
    mkdirSync(dirname(abs,), { recursive: true, },);
    writeFileSync(abs, contents,);
  }

  return dir;
}

afterEach(() => {
  for (const dir of trees.splice(0,)) { rmSync(dir, { recursive: true, force: true, },); }
},);

describe("resolveHashedAssets", () => {
  test("rewrites script and stylesheet references to the hashed build names", () => {
    const dir = buildTree({
      "app-abc12345.js": "// bundle",
      "css/style-de1b62f0.css": "/* bundle */",
    },);

    const html = resolveHashedAssets(
      '<script src="/app.js" defer></script>' +
        '<link rel="stylesheet" href="/css/style.css">',
      dir,
    );

    expect(html,).toContain('src="/app-abc12345.js"',);
    expect(html,).toContain('href="/css/style-de1b62f0.css"',);
  });

  test("references with no hashed twin are preserved verbatim", () => {
    const dir = buildTree({ "app-abc12345.js": "// bundle", },);
    const html = '<script src="/missing.js"></script>' +
      '<script src="https://cdn.example.com/app.js"></script>';

    expect(resolveHashedAssets(html, dir,),).toBe(html,);
  });

  test("a tree without build output is a no-op", () => {
    const dir = buildTree({},);
    const html = '<script src="/app.js"></script>';

    expect(resolveHashedAssets(html, dir,),).toBe(html,);
    // A missing directory passes through too, without throwing.
    expect(resolveHashedAssets(html, join(dir, "nope",),),).toBe(html,);
  });

  test("a rebuilt tree with a moved mtime replaces the cached lookup", () => {
    const dir = buildTree({ "app-abc12345.js": "// bundle", },);
    expect(resolveHashedAssets('<script src="/app.js"></script>', dir,),)
      .toContain('src="/app-abc12345.js"',);

    // Rebuild: new hash name, old one gone, and the tree's mtime moved forward
    // so the statSync invalidation must fire.
    rmSync(join(dir, "app-abc12345.js",),);
    writeFileSync(join(dir, "app-ff00ff00.js",), "// bundle",);
    utimesSync(dir, new Date(), new Date(Date.now() + 60_000,),);

    const html = resolveHashedAssets('<script src="/app.js"></script>', dir,);
    expect(html,).toContain('src="/app-ff00ff00.js"',);
    expect(html,).not.toContain('src="/app-abc12345.js"',);
  });
});
