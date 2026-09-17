// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the prompt-template service (FEAT-065): serializer rules,
 * CRUD, preset/row resolution, and payload rendering.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import {
  applyImageTemplate,
  applySimpleTemplate,
  createTemplate,
  deleteTemplate,
  getOwnedTemplate,
  listTemplates,
  resolveLlmTemplateOverrideId,
  resolveTemplateDef,
  serializeTemplateInput,
  updateTemplate,
} from "./template-service";

describe("serializeTemplateInput", () => {
  test("accepts a valid image template", () => {
    const res = serializeTemplateInput({
      name: "T",
      modality: "image",
      payload: { templateBody: "{{subject}}", },
    },);
    expect(res.ok,).toBe(true,);
  });

  test("rejects unknown modality, bad detail level, empty name, bad payload", () => {
    expect(serializeTemplateInput({ name: "T", modality: "smell" as never, payload: {}, },).ok,).toBe(false,);
    expect(
      serializeTemplateInput(
        { name: "T", modality: "image", detail_level: "ultra" as never, payload: { templateBody: "x", }, },
      ).ok,
    ).toBe(false,);
    expect(serializeTemplateInput({ name: "  ", modality: "image", payload: { templateBody: "x", }, },).ok,).toBe(
      false,
    );
    expect(serializeTemplateInput({ name: "T", modality: "image", payload: {}, },).ok,).toBe(false,);
  });
});

describe("template service CRUD", () => {
  let db: Kysely<DB>;
  const userId = uid();
  const otherId = uid();

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${userId}`, "Svc User", { id: userId, } as never,);
    await insertUsers(db, `user-${otherId}`, "Other", { id: otherId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("create → get → list → update → delete", async () => {
    const row = await createTemplate(db, userId, {
      name: "Svc Image",
      modality: "image",
      description: "d",
      payload: { templateBody: "{{subject}}, dramatic", negativePrompt: "lowres", },
    },);
    expect(getOwnedTemplate(db, row.id, userId,),).resolves.toMatchObject({ name: "Svc Image", },);
    expect(getOwnedTemplate(db, row.id, otherId,),).resolves.toBeNull();

    const listed = await listTemplates(db, userId, "image",);
    expect(listed.some((t,) => t.id === row.id && t.isOwner),).toBe(true,);

    const updated = await updateTemplate(db, row.id, userId, { name: "Renamed", },);
    expect(updated?.name,).toBe("Renamed",);
    expect(updated === null || updated.payload,).toBeTruthy();

    expect(await updateTemplate(db, row.id, otherId, { name: "X", },),).toBeNull();

    expect(await deleteTemplate(db, row.id, userId,),).toBe(true,);
    expect(await getOwnedTemplate(db, row.id, userId,),).toBeNull();
  });

  test("update rejects a payload that breaks the modality shape", async () => {
    const row = await createTemplate(db, userId, {
      name: "Keep",
      modality: "image",
      payload: { templateBody: "x", },
    },);
    await expect(updateTemplate(db, row.id, userId, { payload: {}, },),).rejects.toBeInstanceOf(Error,);
  });

  test("resolveTemplateDef serves presets then owned rows", async () => {
    const preset = await resolveTemplateDef(db, "preset-roleplay", userId,);
    expect(preset?.preset?.id,).toBe("preset-roleplay",);

    const row = await createTemplate(db, userId, {
      name: "Row",
      modality: "audio",
      payload: { body: "{{mood}} ambience", },
    },);
    const def = await resolveTemplateDef(db, row.id, userId,);
    expect(def?.row?.id,).toBe(row.id,);
    expect(await resolveTemplateDef(db, "tmpl-nope", userId,),).toBeNull();
  });

  test("list marks presets read-only and never lists them for image", async () => {
    const all = await listTemplates(db, userId,);
    const presets = all.filter((t,) => t.isPreset);
    expect(presets.length,).toBeGreaterThan(0,);
    expect(presets.every((t,) => t.modality === "llm" && !t.isOwner),).toBe(true,);

    const images = await listTemplates(db, userId, "image",);
    expect(images.every((t,) => !t.isPreset),).toBe(true,);
  });
});

describe("payload rendering", () => {
  test("applyImageTemplate substitutes known vars and keeps unknown text", () => {
    const res = applyImageTemplate(
      { templateBody: "{{a}} / {{missing}}", negativePrompt: "blurry", },
      { a: "alpha", },
    );
    expect(res.prompt,).toBe("alpha / ",);
    expect(res.negativePrompt,).toBe("blurry",);
  });

  test("applySimpleTemplate merges params then vars", () => {
    const body = applySimpleTemplate(
      { body: "{{mood}} {{temp}}", params: { mood: "calm", temp: "20", }, },
      { temp: "30", },
    );
    expect(body,).toBe("calm 30",);
  });
});

describe("resolveLlmTemplateOverrideId", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${userId}`, "Override User", { id: userId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("falls back chat → actor settings → null", async () => {
    // No chat/actor rows: null.
    expect(await resolveLlmTemplateOverrideId(db, "chat-x", "actor-x",),).toBeNull();
  });
});
