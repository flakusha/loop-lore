// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for POST /api/v1/generation/audio: auth, chat ownership (IDOR),
 * request validation, and the success path (provider dispatch + asset
 * persistence).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { handleAudioGeneration, } from "./audio-prompt-route";
import type { AudioProvider, } from "./audio/types";
import { registerAudioProvider, unregisterAudioProvider, } from "./audio/types";

/** Fake provider so the success path runs without a ComfyUI server. */
const fakeProvider: AudioProvider = {
  id: "test:fake",
  async generate(request,) {
    return { ok: true, buffer: Buffer.from(`fake-audio:${request.prompt}`,), mimeType: "audio/wav", };
  },
};

describe("handleAudioGeneration", () => {
  let db: Kysely<DB>;
  let ownerId = "";
  let chatId = "";
  let strangerId = "";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    registerAudioProvider(fakeProvider,);
    ({ db, } = await createTestDb());

    ownerId = uid();
    strangerId = uid();
    chatId = uid();

    await insertUsers(db, `${ownerId}-user`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `${strangerId}-user`, "Stranger", { id: strangerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
    await insertChats(db, "Audio Chat", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
  },);

  afterAll(async () => {
    unregisterAudioProvider(fakeProvider.id,);
    await db.destroy();
  },);

  test("401s an unauthenticated caller before touching the database", async () => {
    const res = await handleAudioGeneration({ prompt: "thunder", }, db, undefined,);
    expect(res.status,).toBe(401,);
  });

  test("400s on an empty or over-long prompt", async () => {
    expect((await handleAudioGeneration({ prompt: "   ", }, db, ownerId,)).status,).toBe(400,);
    expect((await handleAudioGeneration({ prompt: "x".repeat(2_001,), }, db, ownerId,)).status,).toBe(400,);
  });

  test("400s on out-of-range seconds", async () => {
    expect((await handleAudioGeneration({ prompt: "thunder", seconds: 0, }, db, ownerId,)).status,).toBe(400,);
    expect((await handleAudioGeneration({ prompt: "thunder", seconds: 9_999, }, db, ownerId,)).status,).toBe(400,);
  });

  test("403s when the caller has no access to the linked chat", async () => {
    const res = await handleAudioGeneration({ prompt: "thunder", chatId, }, db, strangerId,);
    expect(res.status,).toBe(403,);
  });

  test("400s for an unknown provider id after passing validation", async () => {
    const res = await handleAudioGeneration({ prompt: "thunder", provider: "nope", }, db, ownerId,);
    expect(res.status,).toBe(400,);
  });

  test("501s when no operator-configured audio provider is available", async () => {
    const res = await handleAudioGeneration({ prompt: "thunder", }, db, ownerId,);
    expect(res.status,).toBe(501,);
  });

  test("generates a track and stores it as a chat-linked audio asset", async () => {
    const res = await handleAudioGeneration(
      { prompt: "rain on a window", chatId, seconds: 2, provider: fakeProvider.id, },
      db,
      ownerId,
    );

    expect(res.status,).toBe(200,);

    const body = await res.json() as {
      data: { id: string; url: string; filename: string; seconds: number; provider?: string };
    };

    expect(body.data.id,).toBeTruthy();
    expect(body.data.seconds,).toBe(2,);
    expect(body.data.url,).toContain(body.data.id,);
    expect(body.data.provider,).toBe(fakeProvider.id,);

    const links = await db
      .selectFrom("asset_links",)
      .select(["entity_type", "entity_id",],)
      .where("asset_id", "=", body.data.id,)
      .execute();

    expect(links.some((l,) => l.entity_type === "chat" && l.entity_id === chatId),).toBe(true,);
  });
});
