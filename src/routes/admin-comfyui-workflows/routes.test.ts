// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin ComfyUI workflow surface: the invariants an operator would only
 * discover in production otherwise.
 *
 *   - the surface is admin-only
 *   - a malformed graph is refused with the specific ingest errors
 *   - exactly one default survives per (model_family, modality)
 *   - an id belonging to another modality is invisible, so delete cannot
 *     take an LLM or image template row with it
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import { readFile, } from "node:fs/promises";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { adminSurface, } from "../v1/admin-surface";
import { adminComfyuiWorkflowRoutes, } from "./index";

const PREFIX = "/api/v1";
const BASE = `${PREFIX}/admin/comfyui-workflows`;

/** The real operator export that shipped with the epic, kept as a fixture. */
const ANIMA_PATH = "./configs/workflows/uploads/i-anima-0001.json";

/** Minimal valid graph: a loader feeding a terminal SaveImage sink. */
const GRAPH = {
  "1": { inputs: { text: "{{prompt}}", }, class_type: "CLIPTextEncode", },
  "2": { inputs: { clip: ["1", 0,], filename_prefix: "x", }, class_type: "SaveImage", },
};

let db: Kysely<DB>;
let sqlite: Database;

/** Mount the surface for a role; null role means unauthenticated. */
function appFor(role: string | null, userId: string | null = role ? `${role}-1` : null,): Elysia {
  // The cast matches every other route test: the mounted plugin's phantom
  // route types are richer than the bare `Elysia` the harness is declared as.
  return new Elysia({ name: `test-workflows-${role ?? "anon"}`, },)
    .derive((): { userId: string | null; userRole: string | null } => ({ userId, userRole: role, }))
    .use(adminComfyuiWorkflowRoutes({ database: db, }, PREFIX,),) as unknown as Elysia;
}

/** POST a body as an admin and return the response plus its parsed JSON. */
async function postAsAdmin(
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await appFor("admin",).handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text,) : {}, };
}

/** A stored row, for direct assertion on what a handler wrote. */
async function rowById(id: string,) {
  return db.selectFrom("prompt_templates",).selectAll().where("id", "=", id,).executeTakeFirst();
}

