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
import { validateWorkflowPayload, } from "../../generation/workflow-library/validate";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { adminSurface, } from "../v1/admin-surface";
import { adminComfyuiWorkflowRoutes, } from "./index";
import { licenseValue, paramsReviewedValue, } from "./shared";

const PREFIX = "/api/v1";
const BASE = `${PREFIX}/admin/comfyui-workflows`;

/** The shipped Anima API export, read verbatim so ingest and catalog cannot drift. */
const ANIMA_PATH = "./configs/workflows/anima-v1.json";

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

/** PUT a body as an admin and return the status. */
async function putAsAdmin(path: string, body: unknown,): Promise<number> {
  const res = await appFor("admin",).handle(
    new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );

  return res.status;
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

  it("lands the shipped Anima API export unmodified", async () => {
    // Resource contract: owns nothing but the one row it inserts, which the
    // file-level `beforeEach` clears. The shipped file is read-only here.
    const raw = await readFile(ANIMA_PATH, "utf8",);
    const source: unknown = JSON.parse(raw,);
    const { status, json, } = await postAsAdmin(BASE, { name: "Anima", ...source as object, },);
    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    expect(row?.modality,).toBe("workflow",);
    const payload = JSON.parse(String(row?.payload,),) as { body: unknown };
    // Ingest stores the graph intact, and strict validation accepts its
    // SaveImageAdvanced sink and generation placeholders.
    expect(payload.body,).toEqual(source,);
    expect(payload.body,).toMatchObject({
      "1": { class_type: "SaveImageAdvanced", },
      "10": { inputs: { text: "{{prompt}}", }, },
      "11": { inputs: { text: "{{negative_prompt}}", }, },
    },);
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

describe("admin ComfyUI workflow routes — license fence", () => {
  it("records a trimmed license and the params-review flag on create", async () => {
    const { status, json, } = await postAsAdmin(BASE, {
      name: "Fenced",
      ...GRAPH,
      license: "  Apache-2.0  ",
      params_reviewed: true,
    },);

    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    expect(row?.license,).toBe("Apache-2.0",);
    expect(row?.params_reviewed,).toBe(1,);
  });

  it("stores a blank license as null and an omitted review as 0", async () => {
    const { status, json, } = await postAsAdmin(BASE, {
      name: "Unfenced",
      ...GRAPH,
      license: "   ",
    },);

    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    expect(row?.license,).toBeNull();
    expect(row?.params_reviewed,).toBe(0,);
  });

  it("refuses wrong-typed fence fields at the boundary", async () => {
    const badLicense = await postAsAdmin(BASE, {
      name: "Bad license",
      ...GRAPH,
      license: 42,
    },);

    expect(badLicense.status,).toBeGreaterThanOrEqual(400,);
    expect(badLicense.status,).toBeLessThan(500,);

    const badReview = await postAsAdmin(BASE, {
      name: "Bad review",
      ...GRAPH,
      params_reviewed: "yes",
    },);

    expect(badReview.status,).toBeGreaterThanOrEqual(400,);
    expect(badReview.status,).toBeLessThan(500,);

    const rows = await db.selectFrom("prompt_templates",).select("id",).execute();
    expect(rows,).toEqual([],);
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

  it("revalidates a probe-passing converted row on a metadata-only update", async () => {
    const converted = {
      "1": { inputs: { ckpt_name: "{{model}}", }, class_type: "CheckpointLoaderSimple", },
      "2": { inputs: { model: ["1", 0,], }, class_type: "KSampler", },
      "3": { inputs: { samples: ["2", 0,], }, class_type: "SaveImage", },
      "9": { inputs: { enabled: true, }, class_type: "DaSiWa_NodeStatusSwitch", },
    };

    const payload = {
      body: converted,
      category: "txt2img",
      parameters: [],
      requiredNodes: [],
    };

    const validated = validateWorkflowPayload(payload, { unreferencedLive: ["9",], },);
    if (!validated.ok) { throw new Error(validated.errors.join("; ",),); }

    await db.insertInto("prompt_templates",).values({
      id: "converted-1",
      owner_id: "admin-1",
      modality: "workflow",
      name: "Converted",
      description: null,
      model_family: null,
      detail_level: "balanced",
      payload: JSON.stringify(validated.payload,),
      probe_status: "passing",
    },).execute();

    const res = await appFor("admin",).handle(
      new Request(`http://localhost${BASE}/converted-1`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Renamed", },),
      },),
    );

    expect(res.status,).toBe(200,);
    expect((await rowById("converted-1",))?.name,).toBe("Renamed",);
  });

  it("keeps the other fence field on a partial update", async () => {
    const created = await postAsAdmin(BASE, {
      name: "Fenced",
      ...GRAPH,
      license: "MIT",
      params_reviewed: true,
    },);

    const id = String(created.json.id,);

    expect(await putAsAdmin(`${BASE}/${id}`, { params_reviewed: false, },),).toBe(200,);
    let row = await rowById(id,);
    expect(row?.license,).toBe("MIT",);
    expect(row?.params_reviewed,).toBe(0,);

    expect(await putAsAdmin(`${BASE}/${id}`, { license: "  GPL-3.0-only  ", },),).toBe(200,);
    row = await rowById(id,);
    expect(row?.license,).toBe("GPL-3.0-only",);
    expect(row?.params_reviewed,).toBe(0,);

    // An explicit null clears only the license; the review flag stays put.
    expect(await putAsAdmin(`${BASE}/${id}`, { license: null, params_reviewed: true, },),).toBe(200,);
    row = await rowById(id,);
    expect(row?.license,).toBeNull();
    expect(row?.params_reviewed,).toBe(1,);
  });

  it("serves the recorded fence on the detail read", async () => {
    const created = await postAsAdmin(BASE, {
      name: "Read fence",
      ...GRAPH,
      license: "BSD-3-Clause",
      params_reviewed: true,
    },);

    const id = String(created.json.id,);

    const res = await appFor("admin",).handle(new Request(`http://localhost${BASE}/${id}`,),);
    const json = await res.json() as { license: string; params_reviewed: number; probe_status: string };
    expect(json.license,).toBe("BSD-3-Clause",);
    expect(json.params_reviewed,).toBe(1,);
    expect(json.probe_status,).toBe("unprobed",);
  });

  it("refuses an invalid fence update without changing the row", async () => {
    const created = await postAsAdmin(BASE, {
      name: "Untouched",
      ...GRAPH,
      license: "MIT",
      params_reviewed: true,
    },);

    const id = String(created.json.id,);

    const status = await putAsAdmin(`${BASE}/${id}`, { params_reviewed: 1, },);
    expect(status,).toBeGreaterThanOrEqual(400,);
    expect(status,).toBeLessThan(500,);

    const row = await rowById(id,);
    expect(row?.license,).toBe("MIT",);
    expect(row?.params_reviewed,).toBe(1,);
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

describe("admin ComfyUI workflow routes — optional bindings", () => {
  const BINDINGS = {
    bindings: [{
      kind: "scalar",
      parameter: "prompt",
      target: { node: "1", input: "text", },
    },],
  };

  it("round-trips bindings through an upload without treating them as a node", async () => {
    const { status, json, } = await postAsAdmin(BASE, {
      name: "Bound",
      ...GRAPH,
      bindings: BINDINGS,
    },);

    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    const payload = JSON.parse(String(row?.payload,),) as Record<string, unknown>;
    expect(payload.bindings,).toEqual(BINDINGS,);
    expect(payload.body,).not.toHaveProperty("bindings",);
  });

  it("rejects malformed bindings through the existing validator", async () => {
    const { status, json, } = await postAsAdmin(BASE, {
      name: "Bad",
      ...GRAPH,
      bindings: { bindings: "not-an-array", },
    },);

    expect(status,).toBe(400,);
    expect(String(json.error,),).toContain("bindings",);
  });

  it("still accepts an upload with no bindings", async () => {
    const { status, json, } = await postAsAdmin(BASE, { name: "Plain", ...GRAPH, },);
    expect(status,).toBe(201,);

    const row = await rowById(String(json.id,),);
    const payload = JSON.parse(String(row?.payload,),) as Record<string, unknown>;
    expect(payload.bindings,).toBeUndefined();
  });
});

describe("write fences", () => {
  it("trims the license and nulls blanks", () => {
    expect(licenseValue("  MIT  ",),).toBe("MIT",);
    expect(licenseValue("   ",),).toBeNull();
    expect(licenseValue(undefined,),).toBeNull();
    expect(licenseValue(42,),).toBeNull();
  });

  it("keeps the row value when params_reviewed is omitted", () => {
    expect(paramsReviewedValue(undefined, 1,),).toBe(1,);
    expect(paramsReviewedValue(true, 0,),).toBe(1,);
    expect(paramsReviewedValue(false, 1,),).toBe(0,);
  });
});
