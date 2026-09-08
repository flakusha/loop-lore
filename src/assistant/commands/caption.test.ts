// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /caption command tests — target resolution and caption generation wiring
 * against an in-memory database with a stubbed captioning provider.
 *
 * The command delegates to generation/caption-route.ts, which resolves the
 * global database and model roles; setTestDatabase() points that global at
 * the in-memory DB and a "mock" provider is registered in the registry.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetLinkEntity, AssetType, MessageRole, ModelRole, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { getProvider, registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChats,
  insertMessages,
  insertModelRoleOverrides,
  insertUsers,
} from "../../test-utils/insert-helpers";
import "./caption";
import { type CommandContext, type CommandResult, getCommand, } from "./registry";

// Bun's mock.module is process-global and cannot be unmocked: under
// `bun run` an earlier file (e.g. admin/provider-health.test.ts) may have
// replaced the provider registry with fakes lacking register/unregister,
// so the "mock" provider below never registers and captioning silently
// no-ops. Sentinel roundtrip; skip instead of asserting against the stub
// (pristine-module guard; see generation/providers/registry.test.ts).
const REGISTRY_PROBE_PROVIDER = "__caption_pristine_probe__";
const registryPristine = (() => {
  try {
    if (typeof registerProvider !== "function" || typeof unregisterProvider !== "function") { return false; }
    registerProvider(REGISTRY_PROBE_PROVIDER, { label: "probe", } as never,);
    const hit = getProvider(REGISTRY_PROBE_PROVIDER,) !== undefined;
    unregisterProvider(REGISTRY_PROBE_PROVIDER,);
    return hit;
  } catch {
    return false;
  }
})();
const describeReal = registryPristine ? describe : describe.skip;

let db: Kysely<DB>;

const USER = "caption-user";

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
  setTestDatabase(db,);
  await insertUsers(db, "caption-tester", "Caption Tester", { id: USER, password_hash: "hash", } as never,);
  await insertUsers(db, "other-user", "Other User", { id: "some-other-user", password_hash: "hash", } as never,);
  await insertActors(db, "Caption Speaker", { id: "caption-actor", owner_id: USER, } as never,);
  // Role override so the route resolves the mock provider deterministically.
  await insertModelRoleOverrides(db, "mock", "mock-caption-model", { role: ModelRole.Captioning, } as never,);
  registerProvider("mock", makeStubProvider('"  A towering castle at dusk.  "',),);
},);

afterAll(() => {
  setTestDatabase(null,);
},);

/** Build a stub LLM provider whose caption is fixed at construction time. */
function makeStubProvider(caption: string,): LLMProvider {
  const response = (): GenerateResponse => ({
    content: caption,
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
  });
  return {
    capabilities: {
      type: "openai-compatible",
      label: "Stub",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (_req: GenerateRequest,) => response(),
    stream: async (_req: GenerateRequest, _handler: never,) => response(),
    healthCheck: async () => ({ status: "ok", model: "mock-caption-model", }),
    listModels: async () => [],
  };
}

/** Resolve the registered /caption handler. */
function captionHandler(): (args: string[], ctx: CommandContext,) => Promise<CommandResult> {
  const handler = getCommand("caption",);
  if (!handler) { throw new Error("/caption not registered",); }
  return handler as (args: string[], ctx: CommandContext,) => Promise<CommandResult>;
}

function ctxFor(overrides?: Partial<CommandContext>,): CommandContext {
  return { chatId: "chat-1", db, userId: USER, ...overrides, };
}

/** Seed chat + message and return the message id. */
let chatSeeded = false;
async function seedMessage(messageId: string,): Promise<string> {
  if (!chatSeeded) {
    await insertChats(db, "Caption Chat", USER, { id: "chat-1", } as never,);
    chatSeeded = true;
  }
  await insertMessages(db, "chat-1", "caption-actor", MessageRole.User, "look at this", { id: messageId, } as never,);
  return messageId;
}

/** Seed an image asset linked to a message. */
async function seedImageAsset(messageId: string, ownerId?: string,): Promise<string> {
  const assetId = crypto.randomUUID();
  await insertAssets(db, ownerId ?? USER, `${assetId}.png`, "image/png", AssetType.Image, 64, `/data/${assetId}.png`, {
    id: assetId,
  } as never,);
  await insertAssetLinks(db, assetId, AssetLinkEntity.Message, messageId,);
  return assetId;
}

describeReal("/caption", () => {
  it("reports a missing database context", async () => {
    const result = await captionHandler()([], ctxFor({ db: undefined, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Caption unavailable:** command context missing database.",);
  });

  it("reports when no message carries an image (target: last)", async () => {
    await seedMessage(crypto.randomUUID(),);
    const result = await captionHandler()([], ctxFor(),);
    expect(result.systemMessage,).toContain("No image found to caption.",);
    expect(result.action,).toBeUndefined();
  });

  it("reports when an explicit message id has no image assets", async () => {
    const messageId = await seedMessage(crypto.randomUUID(),);
    const result = await captionHandler()([messageId,], ctxFor(),);
    expect(result.systemMessage,).toBe(`No image assets found for message ${messageId}.`,);
  });

  it("finds the latest image-bearing message via the reversed scan", async () => {
    await seedMessage("msg-no-image",);
    const withImage = "msg-with-image";
    await insertMessages(
      db,
      "chat-1",
      "caption-actor",
      MessageRole.Assistant,
      "an image",
      { id: withImage, } as never,
    );
    await seedImageAsset(withImage,);

    const result = await captionHandler()(
      [],
      ctxFor({
        messages: [
          { id: "msg-no-image", role: "user", content: "text only", created_at: new Date().toISOString(), },
          { id: withImage, role: "assistant", content: "an image", created_at: new Date().toISOString(), },
        ],
      },),
    );

    expect(result.action,).toBe("caption-image",);
    expect(result.systemMessage,).toContain("**Image captions:**",);
    expect(result.systemMessage,).toContain("A towering castle at dusk.",);
    const payload = result.actionPayload as { messageId: string; assetIds: string[] };
    expect(payload.messageId,).toBe(withImage,);
    expect(payload.assetIds,).toHaveLength(1,);
  });

  it("persists the cleaned caption as asset alt text", async () => {
    const messageId = crypto.randomUUID();
    await seedMessage(messageId,);
    const assetId = await seedImageAsset(messageId,);

    const result = await captionHandler()(
      [messageId,],
      ctxFor({
        messages: [{ id: messageId, role: "user", content: "x", created_at: new Date().toISOString(), },],
      },),
    );

    expect(result.handled,).toBe(true,);
    const row = await db.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirstOrThrow();
    expect(row.alt_text,).toBe("A towering castle at dusk.",);
  });

  it("surfaces route errors (missing user) as a failure message", async () => {
    const messageId = crypto.randomUUID();
    await seedMessage(messageId,);
    await seedImageAsset(messageId,);

    const result = await captionHandler()([messageId,], ctxFor({ userId: undefined, },),);
    expect(result.systemMessage,).toContain("**Caption generation failed:**",);
    expect(result.systemMessage,).toContain("Authentication required",);
  });

  it("reports images owned by others as uncaptionable", async () => {
    const messageId = crypto.randomUUID();
    await seedMessage(messageId,);
    await seedImageAsset(messageId, "some-other-user",);

    const result = await captionHandler()(
      [messageId,],
      ctxFor({
        messages: [{ id: messageId, role: "user", content: "x", created_at: new Date().toISOString(), },],
      },),
    );

    expect(result.systemMessage,).toBe("No captions could be generated for the image.",);
  });
},);
