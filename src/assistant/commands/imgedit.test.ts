// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /imgedit — registry resolution, error paths and the chat-visible action.
 * Each file owns its in-memory DB and a uniquely named registry entry.
 */
import { afterAll, beforeAll, describe, expect, it, spyOn, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetLinkEntity, AssetType, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { templateRegistry, } from "../../image-edit/template-registry";
import type { WorkflowTemplate, } from "../../image-edit/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import "./imgedit";
import { type CommandContext, type CommandResult, getCommand, } from "./registry";

const USER = `imgedit-user-${crypto.randomUUID()}`;
const CHAT = `imgedit-chat-${crypto.randomUUID()}`;
const ACTOR = `imgedit-actor-${crypto.randomUUID()}`;
const TEMPLATE_ID = `imgedit-template-${crypto.randomUUID()}`;
const MESSAGE_WITH_IMAGE = `imgedit-msg-image-${crypto.randomUUID()}`;
const MESSAGE_WITHOUT_IMAGE = `imgedit-msg-plain-${crypto.randomUUID()}`;

const template: WorkflowTemplate = {
  id: TEMPLATE_ID,
  name: "Test Image To Image",
  description: "test template",
  category: "img2img",
  backends: ["comfyui", "sd-server",],
  required_nodes: [],
  parameters: [
    { name: "prompt", type: "string", label: "Prompt", default: "", required: true, },
    { name: "input_image", type: "image", label: "Input Image", default: "", required: true, },
  ],
  build: () => ({}),
};

let fixture: TestDb;
let db: Kysely<DB>;
let imageAssetId: string;

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  await insertUsers(db, USER, "ImgEdit Tester", { id: USER, } as never,);
  await insertActors(db, "ImgEdit Speaker", { id: ACTOR, owner_id: USER, } as never,);
  await insertChats(db, "ImgEdit Chat", USER, { id: CHAT, } as never,);
  await insertMessages(db, CHAT, ACTOR, MessageRole.User, "plain", { id: MESSAGE_WITHOUT_IMAGE, } as never,);
  await insertMessages(db, CHAT, ACTOR, MessageRole.User, "with image", { id: MESSAGE_WITH_IMAGE, } as never,);

  imageAssetId = crypto.randomUUID();
  await insertAssets(db, USER, `${imageAssetId}.png`, "image/png", AssetType.Image, 64, `/data/${imageAssetId}.png`, {
    id: imageAssetId,
  } as never,);

  await insertAssetLinks(db, imageAssetId, AssetLinkEntity.Message, MESSAGE_WITH_IMAGE,);

  templateRegistry.register(template,);
},);

afterAll(async () => {
  templateRegistry.unregister(TEMPLATE_ID,);
  await destroyTestDb(fixture,);
},);

/** Dispatch through the registry, exactly as dispatchCommand does (single + group). */
function dispatch(args: string[], overrides?: Partial<CommandContext>,): Promise<CommandResult> {
  const handler = getCommand("imgedit",);
  if (!handler) { throw new Error("/imgedit not registered",); }
  const ctx: CommandContext = {
    chatId: CHAT,
    db,
    userId: USER,
    messages: [
      { id: MESSAGE_WITHOUT_IMAGE, role: "user", content: "plain", created_at: "2026-01-01T00:00:00Z", },
      { id: MESSAGE_WITH_IMAGE, role: "user", content: "with image", created_at: "2026-01-01T00:01:00Z", },
    ],
    ...overrides,
  };

  return Promise.resolve(handler(args, ctx,) as CommandResult | Promise<CommandResult>,);
}

describe("/imgedit", () => {
  it("is registered for dispatchCommand (single and group chat)", () => {
    expect(getCommand("imgedit",),).toBeDefined();
  });

  it("returns usage for empty args", async () => {
    const result = await dispatch([],);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /imgedit <template>",);
  });

  it("resolves the template through the registry and returns the chat action payload", async () => {
    const get = spyOn(templateRegistry, "get",);
    try {
      const result = await dispatch([TEMPLATE_ID, "make", "the", "sky", "dramatic",],);

      expect(get,).toHaveBeenCalledWith(TEMPLATE_ID,);
      expect(result.handled,).toBe(true,);
      expect(result.action,).toBe("imgedit",);
      expect(result.systemMessage,).toContain("Starting image edit",);
      expect(result.actionPayload,).toEqual({
        template_id: TEMPLATE_ID,
        backend: "comfyui",
        params: { prompt: "make the sky dramatic", input_image: imageAssetId, },
        chatId: CHAT,
        messageId: MESSAGE_WITH_IMAGE,
      },);
    } finally {
      get.mockRestore();
    }
  });

  it("reports an unknown template without an action or side effect", async () => {
    const unknown = `missing-${crypto.randomUUID()}`;
    const result = await dispatch([unknown, "prompt",],);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
    expect(result.actionPayload,).toBeUndefined();
    expect(result.systemMessage,).toContain("Unknown image-edit template",);
    expect(result.systemMessage,).toContain(unknown,);
  });

  it("reports a missing input image without an action", async () => {
    const result = await dispatch([TEMPLATE_ID, "prompt",], {
      messages: [
        { id: MESSAGE_WITHOUT_IMAGE, role: "user", content: "plain", created_at: "2026-01-01T00:00:00Z", },
      ],
    },);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("No input image found",);
  });

  it("reports a missing database without an action", async () => {
    const result = await dispatch([TEMPLATE_ID, "prompt",], { db: undefined, },);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("missing database",);
  });
});
