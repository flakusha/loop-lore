// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `.metadata/` folder matrix (USER-APPROVED 2026-11-01 extension): safe
 * names, realpath containment, symlink escapes, and `[items]` linkage.
 * Parallel-safe: per-test mkdtemp fixtures removed in afterEach.
 *
 * Resource contract: per-test mkdtemp dirs under tmpdir (removed in afterEach
 * on all paths, including the outside-escape target); no module-global seams
 * are touched in this file. bun runs each test file in its own process
 * (--isolate).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  isValidItemName,
  loadProjectMetadata,
  METADATA_FILE,
  METADATA_FOLDER,
  validateProjectMetadataText,
} from "./index";

let dirs: string[] = [];

/** Fresh per-test fixture root; removed in afterEach. */
function makeRoot(prefix: string,): string {
  const dir = mkdtempSync(join(tmpdir(), `meta-items-${prefix}-`,),);
  dirs.push(dir,);
  return dir;
}

/** `<root>/.metadata/` path. */
function folderIn(root: string,): string {
  return join(root, METADATA_FOLDER,);
}

beforeEach(() => {
  dirs = [];
},);

afterEach(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true, },);
  }

  dirs = [];
},);

describe("isValidItemName", () => {
  test("accepts safe names", () => {
    for (const name of ["lockfile", "sbom.json", "Tool-Chain_v2", "A",]) {
      expect(isValidItemName(name,),).toBe(true,);
    }
  });

  test("rejects leading dots, separators, and empty names", () => {
    for (const name of [".hidden", "..", ".", "a/b", "a\\\\b", "",]) {
      expect(isValidItemName(name,),).toBe(false,);
    }
  });
});

describe("folder containment (loader)", () => {
  test("symlink escape in .metadata/ is rejected via realpath", async () => {
    const root = makeRoot("escape",);
    const outside = mkdtempSync(join(tmpdir(), "meta-outside-",),);
    dirs.push(outside,);
    mkdirSync(folderIn(root,),);
    writeFileSync(join(outside, "secret",), "x",);
    symlinkSync(outside, join(folderIn(root,), "leak",),);
    writeManifest(root, 'metadata_version = 1\n[items."leak"]\nkind = "linkable"\n',);

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    const leak = result.value.items.find((item,) => item.name === "leak");
    // Declared but escaped on disk: kept as declared-only, dropped from disk.
    expect(leak?.present,).toBe(false,);
    expect(result.value.events.some((event,) => event.type === "metadata_item_escape"),).toBe(true,);
    expect(result.value.findings.some((finding,) => finding.code === "item_escape"),).toBe(true,);
  });

  test("contained items survive the scan; unsafe disk names are rejected", async () => {
    const root = makeRoot("safe",);
    mkdirSync(folderIn(root,),);
    writeFileSync(join(folderIn(root,), "sbom.json",), "{}",);
    mkdirSync(join(folderIn(root,), ".dotdir",),);

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.items.map((item,) => item.name),).toEqual(["sbom.json",],);
    expect(result.value.events.some((event,) => event.type === "metadata_item_escape"),).toBe(true,);
    expect(result.value.findings.some((finding,) => finding.code === "item_name_invalid"),).toBe(true,);
  });

  test("folder is validated even when the toml is absent", async () => {
    const root = makeRoot("folder-only",);
    mkdirSync(folderIn(root,),);
    writeFileSync(join(folderIn(root,), "notes.md",), "x",);

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.items,).toEqual([
      { name: "notes.md", kind: null, description: null, declared: false, present: true, },
    ],);
  });
});

describe("[items] declarations + linkage", () => {
  test("declared + present links to the folder entry", async () => {
    const root = makeRoot("linked",);
    mkdirSync(folderIn(root,),);
    writeFileSync(join(folderIn(root,), "sbom.json",), "{}",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        '[items."sbom.json"]',
        'kind = "regeneratable"',
        'description = "regenerate with bun run sbom"',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.items,).toEqual([
      {
        name: "sbom.json",
        kind: "regeneratable",
        description: "regenerate with bun run sbom",
        declared: true,
        present: true,
      },
    ],);
  });

  test("declared-but-absent warns; present-but-undeclared lints", async () => {
    const root = makeRoot("linkage",);
    mkdirSync(folderIn(root,),);
    writeFileSync(join(folderIn(root,), "orphan",), "x",);
    writeManifest(root, 'metadata_version = 1\n[items."ghost"]\nkind = "linkable"\n',);

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.items.map((item,) => item.name),).toEqual(["ghost", "orphan",],);
    expect(result.value.items[0]?.present,).toBe(false,);
    expect(result.value.items[1]?.declared,).toBe(false,);
  });

  test("unsafe declared names are rejected with an escape event", async () => {
    const root = makeRoot("unsafe-decl",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        '[items.".hidden"]',
        'kind = "linkable"',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.items,).toEqual([],);
    expect(result.value.events.some((event,) => event.type === "metadata_item_escape"),).toBe(true,);
    expect(result.value.findings.some((finding,) => finding.code === "item_name_invalid"),).toBe(true,);
  });

  test("optional kind defaults to null; unknown kind is advisory-dropped", async () => {
    const root = makeRoot("kinds",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        '[items."plain"]',
        '[items."fancy"]',
        'kind = "teleported"',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    const byName = new Map(result.value.items.map((item,) => [item.name, item.kind,]),);
    expect(byName.get("plain",),).toBeNull();
    expect(byName.get("fancy",),).toBeNull();
    expect(result.value.events.some((event,) => event.dim === 'items."fancy".kind'),).toBe(true,);
  });
});

describe("validator folder checks", () => {
  test("reports linkage findings against a real root", () => {
    const root = makeRoot("validate",);
    mkdirSync(folderIn(root,),);
    writeFileSync(join(folderIn(root,), "here",), "x",);
    const text = 'metadata_version = 1\n[items."ghost"]\nkind = "linkable"\n';

    const result = validateProjectMetadataText(text, { root, },);
    expect(result.ok,).toBe(true,);
    expect(result.warnings.some((finding,) => finding.code === "item_missing"),).toBe(true,);
    expect(result.lints.some((finding,) => finding.code === "item_undeclared"),).toBe(true,);
  });

  test("without a root, containment is skipped as a lint", () => {
    const result = validateProjectMetadataText('metadata_version = 1\n[items."x"]\n',);
    expect(result.ok,).toBe(true,);
    expect(result.lints.some((finding,) => finding.code === "item_escape"),).toBe(true,);
  });
});

function writeManifest(root: string, text: string,): void {
  writeFileSync(join(root, METADATA_FILE,), text,);
}
