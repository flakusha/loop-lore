// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { promptTemplateRoutes, } from "./prompt-template";

const mockConfig: Partial<Config> = { templates: { llm: undefined, }, };

function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",) {
  return new Elysia({ name: "test-prompt-template", },)
    .derive(() => ({ userId, userRole, }))
    .use(promptTemplateRoutes({ database: db, config: mockConfig as Config, },),);
}

interface PromptBody {
  purpose: string;
  prompt: string;
  source: "character" | "registry";
  characterName: string | null;
  registryDefault: string;
  override: string | null;
  usingOverride: boolean;
}

/**
 * Seed a user with a matching actor row (id = userId) so the FK from
 * chat_participants.actor_id → actors.id is satisfied and the user
 * can be added as a participant.
 */
async function seedUserWithActor(
  db: Kysely<DB>,
  displayName = "Test User",
): Promise<string> {
  const userId = uid();
  await insertUsers(db, `u-${userId}`, displayName, { id: userId, } as never,);
  await insertActors(db, `${displayName} Actor`, {
    id: userId,
    user_id: userId,
    owner_id: userId,
    actor_type: "user",
  } as never,);
  return userId;
}

describe("promptTemplateRoutes — GET /api/chats/:id/prompt-template", () => {
  test("401 when no userId is derived", async () => {
    const { db, } = await createTestDb();
    const ownerId = await seedUserWithActor(db, "Owner",);
    const chatId = uid();
    await insertChats(db, "Test Chat", ownerId, { id: chatId, } as never,);

    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(401,);

    await db.destroy();
  });

  test("404 when chat does not exist (checkChatAccess rejects)", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const app = makeApp(db, await seedUserWithActor(db,),);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/prompt-template`,),
    );
    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("404 when chat exists but requester has no access", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const ownerId = await seedUserWithActor(db, "Owner",);
    const outsiderId = await seedUserWithActor(db, "Outsider",);
    const chatId = uid();
    await insertChats(db, "Private", ownerId, { id: chatId, } as never,);

    const app = makeApp(db, outsiderId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("falls back to registry default when chat has no character participant", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    await insertChats(db, "Empty Chat", userId, {
      id: chatId,
      mode: "story",
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.source,).toBe("registry",);
    expect(body.characterName,).toBeNull();
    expect(body.prompt,).toBe(body.registryDefault,);
    expect(body.purpose,).toBe("chat",);
    expect(body.override,).toBeNull();
    expect(body.usingOverride,).toBe(false,);

    await db.destroy();
  });

  test("purpose='gm' when mode=story and assistantRole=gm", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db, "GM",);
    const chatId = uid();
    await insertChats(db, "Story Chat", userId, {
      id: chatId,
      mode: "story",
      gm_config: JSON.stringify({ assistantRole: "gm", },),
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.purpose,).toBe("gm",);

    await db.destroy();
  });

  test("purpose='chat' when mode is non-story regardless of assistantRole", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    await insertChats(db, "Group", userId, {
      id: chatId,
      mode: "group",
      gm_config: JSON.stringify({ assistantRole: "gm", },),
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.purpose,).toBe("chat",);

    await db.destroy();
  });

  test("default mode='story' applied when chat.mode is null", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    await insertChats(db, "Null Mode", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    // mode defaults to "story"; no assistantRole → purpose=chat
    expect(body.purpose,).toBe("chat",);

    await db.destroy();
  });

  test("invalid gm_config JSON is tolerated (defaults to {})", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    await insertChats(db, "Chat", userId, {
      id: chatId,
      mode: "story",
      gm_config: "{not valid json",
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.purpose,).toBe("chat",);

    await db.destroy();
  });

  test("config-override prompt replaces registry default for purpose", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    await insertChats(db, "Chat", userId, {
      id: chatId,
      mode: "story",
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const configWithOverride: Partial<Config> = {
      templates: { llm: { systemPrompts: { chat: "CUSTOM_OVERRIDE", gm: "CUSTOM_GM", }, }, },
    };
    const app = new Elysia()
      .derive(() => ({ userId, userRole: "user", }))
      .use(promptTemplateRoutes({ database: db, config: configWithOverride as Config, },),);

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.prompt,).toBe("CUSTOM_OVERRIDE",);
    expect(body.registryDefault,).toBe("CUSTOM_OVERRIDE",);

    await db.destroy();
  });

  test("non-character actor_type participants do not change the source", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const userActorId = uid();
    const chatId = uid();
    await insertActors(db, "User Actor", {
      id: userActorId,
      system_prompt: "USER_ACTOR_PROMPT",
      actor_type: "user",
    } as never,);
    await insertChats(db, "Chat", userId, {
      id: chatId,
      mode: "story",
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);
    await insertChatParticipants(db, chatId, userActorId, {
      role_in_chat: "member" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.source,).toBe("registry",);

    await db.destroy();
  });

  test("prompt_override on chat is surfaced in response", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    await insertChats(db, "Chat", userId, {
      id: chatId,
      mode: "story",
      prompt_override: "OVERRIDE_TEXT",
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    // Handler exposes override and usingOverride but doesn't substitute it into prompt
    expect(body.override,).toBe("OVERRIDE_TEXT",);
    expect(body.usingOverride,).toBe(true,);

    await db.destroy();
  });

  test("purpose='gm' matches with assistantRole only (no need for character)", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUserWithActor(db,);
    const chatId = uid();
    // No character participant — handler must still resolve purpose from gm_config
    await insertChats(db, "GM Chat", userId, {
      id: chatId,
      mode: "story",
      gm_config: JSON.stringify({ assistantRole: "gm", },),
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: "owner" as never,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/prompt-template`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as PromptBody;
    expect(body.purpose,).toBe("gm",);
    // No character participant → registry default
    expect(body.source,).toBe("registry",);

    await db.destroy();
  });
});
