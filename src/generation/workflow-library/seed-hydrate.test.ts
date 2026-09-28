// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Library round-trip tests: seed -> read back -> hydrate -> build graph.
 *
 * These seams only break at boot, so they run against a real migrated SQLite
 * DB rather than a stub. A temp dir is used for the bad-file case because the
 * seed scans a directory, not a list of injected records.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { Kysely, } from "kysely";
import { mkdtemp, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { DB, } from "../../db/schema";
import { TemplateRegistry, } from "../../image-edit/template-registry";
import type { TemplateParameter, TemplateParamType, } from "../../image-edit/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import {
  ensureWorkflowRegistry,
  hydrateWorkflowRegistry,
  invalidateWorkflowRegistry,
  resetWorkflowRegistryForTests,
} from "./hydrate";
import { buildWorkflowGraph, rowToPayload, rowToTemplate, } from "./row";
import { resetSeedOwnerForTests, seedWorkflowLibrary, } from "./seed";

const SHIPPED_DIR = "./configs/workflows";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const made = await createTestDb();
  db = made.db;
  sqlite = made.sqlite;
  await insertUsers(db, "admin", "Admin", { id: "admin-1", role: "admin", },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

/** A library row by id, for the projection tests. */
async function workflowRowById(id: string,) {
  const row = await db
    .selectFrom("prompt_templates",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();
  return row;
}

/** Minimal `TemplateParameter` for tests — `label` and `default` are required. */
function param(name: string, type: TemplateParamType, required: boolean,): TemplateParameter {
  return { name, type, label: name, default: "", required, };
}

/** Inputs of the first node of a given class, for substitution assertions. */
function inputsOf(graph: ComfyUIWorkflow, classType: string,): Record<string, unknown> {
  const node = Object.values(graph,).find((candidate,) => candidate.class_type === classType);
  return (node?.inputs ?? {}) as Record<string, unknown>;
}

describe("seedWorkflowLibrary", () => {
  it("imports the shipped workflows owned by the first admin", async () => {
    resetSeedOwnerForTests();
    const outcome = await seedWorkflowLibrary(db, SHIPPED_DIR,);
    expect(outcome.imported.length,).toBeGreaterThan(0,);
    expect(outcome.skipped,).toEqual([],);

    const row = await workflowRowById("txt2img",);
    expect(row.owner_id,).toBe("admin-1",);
    expect(row.modality,).toBe("workflow",);
  });

  it("is idempotent - a second run imports nothing new", async () => {
    const outcome = await seedWorkflowLibrary(db, SHIPPED_DIR,);
    expect(outcome.imported,).toEqual([],);
    expect(outcome.skipped.map((s,) => s.reason),).toEqual(["already in library", "already in library",],);
  });

  it("skips one bad file without failing the whole seed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf-seed-",),);
    await writeFile(
      join(dir, "good.json",),
      JSON.stringify({
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}", }, },
        "2": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
      },),
    );
    await writeFile(
      join(dir, "deadnode.json",),
      JSON.stringify({
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "m", }, },
        "2": { class_type: "CLIPLoader", inputs: { clip_name: "c", }, },
      },),
    );
    await writeFile(join(dir, "notjson.json",), "{ this is not json",);

    const outcome = await seedWorkflowLibrary(db, dir,);
    expect(outcome.imported,).toEqual(["good",],);

    const reasons = Object.fromEntries(outcome.skipped.map((s,) => [s.id, s.reason,]),);
    expect(reasons.notjson,).toBe("not valid JSON",);
    expect(reasons.deadnode,).toContain("2",);
  });

  it("imports nothing when no admin exists to own the rows", async () => {
    const fresh = await createTestDb();
    resetSeedOwnerForTests();
    const outcome = await seedWorkflowLibrary(fresh.db, SHIPPED_DIR,);
    expect(outcome.imported,).toEqual([],);
    expect(outcome.skipped,).toEqual([],);
    await fresh.db.destroy();
    fresh.sqlite.close();
  });
});

