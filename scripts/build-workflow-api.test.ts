// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Drift gate for the generated workflow catalog. Every test owns one unique
 * scratch dir under `.tmp/`; the pinned snapshot fixture is read-only shared.
 * No DB, no network, no live ComfyUI.
 *
 * @module scripts/build-workflow-api.test
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import type { UiWorkflow, } from "../src/generation/comfyui-converter/index";
import { collectPlaceholders, } from "../src/generation/workflow-substitutor";
import {
  buildAll,
  buildWorkflowGraph,
  DEFAULT_OVERLAY,
  EMPTY_GRAPH_POLICY,
  loadSnapshot,
  main,
  ORIGINALS_DIR,
} from "./build-workflow-api";

const scratchDirs: string[] = [];

/** Own one fresh scratch dir per test; teardown never depends on assertions. */
function scratch(): string {
  // A fresh worktree has no .tmp/ yet; mkdtempSync does not create its parent.
  mkdirSync(".tmp", { recursive: true, },);
  const dir = mkdtempSync(join(".tmp", `workflow-api-${randomUUID()}-`,),);
  scratchDirs.push(dir,);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0,)) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

function committed(id: string,): string {
  return readFileSync(join("configs/workflows", `${id}-v1.json`,), "utf8",);
}

describe("build-workflow-api", () => {
  it("regenerates every committed API graph", () => {
    const out = scratch();
    main(["--out", out,],);
    const result = buildAll({ originalsDir: ORIGINALS_DIR, outDir: out, overlayPath: DEFAULT_OVERLAY, },);
    expect(result.built.length,).toBe(14,);
    expect(result.excluded.map(({ id, },) => id).sort(),).toEqual(Object.keys(EMPTY_GRAPH_POLICY,).sort(),);
    for (const { id, } of result.built) {
      const path = join(out, `${id}-v1.json`,);
      const generated = readFileSync(path, "utf8",);
      // Hand-edit any committed graph and this comparison fails.
      expect(generated, `drift in ${id}`,).toBe(committed(id,),);
    }
  });

  it("detects a hand-edited graph", () => {
    const out = scratch();
    main(["--out", out,],);
    const original = readFileSync(join(out, "sdxl-v1.json",), "utf8",);
    const tampered = join(out, `${randomUUID()}-sdxl-v1.json`,);
    writeFileSync(tampered, original.replace('"{{prompt}}"', '"{{wrong}}"',), "utf8",);
    expect(readFileSync(tampered, "utf8",),).not.toBe(committed("sdxl",),);
  });

  it("strips mark prefixes and keeps derived parameters bound", () => {
    const out = scratch();
    loadSnapshot(DEFAULT_OVERLAY,);
    main(["--out", out,],);
    const result = buildAll({ originalsDir: ORIGINALS_DIR, outDir: out, overlayPath: DEFAULT_OVERLAY, },);
    for (const { graph, parameters, } of result.built) {
      const placeholders = collectPlaceholders(graph,);
      for (const parameter of parameters) {
        expect(placeholders.has(parameter.name,),).toBe(true,);
      }
      for (const node of Object.values(graph,)) {
        if (node._meta?.title !== undefined) {
          expect(node._meta.title.startsWith("[p]",),).toBe(false,);
        }
      }
    }

    const workflow = JSON.parse(readFileSync(join(ORIGINALS_DIR, "moss-wf.json",), "utf8",),) as UiWorkflow;
    const marked = structuredClone(workflow,) as UiWorkflow;
    const vae = (marked.nodes ?? [])[5] as { id: number; type: string; title?: string };
    expect(vae.type,).toBe("VAELoader",);
    vae.title = "[p] Load VAE";
    const built = buildWorkflowGraph("moss", marked, loadSnapshot(DEFAULT_OVERLAY,),);
    expect(built.parameters.length,).toBeGreaterThan(0,);
    expect(built.graph["6"]?._meta?.title,).toBe("Load VAE",);
    expect(collectPlaceholders(built.graph,).has("load_vae",),).toBe(true,);
  });
});
