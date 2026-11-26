// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fixture install-tree tests for `status` / `verify --json`.
 *
 * Resource contract: each test builds its own temp prefix via `withFixture`
 * and removes it in `finally`; no ports, globals, module mocks, or shared
 * state. Nothing here launches, executes, or loads any binary — the fixture
 * files are plain text, and discovery is asserted by path listing only.
 */

import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { fileURLToPath, } from "node:url";
import { collectVariants, formatHuman, formatJson, parseArgs, run, type VariantReport, } from "./status";

const SCRIPT = fileURLToPath(new URL("./status.ts", import.meta.url,),);

/** Prefix with stale versioned libs next to the unversioned symlink, plus edge cases. */
function buildFixture(root: string,): { container: string; variantA: string } {
  const container = join(root, "install",);
  const variantA = join(container, "llama.cpp-vulkan-x64",);
  mkdirSync(join(variantA, "bin",), { recursive: true, },);
  mkdirSync(join(variantA, "lib64",), { recursive: true, },);
  writeFileSync(
    join(variantA, "build-info.json",),
    JSON.stringify({ project: "llama.cpp", accelerator: "vulkan", arch: "x64", ref: "abc1234", },),
  );
  writeFileSync(join(variantA, "bin", "llama-server",), "fake-binary",);
  symlinkSync(join("..", "missing-target",), join(variantA, "bin", "dangling",),);
  mkdirSync(join(variantA, "bin", "nested-dir",),);
  writeFileSync(join(variantA, "lib64", "libggml-vulkan.so.0.27.0",), "fake-lib-current",);
  writeFileSync(join(variantA, "lib64", "libggml-vulkan.so.0.15.3",), "fake-lib-stale",);
  symlinkSync("libggml-vulkan.so.0.27.0", join(variantA, "lib64", "libggml-vulkan.so",),);

  const variantB = join(container, "sdcpp-vulkan-x64",);
  mkdirSync(join(variantB, "bin",), { recursive: true, },);
  writeFileSync(join(variantB, "BUILD_REF",), "  def5678\n",);
  writeFileSync(join(variantB, "bin", "sd-server",), "fake-binary",);

  mkdirSync(join(container, "empty-variant",), { recursive: true, },);

  const variantD = join(container, "tiny-cpu-x64",);
  mkdirSync(variantD, { recursive: true, },);
  writeFileSync(join(variantD, "BUILD_REF",), "aaa111",);
  writeFileSync(join(variantD, "bin",), "bin-is-a-file-not-a-dir",);
  return { container, variantA, };
}

function withFixture(fn: (root: string, variantA: string,) => void,): void {
  const root = mkdtempSync(join(tmpdir(), "tooling-status-",),);
  try {
    const { container, variantA, } = buildFixture(root,);
    fn(container, variantA,);
  } finally {
    rmSync(root, { recursive: true, force: true, },);
  }
}

function artifactPaths(variants: VariantReport[],): string[] {
  return variants.flatMap((variant,) => variant.artifacts.map((artifact,) => artifact.path));
}

