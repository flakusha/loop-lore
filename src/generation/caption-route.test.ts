// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for caption-route.ts — auth, validation, chat authorization, provider
 * failure isolation, the ownership rule for foreign assets, and the caption
 * pipeline against a registered stub provider.
 *
 * Follows the prompt-route.test.ts isolation pattern: mock.module for
 * config/load is registered only under `--isolate` (the canonical check gate)
 * and skipped in shared-process runs. The dynamic import is required because
 * mock.module must be registered BEFORE the SUT module is evaluated.
 */
import { afterAll, beforeAll, expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import * as realConfigLoad from "../config/load";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import type * as captionRoute from "./caption-route";

const PROVIDER = "mock-caption";
const MODEL = "mock-vision-model";

// Mutable config holder — tests point loadConfig() at a per-test config.
let testConfigOverride: Record<string, unknown> | undefined;
let stubContent = "A red door.";
let stubThrows = false;
let lastRequest: GenerateRequest | undefined;
let handleImageCaption: typeof captionRoute.handleImageCaption;

if (ISOLATED) {
  mock.module("../config/load", () => ({
    ...realConfigLoad,
    // Merge test overrides over full schema defaults: a bare override drops
    // required sections (server, db, auth, byoKey) for later files.
    loadConfig: () => ({
      ...structuredClone(createConfigSchema().defaults,),
      ...(testConfigOverride ?? {}),
    }),
  }),);

  // Dynamic import on purpose: mock.module must be registered before the SUT
  // module is evaluated (test module-loading boundary; see header comment).
  ({ handleImageCaption, } = await import("./caption-route"));
}

/** Build a stub LLM provider that records the request it was handed. */
function makeStubProvider(): LLMProvider {
  const response = (): GenerateResponse => ({
    content: stubContent,
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
  });

  return {
    capabilities: {
      type: "openai-compatible",
      label: "Stub",
      text: true,
      image: true,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (req: GenerateRequest,) => {
      lastRequest = req;
      if (stubThrows) { throw new Error("provider exploded",); }
      return response();
    },
    stream: async (_req: GenerateRequest, _handler: never,) => response(),
    healthCheck: async () => ({ status: "ok", model: MODEL, }),
    listModels: async () => [],
  };
}

describeOrSkip("caption route", () => {
  let db: Kysely<DB>;
  let setTestDatabase: (db: Kysely<DB> | null,) => void;
  let registerProvider: (name: string, provider: LLMProvider,) => void;
  let unregisterProvider: (name: string,) => void;
  let insertModelRoleOverrides: typeof import("../test-utils/insert-helpers").insertModelRoleOverrides;
  let insertAssets: typeof import("../test-utils/insert-helpers").insertAssets;
  let insertUsers: typeof import("../test-utils/insert-helpers").insertUsers;
  let ModelRole: typeof import("../db/enums").ModelRole;

  const OWNER = "caption-owner";
  let ownAsset = "";
  let foreignAsset = "";

  beforeAll(async () => {
    // Dynamic imports on purpose: the ISOLATED module registry is only active
    // under --isolate, and static imports would evaluate the SUT too early.
    const [{ createTestDb, }, { setTestDatabase: setDb, }, registry, helpers, enums,] = await Promise.all([
      import("../test-utils/create-test-db"),
      import("../db/index"),
      import("../generation/providers/registry"),
      import("../test-utils/insert-helpers"),
      import("../db/enums"),
    ],);

    const testDb = await createTestDb();
    db = testDb.db;
    setTestDatabase = setDb as typeof setTestDatabase;
    registerProvider = registry.registerProvider as typeof registerProvider;
    unregisterProvider = registry.unregisterProvider as typeof unregisterProvider;
    insertModelRoleOverrides = helpers.insertModelRoleOverrides;
    insertAssets = helpers.insertAssets;
    insertUsers = helpers.insertUsers;
    ModelRole = enums.ModelRole;
    setTestDatabase(db,);

    await insertUsers(db, OWNER, "Caption Owner", { id: OWNER as never, },);
    await insertUsers(db, "caption-other", "Other", { id: "caption-other" as never, },);
    ownAsset = await insertAssets(db, OWNER, "door.png", "image/png", "image", 3, "uploads/door.png", {
      id: "123e4567-e89b-12d3-a456-4266141740a1" as never,
    },);

    foreignAsset = await insertAssets(
      db,
      "caption-other",
      "secret.png",
      "image/png",
      "image",
      3,
      "uploads/secret.png",
      { id: "123e4567-e89b-12d3-a456-4266141740a2" as never, },
    );

    await insertModelRoleOverrides(db, PROVIDER, MODEL, { role: ModelRole.Captioning, },);
    registerProvider(PROVIDER, makeStubProvider(),);
  },);

  afterAll(() => {
    unregisterProvider(PROVIDER,);
    setTestDatabase(null,);
  },);

  it("requires authentication", async () => {
    const res = await handleImageCaption({ assetIds: [ownAsset,], }, db, undefined, null,);
    expect(res.status,).toBe(401,);
  });

  it("rejects an empty assetIds list", async () => {
    const res = await handleImageCaption({ assetIds: [], }, db, OWNER, "user",);
    expect(res.status,).toBe(400,);

    const missing = await handleImageCaption({}, db, OWNER, "user",);
    expect(missing.status,).toBe(400,);
  });

  it("returns 403 for a chat the caller cannot access", async () => {
    const res = await handleImageCaption(
      { assetIds: [ownAsset,], chatId: "no-such-chat", },
      db,
      OWNER,
      "user",
    );

    expect(res.status,).toBe(403,);
  });

  it("returns 503 when no captioning model is configured", async () => {
    unregisterProvider(PROVIDER,);
    const res = await handleImageCaption({ assetIds: [ownAsset,], }, db, OWNER, "user",);
    expect(res.status,).toBe(503,);
    registerProvider(PROVIDER, makeStubProvider(),);
  });

  it("captions an owned asset and persists the alt text", async () => {
    stubContent = "A red door.";
    const res = await handleImageCaption({ assetIds: [ownAsset,], }, db, OWNER, "user",);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { assetId: string; caption: string }[] };
    expect(body.data,).toEqual([{ assetId: ownAsset, caption: "A red door.", },],);

    const row = await db
      .selectFrom("assets",)
      .select("alt_text",)
      .where("id", "=", ownAsset,)
      .executeTakeFirst();

    expect(row?.alt_text,).toBe("A red door.",);
  });

  it("strips quotes and tags and truncates the stored caption", async () => {
    const padding = "x".repeat(600,);
    stubContent = '"<b>Bold</b> caption' + padding + '"';
    const res = await handleImageCaption({ assetIds: [ownAsset,], }, db, OWNER, "user",);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { assetId: string; caption: string }[] };
    const caption = body.data[0]?.caption ?? "";
    // The sanitizer drops the <...> markup but keeps the inner text, and
    // strips only the outer quote pair — so "Bold" survives, the angle
    // brackets and wrapping quotes do not.
    expect(caption,).not.toContain("<",);
    expect(caption.startsWith('"',),).toBe(false,);
    expect(caption.endsWith('"',),).toBe(false,);
    expect(caption.length,).toBeLessThanOrEqual(500,);
    expect(caption,).toBe("Bold caption" + "x".repeat(488,),);
  });

  it("never reads or overwrites a foreign asset", async () => {
    await db.updateTable("assets",).set({ alt_text: "original", },).where("id", "=", foreignAsset,).execute();

    const res = await handleImageCaption({ assetIds: [foreignAsset,], }, db, OWNER, "user",);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { assetId: string; caption: string }[] };
    expect(body.data,).toEqual([{ assetId: foreignAsset, caption: "", },],);

    const row = await db
      .selectFrom("assets",)
      .select("alt_text",)
      .where("id", "=", foreignAsset,)
      .executeTakeFirst();

    expect(row?.alt_text,).toBe("original",);
  });

  it("returns an empty caption for an unknown asset id", async () => {
    const res = await handleImageCaption(
      { assetIds: ["123e4567-e89b-12d3-a456-4266141740ff",], },
      db,
      OWNER,
      "user",
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { caption: string }[] };
    expect(body.data[0]?.caption,).toBe("",);
  });

  it("isolates a provider failure to that asset", async () => {
    stubThrows = true;
    const res = await handleImageCaption({ assetIds: [ownAsset,], }, db, OWNER, "user",);
    stubThrows = false;

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { caption: string }[] };
    expect(body.data[0]?.caption,).toBe("",);
  });

  it("caps the batch at MAX_CAPTION_BATCH assets", async () => {
    const ids = Array.from(
      { length: 8, },
      (_, i,) => `123e4567-e89b-12d3-a456-4266141741${String(i,).padStart(2, "0",)}`,
    );

    const res = await handleImageCaption({ assetIds: ids, }, db, OWNER, "user",);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[] };
    expect(body.data.length,).toBe(5,);
  });

  it("builds a system + user caption prompt for the resolved model", async () => {
    // storage_path points at a file that does not exist, so the image reader
    // throws and readCaptionImages degrades to undefined — captioning still
    // succeeds, which is the contract being pinned.
    lastRequest = undefined;
    const res = await handleImageCaption({ assetIds: [ownAsset,], }, db, OWNER, "user",);

    expect(res.status,).toBe(200,);
    const sent = lastRequest as GenerateRequest | undefined;
    expect(sent?.model,).toBe(MODEL,);
    expect(sent?.messages.some((m,) => m.role === "system"),).toBe(true,);
    expect(sent?.messages.some((m,) => m.role === "user"),).toBe(true,);
  });
},);