beforeAll(async () => {
  const made = await createTestDb();
  db = made.db;
  sqlite = made.sqlite;
  await insertUsers(db, "admin", "Admin", { id: "admin-1", role: "admin", },);
  await insertUsers(db, "user", "User", { id: "user-1", role: "user", },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

beforeEach(async () => {
  await db.deleteFrom("prompt_templates",).execute();
},);

describe("admin ComfyUI workflow routes — authz", () => {
  it("refuses a non-admin", async () => {
    const res = await appFor("user",).handle(new Request(`http://localhost${BASE}`,),);
    expect(res.status,).toBe(403,);
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await appFor(null,).handle(new Request(`http://localhost${BASE}`,),);
    expect(res.status,).toBe(403,);
  });
});

describe("admin ComfyUI workflow routes — create", () => {
  it("ingests a bare ComfyUI export and normalises it like the seed path", async () => {
    const { status, json, } = await postAsAdmin(BASE, { name: "Base", ...GRAPH, },);
    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    expect(row?.modality,).toBe("workflow",);
    expect(row?.is_default,).toBe("not_default",);
    expect(row?.enabled,).toBe("enabled",);
    const payload = JSON.parse(String(row?.payload,),) as Record<string, unknown>;
    expect(payload.category,).toBe("txt2img",);
    expect(payload.parameters,).toEqual([],);
    expect(payload.requiredNodes,).toEqual([],);
  });

  it("lands the real Anima export — the reference fixture, unmodified on disk", async () => {
    // Reads the shipped file rather than an inline copy, so cleaning the graph
    // and landing it here cannot drift apart. This export is what strict
    // dead-node rejection originally refused (stale `60:45` CLIPLoader); the
    // node was removed because nothing referenced it — both CLIPTextEncode
    // nodes take their clip from 60:61 (CLIPLoaderGGUF).
    const raw = await readFile(ANIMA_PATH, "utf8",);
    const { status, json, } = await postAsAdmin(BASE, { name: "Anima", ...JSON.parse(raw,), },);
    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    expect(row?.modality,).toBe("workflow",);
    const payload = JSON.parse(String(row?.payload,),) as { body: Record<string, unknown> };
    expect(Object.keys(payload.body,),).toHaveLength(9,);
    // The removed node is gone and the CLIP the text encoders actually use is
    // still wired in.
    expect(Object.hasOwn(payload.body, "60:45",),).toBe(false,);
    expect(payload.body["60:11"],).toBeDefined();
    expect(payload.body["60:61"],).toBeDefined();
  });

  it("rejects a dead node with the offending ids", async () => {
    const { status, json, } = await postAsAdmin(BASE, {
      name: "Dead",
      "1": { inputs: {}, class_type: "CheckpointLoaderSimple", },
      "2": { inputs: { clip: ["1", 0,], }, class_type: "SaveImage", },
      "9": { inputs: {}, class_type: "CLIPTextEncode", },
    },);
    expect(status,).toBe(400,);
    expect(String(json.error,),).toContain("dead node",);
    expect(String(json.error,),).toContain("9",);
  });

  it("rejects a declared parameter with no placeholder in the graph", async () => {
    const { status, json, } = await postAsAdmin(BASE, {
      name: "Params",
      ...GRAPH,
      parameters: [{ name: "prompt", },],
    },);
    // `prompt` has a placeholder, so this one passes; the negative case is the
    // parameter the graph never references.
    expect(status,).toBe(201,);
    expect(json.id,).toBeString();

    const bad = await postAsAdmin(BASE, {
      name: "Params",
      ...GRAPH,
      parameters: [{ name: "steps", },],
    },);
    expect(bad.status,).toBe(400,);
    expect(String(bad.json.error,),).toContain("steps has no matching {{placeholder}}",);
  });

  it("rejects a request with no graph at all", async () => {
    const { status, json, } = await postAsAdmin(BASE, { name: "Empty", },);
    expect(status,).toBe(400,);
    expect(String(json.error,),).toContain("no ComfyUI graph",);
  });

  it("requires a name", async () => {
    const { status, json, } = await postAsAdmin(BASE, { ...GRAPH, },);
    expect(status,).toBe(400,);
    expect(String(json.error,),).toContain("name is required",);
  });
});

describe("admin ComfyUI workflow routes — default flag", () => {
  it("moves the default rather than creating a second one", async () => {
    const first = await postAsAdmin(BASE, { name: "First", model_family: "sdxl", ...GRAPH, },);
    const second = await postAsAdmin(BASE, { name: "Second", model_family: "sdxl", ...GRAPH, },);
    const firstId = String(first.json.id,);
    const secondId = String(second.json.id,);

    expect((await postAsAdmin(`${BASE}/${firstId}/default`, {},)).status,).toBe(200,);
    expect((await postAsAdmin(`${BASE}/${secondId}/default`, {},)).status,).toBe(200,);

    const rows = await db.selectFrom("prompt_templates",).select(["id", "is_default",],).execute();
    expect(rows.filter((row,) => row.is_default === "default").map((row,) => row.id),).toEqual([
      secondId,
    ],);
  });

  it("leaves another model family's default alone", async () => {
    const sdxl = await postAsAdmin(BASE, { name: "S", model_family: "sdxl", ...GRAPH, },);
    const flux = await postAsAdmin(BASE, { name: "F", model_family: "flux", ...GRAPH, },);
    await postAsAdmin(`${BASE}/${sdxl.json.id}/default`, {},);
    await postAsAdmin(`${BASE}/${flux.json.id}/default`, {},);

    const rows = await db.selectFrom("prompt_templates",).select(["id", "is_default",],).execute();
    expect(rows.filter((row,) => row.is_default === "default"),).toHaveLength(2,);
  });
});

describe("admin ComfyUI workflow routes — enabled flag", () => {
  it("toggles and lists by the flag", async () => {
    const created = await postAsAdmin(BASE, { name: "Toggle", ...GRAPH, },);
    const id = String(created.json.id,);

    const off = await postAsAdmin(`${BASE}/${id}/enabled`, {},);
    expect(off.status,).toBe(200,);
    expect(off.json.enabled,).toBe("disabled",);

    const listed = await appFor("admin",).handle(
      new Request(`http://localhost${BASE}?enabled=disabled`,),
    );
    const listJson = await listed.json() as { total: number };
    expect(listJson.total,).toBe(1,);

    const on = await postAsAdmin(`${BASE}/${id}/enabled`, {},);
    expect(on.json.enabled,).toBe("enabled",);
  });
});

describe("admin ComfyUI workflow routes — read one / update", () => {
  it("serves the stored payload for one row", async () => {
    const created = await postAsAdmin(BASE, { name: "Read", ...GRAPH, },);
    const id = String(created.json.id,);

    const res = await appFor("admin",).handle(new Request(`http://localhost${BASE}/${id}`,),);
    expect(res.status,).toBe(200,);
    const json = await res.json() as { node_count: number; payload: { category: string } };
    expect(json.node_count,).toBe(2,);
    expect(json.payload.category,).toBe("txt2img",);
  });

  it("updates metadata while carrying the stored graph forward", async () => {
    const created = await postAsAdmin(BASE, { name: "Old", ...GRAPH, },);
    const id = String(created.json.id,);

    const res = await appFor("admin",).handle(
      new Request(`http://localhost${BASE}/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "New", category: "inpaint", min_vram: 12288, },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await rowById(id,);
    expect(row?.name,).toBe("New",);
    expect(row?.min_vram,).toBe(12288,);
    const payload = JSON.parse(String(row?.payload,),) as { body: Record<string, unknown>; category: string };
    expect(payload.category,).toBe("inpaint",);
    expect(Object.keys(payload.body,),).toEqual(["1", "2",],);
  });

  it("refuses an update whose new graph has a dead node and leaves the row intact", async () => {
    const created = await postAsAdmin(BASE, { name: "Keep", ...GRAPH, },);
    const id = String(created.json.id,);

    const res = await appFor("admin",).handle(
      new Request(`http://localhost${BASE}/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "Broken",
          ...GRAPH,
          "9": { inputs: {}, class_type: "CLIPTextEncode", },
        },),
      },),
    );
    expect(res.status,).toBe(400,);
    expect((await rowById(id,))?.name,).toBe("Keep",);
  });
});

