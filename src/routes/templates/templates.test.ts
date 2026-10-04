// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the unified prompt-template API (FEAT-065):
 * CRUD, presets, apply, and import/export.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertPromptTemplates, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { promptTemplateRoutes, } from "./index";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-prompt-templates", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(promptTemplateRoutes({ database: db, },),) as unknown as Elysia;
}

const IMAGE_BODY = {
  name: "Cinematic portrait",
  modality: "image",
  description: "Moody portrait skeleton",
  payload: {
    templateBody: "{{subject}}, cinematic lighting, 85mm",
    negativePrompt: "blurry",
  },
};

const LLM_BODY = {
  name: "Roleplay system",
  modality: "llm",
  payload: {
    sections: [{ identifier: "system", role: "system", content: "", enabled: true, priority: 0, },],
  },
};

const WORKFLOW_BODY = {
  name: "Anima txt2img",
  modality: "workflow",
  payload: {
    name: "Anima",
    category: "txt2img",
    parameters: [],
    requiredNodes: [],
    body: {
      "1": { class_type: "KSampler", inputs: { seed: 1, }, },
      "2": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
    },
  },
};

describe("promptTemplateRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();
  const otherId = uid();
  const actorId = uid();
  const chatId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${userId}`, "Template User", { id: userId, } as never,);
    await insertUsers(db, `user-${otherId}`, "Other User", { id: otherId, } as never,);
    // The LLM apply path renders through PromptAssembler, which needs a real
    // actor and chat — a preset row is not enough to reach the assembler.
    await insertActors(db, "Alice", { id: actorId, user_id: userId, system_prompt: "Actor prompt.", } as never,);
    await insertChats(db, "Template chat", userId, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 for every endpoint without a session", async () => {
    const app = makeApp(db, null,);
    const list = await app.handle(new Request("http://localhost/api/templates",),);
    expect(list.status,).toBe(401,);
    const create = await app.handle(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(IMAGE_BODY,),
      },),
    );

    expect(create.status,).toBe(401,);
  });

  test("create → list → get → patch → delete round-trip", async () => {
    const app = makeApp(db, userId,);
    const created = await app.handle(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(IMAGE_BODY,),
      },),
    );

    expect(created.status,).toBe(200,);
    const row = ((await created.json()) as { template: { id: string } }).template;
    expect(row.id.length,).toBeGreaterThan(0,);

    const list = await app.handle(new Request("http://localhost/api/templates?modality=image",),);
    expect(list.status,).toBe(200,);
    const listBody = (await list.json()) as { templates: { id: string }[] };
    expect(listBody.templates.some((t,) => t.id === row.id),).toBe(true,);

    const got = await app.handle(new Request(`http://localhost/api/templates/${row.id}`,),);
    expect(got.status,).toBe(200,);
    const gotBody = (await got.json()) as { template: { payload: { templateBody: string } } };
    expect(gotBody.template.payload.templateBody,).toBe(IMAGE_BODY.payload.templateBody,);

    const patched = await app.handle(
      new Request(`http://localhost/api/templates/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Renamed", },),
      },),
    );

    expect(patched.status,).toBe(200,);
    expect(((await patched.json()) as { template: { name: string } }).template.name,).toBe("Renamed",);

    const deleted = await app.handle(
      new Request(`http://localhost/api/templates/${row.id}`, { method: "DELETE", },),
    );

    expect(deleted.status,).toBe(204,);
    const gone = await app.handle(new Request(`http://localhost/api/templates/${row.id}`,),);
    expect(gone.status,).toBe(404,);
  });

  test("rejects unknown modality on create", async () => {
    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Bad", modality: "smell", payload: {}, },),
      },),
    );

    expect(res.status,).toBe(422,);
  });

  test("list includes LLM presets", async () => {
    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/templates?modality=llm",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { templates: { id: string; isPreset: boolean }[] };
    const preset = body.templates.find((t,) => t.id === "preset-roleplay");
    expect(preset?.isPreset,).toBe(true,);
  });

  test("preset detail is readable and read-only", async () => {
    const app = makeApp(db, userId,);
    const got = await app.handle(
      new Request("http://localhost/api/templates/preset-roleplay",),
    );

    expect(got.status,).toBe(200,);
    const body = (await got.json()) as { template: { isPreset: boolean; modality: string } };
    expect(body.template.isPreset,).toBe(true,);
    expect(body.template.modality,).toBe("llm",);

    const patch = await app.handle(
      new Request("http://localhost/api/templates/preset-roleplay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Hijacked", },),
      },),
    );

    expect(patch.status,).toBe(404,);
  });

  test("apply renders image template variables", async () => {
    const app = makeApp(db, userId,);
    const created = await app.handle(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(IMAGE_BODY,),
      },),
    );

    const { id, } = ((await created.json()) as { template: { id: string } }).template;
    const applied = await app.handle(
      new Request(`http://localhost/api/templates/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ context: { subject: "a lone lighthouse", }, },),
      },),
    );

    expect(applied.status,).toBe(200,);
    const body = (await applied.json()) as { prompt: string; negativePrompt: string };
    expect(body.prompt,).toBe("a lone lighthouse, cinematic lighting, 85mm",);
    expect(body.negativePrompt,).toBe("blurry",);
  });

  test("apply returns 404 for a missing template", async () => {
    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/templates/tmpl-missing/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  /**
   * Create a template through the API, then apply it in one step.
   * @param opts
   * @param opts.app - App carrying the session under test
   * @param opts.template - Template body to create
   * @param opts.apply - Apply request body
   */
  async function createThenApply(
    { app, template, apply, }: { app: Elysia; template: unknown; apply: unknown },
  ): Promise<Response> {
    const created = await app.handle(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(template,),
      },),
    );

    expect(created.status,).toBe(200,);
    const { id, } = ((await created.json()) as { template: { id: string } }).template;
    return await app.handle(
      new Request(`http://localhost/api/templates/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(apply,),
      },),
    );
  }

  test("apply rejects an LLM template without an actor and chat", async () => {
    const res = await createThenApply({ app: makeApp(db, userId,), template: LLM_BODY, apply: {}, },);
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toContain("requires actorId and chatId",);
  });

  test("apply assembles an LLM template against the actor and chat", async () => {
    const res = await createThenApply({
      app: makeApp(db, userId,),
      template: LLM_BODY,
      apply: { actorId, chatId, },
    },);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      messages: { role: string; content: string }[];
      systemPrompt: string;
      tokenCount: number;
      tokenBudget: number;
    };

    // The override template supplies an empty system section, so the actor's
    // own system prompt is what must survive into the assembled messages.
    const rendered = body.messages.map((m,) => m.content).join("\n",);
    expect(rendered,).toContain("Actor prompt.",);
    expect(body.tokenCount,).toBeGreaterThan(0,);
  });

  test("apply rejects a workflow template instead of rendering the graph", async () => {
    const res = await createThenApply({ app: makeApp(db, userId,), template: WORKFLOW_BODY, apply: {}, },);
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string };
    // The message must point at the surface that actually runs a graph;
    // silently stringifying the ComfyUI JSON is the bug this guards.
    expect(body.error,).toContain("not prompt bodies",);
  });

  test("apply rejects a row whose payload does not match its modality", async () => {
    // Written straight to the DB: the create endpoint shape-checks payloads,
    // so a mismatched row can only come from a legacy or direct write.
    const id = await insertPromptTemplates(db, userId, "Corrupt video", {
      modality: "video",
      payload: JSON.stringify({ body: 42, },),
    },);

    const res = await makeApp(db, userId,).handle(
      new Request(`http://localhost/api/templates/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(((await res.json()) as { error: string }).error,).toContain("malformed",);
  });

  test("ownership: another user cannot see, patch, or delete", async () => {
    const appA = makeApp(db, userId,);
    const created = await appA.handle(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(IMAGE_BODY,),
      },),
    );

    const { id, } = ((await created.json()) as { template: { id: string } }).template;

    const appB = makeApp(db, otherId,);
    const got = await appB.handle(new Request(`http://localhost/api/templates/${id}`,),);
    expect(got.status,).toBe(404,);
    const patched = await appB.handle(
      new Request(`http://localhost/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Stolen", },),
      },),
    );

    expect(patched.status,).toBe(404,);
    const deleted = await appB.handle(
      new Request(`http://localhost/api/templates/${id}`, { method: "DELETE", },),
    );

    expect(deleted.status,).toBe(404,);
  });

  test("import/export round-trip preserves payloads and skips invalid", async () => {
    const appA = makeApp(db, userId,);
    const pack = {
      version: 1,
      exportedBy: userId,
      templates: [
        { ...IMAGE_BODY, name: "Pack A", },
        { name: "Bad", modality: "image", payload: {}, },
      ],
    };

    const imp = await appA.handle(
      new Request("http://localhost/api/templates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(pack,),
      },),
    );

    expect(imp.status,).toBe(200,);
    const impBody = (await imp.json()) as { imported: number; skipped: number };
    expect(impBody.imported,).toBe(1,);
    expect(impBody.skipped,).toBe(1,);

    const exp = await appA.handle(new Request("http://localhost/api/templates/export",),);
    expect(exp.status,).toBe(200,);
    const exported = (await exp.json()) as {
      version: number;
      exportedBy: string;
      templates: { name: string; payload: { templateBody: string } }[];
    };

    expect(exported.version,).toBe(1,);
    expect(exported.exportedBy,).toBe(userId,);
    const packed = exported.templates.find((t,) => t.name === "Pack A");
    expect(packed?.payload.templateBody,).toBe(IMAGE_BODY.payload.templateBody,);
  });
});
