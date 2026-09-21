// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { type Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { exportChatRoute, } from "./export-route";

let dbHandle: TestDb;
let database: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  dbHandle = await createTestDb();
  database = dbHandle.db;
},);

afterAll(async () => {
  if (dbHandle?.sqlite) { dbHandle.sqlite.close(); }
},);

beforeEach(async () => {
  await database.deleteFrom("messages",).execute();
  await database.deleteFrom("chat_participants",).execute();
  await database.deleteFrom("chats",).execute();
  await database.deleteFrom("actors",).execute();
  await database.deleteFrom("users",).execute();
},);

async function seedChatWithMessage(content: string,): Promise<string> {
  await insertUsers(database, "u-owner", "Owner", { id: "u-owner", } as never,);
  await insertActors(database, "u-owner", {
    id: "u-owner",
    user_id: "u-owner",
    owner_id: "u-owner",
  } as never,);
  await insertChats(database, "Test Chat", "u-owner", {
    id: "chat-1",
    type: "group",
    mode: "group",
  } as never,);
  await insertChatParticipants(database, "chat-1", "u-owner", {
    role_in_chat: "owner",
  } as never,);
  await insertMessages(database, "chat-1", "u-owner", MessageRole.User, content, {
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
  } as never,);
  return "chat-1";
}

function makeApp(
  config: {
    generation?: { regexTransforms?: { name?: string; pattern: string; replacement: string; enabled?: boolean }[] };
  },
) {
  const app = new Elysia({ name: "test-export", },);
  app.derive(() => ({ userId: "u-owner", userRole: null, }));
  return app.use(exportChatRoute({ database, config: config as never, }, "/api",),);
}

describe("exportChatRoute - regex transforms at render time", () => {
  test("applies regexTransforms to exported content", async () => {
    await seedChatWithMessage("Hello SECRET world",);
    const app = makeApp({
      generation: { regexTransforms: [{ name: "t1", pattern: "SECRET", replacement: "PUBLIC", enabled: true, },], },
    },);
    const res = await app.handle(new Request("http://localhost/api/chats/chat-1/export?format=markdown",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("Hello PUBLIC world",);
    expect(body,).not.toContain("SECRET",);
  });

  test("uses empty transform list when config.generation is missing", async () => {
    await seedChatWithMessage("untouched SECRET",);
    const app = makeApp({},);
    const res = await app.handle(new Request("http://localhost/api/chats/chat-1/export?format=markdown",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("untouched SECRET",);
  });

  test("rejects unauthenticated requests", async () => {
    const app = new Elysia({ name: "test-export-auth", },).use(
      exportChatRoute({ database, config: {} as never, }, "/api",),
    );
    const res = await app.handle(new Request("http://localhost/api/chats/chat-1/export",),);
    expect(res.status,).toBe(401,);
  });

  test("exports JSON when format=json", async () => {
    await seedChatWithMessage("hello-json",);
    const app = makeApp({},);
    const res = await app.handle(new Request("http://localhost/api/chats/chat-1/export?format=json",),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/json",);
    const body = await res.text();
    expect(body,).toContain("hello-json",);
  });

  test("exports HTML when format=html", async () => {
    await seedChatWithMessage("hi",);
    const app = makeApp({},);
    const res = await app.handle(new Request("http://localhost/api/chats/chat-1/export?format=html",),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/html",);
  });

  test("exports plain text when format=text", async () => {
    await seedChatWithMessage("hi",);
    const app = makeApp({},);
    const res = await app.handle(new Request("http://localhost/api/chats/chat-1/export?format=text",),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/plain",);
  });
});