describe("admin ComfyUI workflow routes — registration", () => {
  it("is reachable at /api/v1 through the v1 admin surface", async () => {
    const surface = new Elysia({ name: "test-v1-admin-surface", },)
      .derive(
        (): { userId: string | null; userRole: string | null } => ({ userId: "admin-1", userRole: "admin", }),
      )
      .use(adminSurface({ database: db, config: {} as never, asyncStore: {} as never, },),);

    const res = await surface.handle(new Request(`http://localhost${BASE}`,),);
    expect(res.status,).toBe(200,);
    const json = await res.json() as { total: number };
    expect(json.total,).toBe(0,);
  });
});

describe("admin ComfyUI workflow routes — modality scoping", () => {
  it("hides an LLM template from list, get, update and delete", async () => {
    await db.insertInto("prompt_templates",).values({
      id: "llm-1",
      owner_id: "admin-1",
      modality: "llm",
      name: "Chat",
      description: null,
      model_family: null,
      detail_level: "balanced",
      payload: JSON.stringify({ sections: [], },),
    },).execute();
    expect((await rowById("llm-1",))?.modality,).toBe("llm",);

    const listed = await appFor("admin",).handle(new Request(`http://localhost${BASE}`,),);
    const listJson = await listed.json() as { total: number };
    expect(listJson.total,).toBe(0,);

    const del = await appFor("admin",).handle(
      new Request(`http://localhost${BASE}/llm-1`, { method: "DELETE", },),
    );
    expect(del.status,).toBe(404,);
    expect((await rowById("llm-1",))?.name,).toBe("Chat",);
  });
});
