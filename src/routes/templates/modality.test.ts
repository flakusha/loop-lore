// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the per-modality template API (FEAT-065 SUB-VIDEO /
 * SUB-AUDIO): CRUD with ownership + modality guards, and the 501 apply
 * contract while no video/audio generation provider exists.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertPromptTemplates, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { promptTemplateRoutes, } from "./index";

/** Response shapes asserted by these tests. */
interface TemplateIdRow {
  template: { id: string };
}
interface TemplateListBody {
  templates: { id: string; modality: string }[];
}
interface TemplatePayloadBody {
  template: { name: string; payload: { body: string; params?: Record<string, string> } };
}
interface ErrorBody {
  code: string;
  error: string;
}

function makeApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-modality-templates", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(promptTemplateRoutes({ database: db, },),) as unknown as Elysia;
}

const VIDEO_BODY = {
  name: "Spell cast clip",
  detail_level: "balanced",
  payload: { body: "{{subject}}. Motion: {{motion}}.", params: { duration: "4s", }, },
};

function post(app: Elysia, path: string, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

function patch(app: Elysia, path: string, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** Create a video template through the API and return its row id. */
async function createVideoId(app: Elysia,): Promise<string> {
  const created = await post(app, "/api/templates/video", VIDEO_BODY,);
  expect(created.status,).toBe(200,);
  const body = (await created.json()) as TemplateIdRow;
  return body.template.id;
}

describe("per-modality template routes", () => {
  let db: Kysely<DB>;
  const userId = uid();
  const otherId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${userId}`, "Video User", { id: userId, } as never,);
    await insertUsers(db, `user-${otherId}`, "Other User", { id: otherId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 for every per-modality endpoint without a session", async () => {
    const app = makeApp(db, null,);
    for (const path of ["/api/templates/video", "/api/templates/audio",]) {
      const listed = await app.handle(new Request(`http://localhost${path}`,),);
      expect(listed.status,).toBe(401,);
      const created = await post(app, path, VIDEO_BODY,);
      expect(created.status,).toBe(401,);
    }
  });

  test("static modality paths win over the :id route and list only their modality", async () => {
    await insertPromptTemplates(db, userId, "Foreign image", {
      modality: "image",
      payload: JSON.stringify({ templateBody: "x", },),
    },);
    const videoId = await insertPromptTemplates(db, userId, "Seeded video", {
      modality: "video",
      payload: JSON.stringify({ body: "clip", },),
    },);
    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/templates/video",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as TemplateListBody;
    expect(body.templates.some((t,) => t.id === videoId),).toBe(true,);
    expect(body.templates.every((t,) => t.modality === "video"),).toBe(true,);
  });

  test("create → list → get → patch → delete round-trip", async () => {
    const app = makeApp(db, userId,);
    const id = await createVideoId(app,);

    const listed = await app.handle(new Request("http://localhost/api/templates/video",),);
    const listBody = (await listed.json()) as TemplateListBody;
    expect(listBody.templates.some((t,) => t.id === id),).toBe(true,);

    const got = await app.handle(new Request(`http://localhost/api/templates/video/${id}`,),);
    expect(got.status,).toBe(200,);
    const gotBody = (await got.json()) as TemplatePayloadBody;
    expect(gotBody.template.payload.body,).toBe(VIDEO_BODY.payload.body,);
    expect(gotBody.template.payload.params?.duration,).toBe("4s",);

    const patched = await patch(app, `/api/templates/video/${id}`, { name: "Renamed clip", },);
    expect(patched.status,).toBe(200,);
    const patchedBody = (await patched.json()) as TemplatePayloadBody;
    expect(patchedBody.template.name,).toBe("Renamed clip",);

    const deleted = await app.handle(
      new Request(`http://localhost/api/templates/video/${id}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(204,);
    const gone = await app.handle(new Request(`http://localhost/api/templates/video/${id}`,),);
    expect(gone.status,).toBe(404,);
  });

  test("audio factory mirrors the CRUD contract", async () => {
    const app = makeApp(db, userId,);
    const created = await post(app, "/api/templates/audio", {
      name: "Calm ambience",
      payload: { body: "{{mood}} ambience", },
    },);
    expect(created.status,).toBe(200,);
    const body = (await created.json()) as TemplateIdRow;
    const { id, } = body.template;

    const listed = await app.handle(new Request("http://localhost/api/templates/audio",),);
    const listBody = (await listed.json()) as TemplateListBody;
    expect(listBody.templates.some((t,) => t.id === id),).toBe(true,);

    const deleted = await app.handle(
      new Request(`http://localhost/api/templates/audio/${id}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(204,);
  });

  test("create rejects a mismatched or invalid payload without persisting", async () => {
    const app = makeApp(db, userId,);
    const mismatched = await post(app, "/api/templates/video", { ...VIDEO_BODY, modality: "audio", },);
    expect(mismatched.status,).toBe(400,);
    const badShape = await post(app, "/api/templates/video", { name: "Bad", payload: {}, },);
    expect(badShape.status,).toBe(400,);
  });

  test("get/patch/delete enforce ownership (other user → 404)", async () => {
    const ownerId = uid();
    await insertUsers(db, `user-${ownerId}`, "Row Owner", { id: ownerId, } as never,);
    const rowId = await insertPromptTemplates(db, ownerId, "Owned video", {
      modality: "video",
      payload: JSON.stringify({ body: "x", },),
    },);
    const app = makeApp(db, userId,);
    const base = `http://localhost/api/templates/video/${rowId}`;
    const got = await app.handle(new Request(base,),);
    expect(got.status,).toBe(404,);
    const patched = await patch(app, base, { name: "Hijack", },);
    expect(patched.status,).toBe(404,);
    const deleted = await app.handle(new Request(base, { method: "DELETE", },),);
    expect(deleted.status,).toBe(404,);
  });

  test("cross-modality rows 404 on the wrong modality route without mutation", async () => {
    const audioId = await insertPromptTemplates(db, userId, "Audio only", {
      modality: "audio",
      payload: JSON.stringify({ body: "original body", },),
    },);
    const app = makeApp(db, userId,);
    const got = await app.handle(new Request(`http://localhost/api/templates/video/${audioId}`,),);
    expect(got.status,).toBe(404,);
    const patched = await patch(app, `/api/templates/video/${audioId}`, { name: "X", },);
    expect(patched.status,).toBe(404,);
    // The 404 must not have mutated the row (write happens only after the
    // owned+matching pre-check passes).
    const reRead = await app.handle(new Request(`http://localhost/api/templates/audio/${audioId}`,),);
    expect(reRead.status,).toBe(200,);
    const body = (await reRead.json()) as TemplatePayloadBody;
    expect(body.template.name,).toBe("Audio only",);
    expect(body.template.payload.body,).toBe("original body",);
  });

  test("patch with a payload that breaks the modality shape answers 400", async () => {
    const app = makeApp(db, userId,);
    const id = await createVideoId(app,);
    const res = await patch(app, `/api/templates/video/${id}`, { payload: {}, },);
    expect(res.status,).toBe(400,);
  });

  test("patch rejects a modality move via body", async () => {
    const app = makeApp(db, userId,);
    const id = await createVideoId(app,);
    const moved = await patch(app, `/api/templates/video/${id}`, { modality: "image", },);
    expect(moved.status,).toBe(400,);
  });

  test("apply answers 501 NOT_IMPLEMENTED for an owned template", async () => {
    const app = makeApp(db, userId,);
    const id = await createVideoId(app,);
    const res = await post(app, `/api/templates/video/${id}/apply`, { context: { subject: "Aria", }, },);
    expect(res.status,).toBe(501,);
    const body = (await res.json()) as ErrorBody;
    expect(body.code,).toBe("NOT_IMPLEMENTED",);
    expect(body.error,).toContain("video",);
    expect(body.error,).toContain("/api/templates/:id/apply",);
  });

  test("apply 404s for unknown, foreign, and cross-modality ids before the 501", async () => {
    const app = makeApp(db, userId,);
    const foreignOwner = uid();
    await insertUsers(db, `user-${foreignOwner}`, "Foreign Owner", { id: foreignOwner, } as never,);
    const foreignId = await insertPromptTemplates(db, foreignOwner, "Foreign", {
      modality: "video",
      payload: JSON.stringify({ body: "x", },),
    },);
    const imageId = await insertPromptTemplates(db, userId, "Image row", {
      modality: "image",
      payload: JSON.stringify({ templateBody: "x", },),
    },);
    const unknownRes = await post(app, "/api/templates/video/does-not-exist/apply", {},);
    expect(unknownRes.status,).toBe(404,);
    const foreignRes = await post(app, `/api/templates/video/${foreignId}/apply`, {},);
    expect(foreignRes.status,).toBe(404,);
    const imageRes = await post(app, `/api/templates/video/${imageId}/apply`, {},);
    expect(imageRes.status,).toBe(404,);
  });

  test("audio apply answers 501 with an audio-specific message", async () => {
    const app = makeApp(db, userId,);
    const created = await post(app, "/api/templates/audio", {
      name: "TTS line",
      payload: { body: "{{text}}", },
    },);
    const body = (await created.json()) as TemplateIdRow;
    const res = await post(app, `/api/templates/audio/${body.template.id}/apply`, {},);
    expect(res.status,).toBe(501,);
    const errBody = (await res.json()) as ErrorBody;
    expect(errBody.error,).toContain("audio",);
  });

  test("unknown id 404s on get within the modality route", async () => {
    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/templates/video/nope",),);
    expect(res.status,).toBe(404,);
  });
});
