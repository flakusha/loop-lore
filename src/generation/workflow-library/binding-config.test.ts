// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { TemplateParameter, } from "../../image-edit/types";
import { PINNED_OBJECT_INFO_SHA256, } from "../comfyui-converter/schema-authority";
import { BINDINGS_FILE, loadWorkflowBindings, parametersForSpec, } from "./binding-config";
import type { WorkflowBindingSpec, } from "./bindings";
import { buildWorkflowGraph, rowToPayload, } from "./row";
import type { SeedOutcome, } from "./seed";
import { resetSeedOwnerForTests, seedWorkflowLibrary, } from "./seed";

/**\n * Parallel-safe resource contract: each case owns a unique `wf-bindings-*`\n * temp dir and, for the seed case, a fresh in-memory DB. `afterEach` removes\n * the dirs; the seed case destroys its DB and resets the owner cache in\n * `finally`. No case touches repo files or shared global state.\n */
const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wf-bindings-",),);
  dirs.push(dir,);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0,).map((dir,) => rm(dir, { recursive: true, force: true, },)),);
},);

const GRAPH = {
  "frame_0": { class_type: "LoadImage", inputs: { image: "{{frame_0}}", }, },
  "frame_1": { class_type: "LoadImage", inputs: { image: "{{frame_1}}", }, },
  "join": { class_type: "ImageBatch", inputs: { image1: ["frame_0", 0,], image2: ["frame_1", 0,], }, },
  "save": { class_type: "SaveImage", inputs: { images: ["join", 0,], }, },
};

const FANOUT: WorkflowBindingSpec = {
  bindings: [{
    kind: "fanout",
    parameter: "frames",
    targetTemplate: { node: "frame_{index}", input: "image", },
    emitAs: "frame_{index}",
    maxItems: 2,
  },],
};

function config(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    schemaVersion: 1,
    bindingPolicy: "augment",
    snapshot: { objectInfoSha256: PINNED_OBJECT_INFO_SHA256, },
    workflows: { fanout: FANOUT, },
    ...overrides,
  };
}

async function writeCase(
  dir: string,
  value: Record<string, unknown>,
  graph: unknown = GRAPH,
): Promise<void> {
  await writeFile(join(dir, "fanout.json",), JSON.stringify(graph,),);
  await writeFile(join(dir, BINDINGS_FILE,), JSON.stringify(value,),);
}

describe("loadWorkflowBindings", () => {
  it("returns null when no config is present", async () => {
    expect(await loadWorkflowBindings(await tempDir(),),).toEqual({ ok: true, config: null, },);
  });

  it("accepts a config whose pin and targets match the shipped graphs", async () => {
    const dir = await tempDir();
    await writeCase(dir, config(),);
    const loaded = await loadWorkflowBindings(dir,);
    expect(loaded.ok,).toBe(true,);
  });

  it("rejects a stale snapshot pin", async () => {
    const dir = await tempDir();
    await writeCase(dir, config({ snapshot: { objectInfoSha256: "f".repeat(64,), }, },),);
    const loaded = await loadWorkflowBindings(dir,);
    expect(loaded.ok,).toBe(false,);
    if (!loaded.ok) { expect(loaded.errors.join(" ",),).toContain("pin mismatch",); }
  });

  it("rejects a binding target that no longer exists", async () => {
    const dir = await tempDir();
    await writeCase(
      dir,
      config({
        workflows: {
          fanout: {
            bindings: [{ kind: "scalar", parameter: "prompt", target: { node: "gone", input: "text", }, },],
          },
        },
      },),
    );

    const loaded = await loadWorkflowBindings(dir,);
    expect(loaded.ok,).toBe(false,);
    if (!loaded.ok) { expect(loaded.errors.join(" ",),).toContain("unknown node",); }
  });
});

describe("parametersForSpec", () => {
  it("augments derived metadata and honours explicit policy", () => {
    const derived: TemplateParameter[] = [
      { name: "frames", type: "string", label: "Frames", default: "", },
      { name: "seed", type: "number", label: "Seed", default: 0, },
    ];

    const spec: WorkflowBindingSpec = {
      parameters: [{ name: "frames", type: "image", label: "Frames", default: [], },],
      bindings: FANOUT.bindings,
    };

    expect(parametersForSpec(spec, derived, "augment",).map((p,) => p.type),).toEqual(["image", "number",],);
    expect(parametersForSpec(spec, derived, "explicit",),).toEqual([...spec.parameters ?? [],],);
    expect(parametersForSpec(undefined, derived, "augment",),).toEqual(derived,);
  });
});

describe("bound workflow round trip", () => {
  it("seeds the spec and expands fanout vars at build time", async () => {
    const dir = await tempDir();
    await writeCase(dir, config(),);
    const { createTestDb, } = await import("../../test-utils/create-test-db");
    const { insertUsers, } = await import("../../test-utils/insert-helpers");
    const made = await createTestDb();
    try {
      await insertUsers(made.db, "admin", "Admin", { id: "admin-1", role: "admin", },);
      resetSeedOwnerForTests();
      const outcome: SeedOutcome = await seedWorkflowLibrary(made.db, dir,);
      expect(outcome.imported,).toEqual(["fanout",],);
      expect(outcome.skipped,).toEqual([],);

      const row = await made.db
        .selectFrom("prompt_templates",)
        .selectAll()
        .where("id", "=", "fanout",)
        .executeTakeFirstOrThrow();

      const payload = rowToPayload(row,)!;
      expect(payload.bindings,).toEqual(FANOUT,);

      const graph = buildWorkflowGraph(payload, { frames: ["a.png", "b.png",], },);
      expect(graph["frame_0"]?.inputs.image,).toBe("a.png",);
      expect(graph["frame_1"]?.inputs.image,).toBe("b.png",);
    } finally {
      await made.db.destroy();
      made.sqlite.close();
      resetSeedOwnerForTests();
    }
  });
});
