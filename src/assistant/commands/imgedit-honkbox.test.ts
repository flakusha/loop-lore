// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /imgedit provider selection — the shipped `imageOps` gate decides.
 * Each test file owns its DB, ids and registry entry; no module stubs.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetLinkEntity, AssetType, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { shouldUseHonkbox, } from "../../image-edit/provider-selection";
import { templateRegistry, } from "../../image-edit/template-registry";
import type { ImageEditProvider, WorkflowTemplate, } from "../../image-edit/types";
import { type HonkboxProbeResult, parseHonkboxCapabilities, } from "../../integrations/honkbox";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { imgeditCommandHandler, } from "./imgedit";
import type { CommandContext, } from "./registry";

const USER = `imgedit-hb-user-${crypto.randomUUID()}`;
const CHAT = `imgedit-hb-chat-${crypto.randomUUID()}`;
const ACTOR = `imgedit-hb-actor-${crypto.randomUUID()}`;
const TEMPLATE_ID = `imgedit-hb-template-${crypto.randomUUID()}`;
const MESSAGE = `imgedit-hb-msg-${crypto.randomUUID()}`;
const ASSET = `imgedit-hb-asset-${crypto.randomUUID()}`;

const template: WorkflowTemplate = {
  id: TEMPLATE_ID,
  name: "Honkbox Test Edit",
  description: "gated edit template",
  category: "img2img",
  backends: ["comfyui", "sd-server",],
  required_nodes: [],
  parameters: [
    { name: "prompt", type: "string", label: "Prompt", default: "", required: true, },
    { name: "input_image", type: "image", label: "Input", default: "", required: true, },
  ],
  build: () => ({}),
};

const capsDoc = {
  api_version: "v1",
  server: { name: "honkbox", version: "0.9.0", },
  features: {
    vision: { built: false, models: 0, },
    controlnet: { available: false, models: 0, },
    lora: true,
    video: false,
    jobs: false,
    events: false,
    vad: false,
    experimental_ash_sd: false,
    blender: false,
    artifactDelivery: false,
  },
  formats: {
    read: ["png",],
    write: [],
    limits: { output_compression: { min: 0, max: 100, applies_to: "jpeg", }, body_bytes: 1, },
  },
  auth: { mode: "bearer", },
  queue: { gpuSlots: 1, queueWaitSecs: 1, retryAfterSecs: 1, kinds: [], },
  storage: { dataDirPresent: true, },
  openapi: "/v1/openapi.json",
  models: "/v1/models",
};

/** @param withImageOps - whether the probed server advertises `imageOps`
 * @returns a typed probe result built by the shipped parser
 */
function probe(withImageOps: boolean,): HonkboxProbeResult {
  const parsed = parseHonkboxCapabilities(
    withImageOps ? { ...capsDoc, image_ops: { ops: ["edits",], }, } : capsDoc,
  );

  if (!parsed.ok) { throw new Error("capability fixture rejected",); }
  return { ok: true, capabilities: parsed.capabilities, supported: true, latencyMs: 0, };
}

/** Provider stub that records each execute call. */
function stubProvider(calls: unknown[],): ImageEditProvider {
  return {
    name: "honkbox",
    healthCheck: () => Promise.resolve(true,),
    listCapabilities: () => Promise.resolve(["img2img",],),
    execute: (request,) => {
      calls.push(request,);
      return Promise.resolve([{
        id: `result-${crypto.randomUUID()}`,
        filename: "edit.png",
        url: "/api/v1/assets/edit/raw",
        mimeType: "image/png",
      },],);
    },
  };
}

let fixture: TestDb;
let db: Kysely<DB>;

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  await insertUsers(db, USER, "Honkbox Tester", { id: USER, } as never,);
  await insertActors(db, "Honkbox Speaker", { id: ACTOR, owner_id: USER, } as never,);
  await insertChats(db, "Honkbox Chat", USER, { id: CHAT, } as never,);
  await insertMessages(db, CHAT, ACTOR, MessageRole.User, "with image", { id: MESSAGE, } as never,);
  await insertAssets(
    db,
    USER,
    `${ASSET}.png`,
    "image/png",
    AssetType.Image,
    64,
    `/data/${ASSET}.png`,
    { id: ASSET, } as never,
  );

  await insertAssetLinks(db, ASSET, AssetLinkEntity.Message, MESSAGE,);
  templateRegistry.register(template,);
},);

afterAll(async () => {
  templateRegistry.unregister(TEMPLATE_ID,);
  await destroyTestDb(fixture,);
},);

/** @returns the command context used by dispatchCommand */
function ctx(): CommandContext {
  return {
    chatId: CHAT,
    db,
    userId: USER,
    messages: [{ id: MESSAGE, role: "user", content: "with image", created_at: "2026-01-01T00:00:00Z", },],
  };
}

describe("/imgedit honkbox selection", () => {
  it("uses honkbox when the shipped imageOps gate is enabled", async () => {
    const calls: unknown[] = [];
    const result = await imgeditCommandHandler(
      [TEMPLATE_ID, "make the sky dramatic",],
      ctx(),
      { probe: async () => probe(true,), honkbox: () => stubProvider(calls,), },
    );

    expect(calls.length,).toBe(1,);
    const request = calls[0] as { backend: string; params: Record<string, unknown>; template_id: string };
    expect(request.backend,).toBe("honkbox",);
    expect(request.template_id,).toBe(TEMPLATE_ID,);
    expect(request.params.input_image,).toBe(ASSET,);
    expect(request.params.prompt,).toBe("make the sky dramatic",);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("via honkbox",);
  });

  it("leaves the ComfyUI action unchanged when the gate is disabled", async () => {
    const calls: unknown[] = [];
    const result = await imgeditCommandHandler(
      [TEMPLATE_ID, "make the sky dramatic",],
      ctx(),
      { probe: async () => probe(false,), honkbox: () => stubProvider(calls,), },
    );

    expect(calls.length,).toBe(0,);
    expect(result.action,).toBe("imgedit",);
    expect(result.actionPayload?.backend,).toBe("comfyui",);
    expect(result.actionPayload?.template_id,).toBe(TEMPLATE_ID,);
    expect(result.systemMessage,).toBe(`Starting image edit with template "${template.name}".`,);
  });

  it("refuses templates whose backend or parameters cannot be edited by honkbox", () => {
    const enabled = probe(true,);
    expect(shouldUseHonkbox(enabled, template,),).toBe(true,);
    expect(shouldUseHonkbox(enabled, { ...template, category: "txt2img", },),).toBe(false,);
    expect(shouldUseHonkbox(enabled, { ...template, backends: ["sd-server",], },),).toBe(false,);
    expect(shouldUseHonkbox(undefined, template,),).toBe(false,);
  });
});