describe("rowToTemplate", () => {
  it("projects a row into a runnable template", async () => {
    const row = await workflowRowById("txt2img",);
    const template = rowToTemplate(row,);
    expect(template,).toBeDefined();
    expect(template?.id,).toBe("txt2img",);
    expect(typeof template?.build,).toBe("function",);
    // The seed stamps txt2img because a bare graph carries no category.
    expect(template?.category,).toBe("txt2img",);
  });

  it("takes the category from the filename when it names one", async () => {
    // A bare graph carries no category, so the seed infers it from the id.
    // Guessing txt2img unconditionally mislabelled img2img, and
    // SDServerEditProvider.execute dispatches on this value.
    await seedWorkflowLibrary(db, SHIPPED_DIR,);
    const stored = await db
      .selectFrom("prompt_templates",)
      .select(["id", "payload",],)
      .where("modality", "=", "workflow",)
      .execute();
    const img2img = stored.find((r,) => r.id === "img2img");
    const parsed = JSON.parse(img2img?.payload ?? "{}",) as { category?: string };
    expect(parsed.category,).toBe("img2img",);

    const registry = new TemplateRegistry();
    await hydrateWorkflowRegistry(db, registry,);
    expect(registry.get("img2img",)?.category,).toBe("img2img",);
  });

  it("refuses to build a graph with unresolved placeholders", () => {
    // A library row declares no parameters, so a run reaches build() with an
    // empty param map. Substituting "" would submit a blank prompt to ComfyUI
    // and return a blank image; this must fail loudly instead.
    const payload: WorkflowPayload = {
      body: { "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", }, }, },
      category: "txt2img",
      parameters: [],
      requiredNodes: [],
    };
    expect(() => buildWorkflowGraph(payload, {},)).toThrow(/unresolved placeholders: prompt/,);
  });

  it("builds when every placeholder is supplied", () => {
    const payload: WorkflowPayload = {
      body: { "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", }, }, },
      category: "txt2img",
      parameters: [param("prompt", "string", true,),],
      requiredNodes: [],
    };
    const graph = buildWorkflowGraph(payload, { prompt: "a cat", },);
    expect(graph["1"]?.inputs.text,).toBe("a cat",);
  });

  it("leaves an unfilled optional parameter as an empty string", () => {
    // Only a zero-parameter template is rejected. A declared-but-unfilled
    // optional parameter is legitimate and still collapses to "".
    const payload: WorkflowPayload = {
      body: {
        "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", negative: "{{neg}}", }, },
      },
      category: "txt2img",
      parameters: [
        param("prompt", "string", true,),
        param("neg", "string", false,),
      ],
      requiredNodes: [],
    };
    const graph = buildWorkflowGraph(payload, { prompt: "a cat", },);
    expect(graph["1"]?.inputs.negative,).toBe("",);
  });

  it("returns null when the stored payload is no longer a workflow", () => {
    const template = rowToTemplate({
      id: "x",
      name: "x",
      description: null,
      model_family: null,
      payload: "not-a-workflow",
      is_default: "not_default",
      enabled: "enabled",
      lora_slots: null,
      min_vram: null,
    },);
    expect(template,).toBeNull();
  });
});

describe("buildWorkflowGraph", () => {
  /**
   * The shipped txt2img graph with the metadata a real template carries.
   *
   * Seeded rows declare no parameters (that is the Phase 1 gap), and a
   * zero-parameter template with placeholders is deliberately rejected — so the
   * substitution tests have to run against a well-formed payload.
   */
  async function declaredPayload(): Promise<WorkflowPayload> {
    const payload = rowToPayload(await workflowRowById("txt2img",),);
    expect(payload,).not.toBeNull();
    return { ...payload as WorkflowPayload, parameters: [param("width", "number", false,),], };
  }

  it("substitutes params and keeps numbers numeric", async () => {
    const graph = buildWorkflowGraph(await declaredPayload(), {
      width: 1024,
      seed: 7,
    },);
    // width lives on EmptyLatentImage, seed on KSampler, in the shipped graph.
    const latent = inputsOf(graph, "EmptyLatentImage",);
    const sampler = inputsOf(graph, "KSampler",);
    expect(latent.width,).toBe(1024,);
    expect(sampler.seed,).toBe(7,);
    expect(typeof latent.width,).toBe("number",);
  });

  it("drops a non-primitive param rather than stringifying it", async () => {
    const graph = buildWorkflowGraph(await declaredPayload(), { width: { nested: true, }, },);
    expect(inputsOf(graph, "EmptyLatentImage",).width,).not.toBe("[object Object]",);
  });
});

describe("hydrateWorkflowRegistry", () => {
  it("registers enabled library rows", async () => {
    const registry = new TemplateRegistry();
    const count = await hydrateWorkflowRegistry(db, registry,);
    expect(count,).toBeGreaterThan(0,);
    expect(registry.listAll().map((t,) => t.id),).toContain("txt2img",);
  });

  it("memoizes so repeated callers share one hydration", async () => {
    resetWorkflowRegistryForTests();
    invalidateWorkflowRegistry();
    const registry = new TemplateRegistry();
    const first = await ensureWorkflowRegistry(db, registry,);
    const second = await ensureWorkflowRegistry(db, registry,);
    expect(second,).toBe(first,);
  });

  it("re-reads the library after invalidation", async () => {
    const registry = new TemplateRegistry();
    await ensureWorkflowRegistry(db, registry,);
    invalidateWorkflowRegistry();
    const reread = await ensureWorkflowRegistry(db, registry,);
    expect(reread,).toBeGreaterThan(0,);
  });

  it("does not register a disabled row", async () => {
    const row = await workflowRowById("txt2img",);
    await db
      .updateTable("prompt_templates",)
      .set({ enabled: "disabled", },)
      .where("id", "=", row.id,)
      .execute();
    try {
      const registry = new TemplateRegistry();
      await hydrateWorkflowRegistry(db, registry,);
      expect(registry.listAll().map((t,) => t.id),).not.toContain(row.id,);
    } finally {
      await db
        .updateTable("prompt_templates",)
        .set({ enabled: "enabled", },)
        .where("id", "=", row.id,)
        .execute();
    }
  });
});