describe("status fixture tree", () => {
  test("collects variants with ref, accelerator, arch, root, and artifacts", () => {
    withFixture((container,) => {
      const variants = collectVariants([container,],);
      expect(variants,).toHaveLength(4,);
      const first = variants.find((variant,) => variant.project === "llama.cpp");
      expect(first?.ref,).toBe("abc1234",);
      expect(first?.accelerator,).toBe("vulkan",);
      expect(first?.arch,).toBe("x64",);
      expect(first?.root,).toBe(join(container, "llama.cpp-vulkan-x64",),);
      const kinds = new Set(first?.artifacts.map((artifact,) => artifact.kind),);
      expect(kinds,).toEqual(new Set(["binary", "library",],),);
      for (const artifact of first?.artifacts ?? []) {
        expect(artifact.ref,).toBe("abc1234",);
      }
    },);
  });

  test("follows the unversioned symlink and ignores stale versioned libs", () => {
    withFixture((container,) => {
      const paths = artifactPaths(collectVariants([container,],),);
      expect(paths.some((path,) => path.endsWith("libggml-vulkan.so",)),).toBe(true,);
      expect(paths.some((path,) => path.endsWith(".so.0.15.3",)),).toBe(false,);
      expect(paths.some((path,) => path.endsWith(".so.0.27.0",)),).toBe(false,);
      const link = paths.find((path,) => path.endsWith("libggml-vulkan.so",));
      const variants = collectVariants([container,],);
      const library = variants.flatMap((variant,) => variant.artifacts).find((artifact,) => artifact.path === link);
      // stat follows the symlink, so the link reports the target's size.
      expect(library?.size,).toBe("fake-lib-current".length,);
    },);
  });

  test("records BUILD_REF and marks unrecorded refs unknown", () => {
    withFixture((container,) => {
      const variants = collectVariants([container,],);
      const second = variants.find((variant,) => variant.project === "sdcpp");
      expect(second?.ref,).toBe("def5678",);
      const empty = variants.find((variant,) => variant.project === "empty-variant");
      expect(empty?.ref,).toBe("unknown",);
      expect(empty?.accelerator,).toBe("unknown",);
      expect(empty?.arch,).toBe("unknown",);
      expect(empty?.artifacts,).toEqual([],);
    },);
  });

  test("reports unreadable artifacts instead of dropping them", () => {
    withFixture((container,) => {
      const variants = collectVariants([container,],);
      const dangling = variants
        .flatMap((variant,) => variant.artifacts)
        .find((artifact,) => artifact.path.endsWith(`${"bin"}/dangling`,));
      expect(dangling?.size,).toBe(0,);
      expect(dangling?.mtime,).toBe("unknown",);
    },);
  });

  test("probes a variant prefix directly and tolerates a missing root", () => {
    withFixture((container, variantA,) => {
      expect(collectVariants([variantA,],),).toHaveLength(1,);
      expect(collectVariants([join(container, "does-not-exist",),],),).toEqual([],);
    },);
  });

  test("human output never implies a binary was run", () => {
    withFixture((container,) => {
      const text = formatHuman(collectVariants([container,],),);
      expect(text,).toContain("llama.cpp @ abc1234 [vulkan/x64]",);
      expect(text,).toContain(`root: ${join(container, "llama.cpp-vulkan-x64",)}`,);
      expect(text,).toContain("no artifacts reported",);
      expect(text,).toContain("no binary was launched, executed, or loaded",);
      for (const word of ["verified", "working", "successfully", "passed",]) {
        expect(text.toLowerCase(),).not.toContain(word,);
      }
      expect(formatHuman([],),).toContain("No installed variants reported.",);
    },);
  });

  test("json output carries the same field set", () => {
    withFixture((container,) => {
      const doc = JSON.parse(formatJson(collectVariants([container,],),),) as {
        note: string;
        generatedAt: string;
        variants: VariantReport[];
      };
      expect(doc.note,).toContain("no binary was launched",);
      expect(typeof doc.generatedAt,).toBe("string",);
      expect(doc.variants,).toHaveLength(4,);
      for (const variant of doc.variants) {
        for (const key of ["project", "ref", "accelerator", "arch", "root", "artifacts",]) {
          expect(variant,).toHaveProperty(key,);
        }
        for (const artifact of variant.artifacts) {
          for (const key of ["path", "kind", "ref", "size", "mtime",]) {
            expect(artifact,).toHaveProperty(key,);
          }
        }
      }
    },);
  });

  test("run serves both subcommands", () => {
    withFixture((container,) => {
      const human = run(["status", "--root", container,],);
      expect(human,).toContain("llama.cpp @ abc1234",);
      const fromVerify = JSON.parse(run(["verify", "--json", "--root", container,],),) as { variants: VariantReport[] };
      expect(fromVerify.variants,).toHaveLength(4,);
      const implied = JSON.parse(run(["verify", "--root", container,],),) as { variants: VariantReport[] };
      expect(implied.variants,).toHaveLength(4,);
      const mixed = JSON.parse(run(["status", "--json", `--root=${container}`,],),) as { variants: VariantReport[] };
      expect(mixed.variants,).toHaveLength(4,);
      const positional = run(["status", container,],);
      expect(positional,).toContain("sdcpp @ def5678 [vulkan/x64]",);
    },);
  });

  test("parseArgs rejects bad invocations", () => {
    expect(() => parseArgs([],)).toThrow("Missing subcommand",);
    expect(() => parseArgs(["bogus",],)).toThrow("Unknown subcommand",);
    expect(() => parseArgs(["status", "--bogus",],)).toThrow("Unknown flag",);
    expect(() => parseArgs(["status", "--root",],)).toThrow("Missing value for --root",);
    expect(parseArgs(["status",],),).toEqual({ command: "status", roots: [".",], json: false, },);
  });

  test("cli runs both subcommands as a subprocess", () => {
    withFixture((container,) => {
      const status = spawnSync("bun", [SCRIPT, "status", "--root", container,], { encoding: "utf8", },);
      expect(status.status,).toBe(0,);
      expect(status.stdout,).toContain("llama.cpp @ abc1234",);
      const verify = spawnSync("bun", [SCRIPT, "verify", "--json", "--root", container,], { encoding: "utf8", },);
      expect(verify.status,).toBe(0,);
      const doc = JSON.parse(verify.stdout,) as { variants: VariantReport[] };
      expect(doc.variants,).toHaveLength(4,);
      const usage = spawnSync("bun", [SCRIPT, "bogus",], { encoding: "utf8", },);
      expect(usage.status,).toBe(2,);
    },);
  });
});
