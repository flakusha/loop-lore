// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Re-hydration must be authoritative, not additive.
 *
 * A workflow the admin deleted — or disabled — has to disappear from the public
 * template list. If hydration only ever calls `register()`, the row is gone from
 * the DB but the previous hydration's copy is still in the registry Map, and the
 * deleted workflow keeps serving until the process restarts.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { Kysely, } from "kysely";
import type { LoreEntryStatus, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { TemplateRegistry, } from "../../image-edit/template-registry";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { hydrateWorkflowRegistry, } from "./hydrate";

const GRAPH = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}", }, },
  "2": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
};

const PAYLOAD = JSON.stringify({
  body: GRAPH,
  category: "txt2img",
  parameters: [],
  requiredNodes: [],
},);

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

async function addRow(id: string, enabled: LoreEntryStatus = "enabled",): Promise<void> {
  await db
    .insertInto("prompt_templates",)
    .values({
      id,
      owner_id: "admin-1",
      modality: "workflow",
      name: id,
      description: null,
      model_family: null,
      payload: PAYLOAD,
      is_default: "not_default",
      enabled,
    },)
    .execute();
}

describe("hydrateWorkflowRegistry is authoritative", () => {
  it("drops a workflow deleted from the library", async () => {
    await addRow("w-delete",);
    const registry = new TemplateRegistry();
    await hydrateWorkflowRegistry(db, registry,);
    expect(registry.listAll().map((t,) => t.id),).toContain("w-delete",);

    await db.deleteFrom("prompt_templates",).where("id", "=", "w-delete",).execute();
    await hydrateWorkflowRegistry(db, registry,);

    expect(registry.listAll().map((t,) => t.id),).not.toContain("w-delete",);
  });

  it("drops a workflow the admin disabled", async () => {
    await addRow("w-disable",);
    const registry = new TemplateRegistry();
    await hydrateWorkflowRegistry(db, registry,);
    expect(registry.listAll().map((t,) => t.id),).toContain("w-disable",);

    await db
      .updateTable("prompt_templates",)
      .set({ enabled: "disabled", },)
      .where("id", "=", "w-disable",)
      .execute();

    await hydrateWorkflowRegistry(db, registry,);

    expect(registry.listAll().map((t,) => t.id),).not.toContain("w-disable",);
  });

  it("leaves built-ins whose ids the library does not claim", async () => {
    await addRow("w-keep-builtins",);
    const registry = new TemplateRegistry();
    await registry.register({
      id: "builtin-controlnet",
      name: "builtin",
      description: "a built-in template",
      category: "controlnet",
      backends: ["comfyui",],
      required_nodes: [],
      parameters: [],
      build: () => GRAPH,
    },);

    await hydrateWorkflowRegistry(db, registry,);

    const ids = registry.listAll().map((t,) => t.id);
    expect(ids,).toContain("builtin-controlnet",);
    expect(ids,).toContain("w-keep-builtins",);
  });

  it("lets a library row win an id collision with a built-in", async () => {
    // The shipped configs/ files are named txt2img.json and img2img.json —
    // exactly the ids the TypeScript built-ins register. The library copy is the
    // operator-editable one, so it must be the one that survives. Registering
    // the built-in under a *different* id (as an earlier test did) never
    // exercised this and let the clobber ship.
    await addRow("txt2img",);
    const registry = new TemplateRegistry();
    registry.register({
      id: "txt2img",
      name: "built-in txt2img",
      description: "the TypeScript template",
      category: "txt2img",
      backends: ["comfyui",],
      required_nodes: ["KSampler",],
      parameters: [{ name: "prompt", type: "string", label: "Prompt", default: "", required: true, },],
      build: () => GRAPH,
    },);

    await hydrateWorkflowRegistry(db, registry,);

    const winner = registry.get("txt2img",);
    // addRow names the row after its id, so this distinguishes the library copy
    // (name "txt2img") from the built-in it replaced (name "built-in txt2img").
    expect(winner?.name,).toBe("txt2img",);
    expect(registry.listAll().filter((t,) => t.id === "txt2img"),).toHaveLength(1,);
  });
});
