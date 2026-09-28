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
  it("substitutes params and keeps numbers numeric", async () => {
    const payload = rowToPayload(await workflowRowById("txt2img",),);
    expect(payload,).not.toBeNull();
    const graph = buildWorkflowGraph(payload as WorkflowPayload, {
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
    const payload = rowToPayload(await workflowRowById("txt2img",),);
    const graph = buildWorkflowGraph(payload as WorkflowPayload, { width: { nested: true, }, },);
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
