/**
 * E2E regression: chat-settings access guard (Master/GM-only writes).
 *
 * `checkChatSettingsAccess` is the canonical authority for chat-settings
 * mutations. Two clients participate: a chat creator (owner) and a plain
 * member. The owner can rename the chat; the member gets `403 forbidden`.
 * The route under test is `PUT /api/v1/chats/:id`.
 *
 * Companion to `src/chat/service/crud/update.test.ts` (presentation-key
 * online patch + GM-execution 409). This file proves the settings-mutation
 * gate from the wire — the same surface the FE chat-settings modal hits.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { seedChat, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Chat settings access guard (PUT /api/v1/chats/:id)", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await seedChat(server.db,);
    // Authenticated GET re-issues a session-bound CSRF token deterministically
    // (the first unsafe PUT would otherwise race the bootstrap and 403).
    await api.loginAs("e2euser", "password",);
    await api.get("/api/auth/me",);
  },);

  afterAll(() => {
    server.close();
  },);

  test("creator/owner can update chat name (200)", async () => {
    const res = await api.put(`/api/v1/chats/${server.context.chatId}`, { name: "Renamed Chat", },);
    expect(res.ok,).toBe(true,);
    const get = await api.get<{ name: string }>(`/api/v1/chats/${server.context.chatId}`,);
    expect(get.data?.name,).toBe("Renamed Chat",);
  });

  test("non-owner participant is rejected with 403 forbidden", async () => {
    // Add a second participant whose role_in_chat is "member" (NOT owner).
    const memberId = "a0000099-0000-4000-a000-000000000000";
    await server.db
      .insertInto("users",)
      .values({
        id: memberId,
        username: "e2emember",
        display_name: "E2E Member",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await server.db
      .insertInto("actors",)
      .values({
        id: memberId,
        actor_type: "user",
        display_name: "E2E Member",
        user_id: memberId,
        owner_id: memberId,
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
      },)
      .execute();
    await server.db
      .insertInto("chat_participants",)
      .values({
        chat_id: server.context.chatId,
        actor_id: memberId,
        role_in_chat: "member",
      },)
      .execute();

    await api.loginAs("e2emember", "password",);
    const res = await api.put(`/api/v1/chats/${server.context.chatId}`, { name: "Hijack Attempt", },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(403,);
  });

  test("admin role bypasses settings guard (200)", async () => {
    await api.loginAs("e2eadmin", "adminpass",);
    const res = await api.put(`/api/v1/chats/${server.context.chatId}`, {
      name: "Admin Overrode",
    },);
    expect(res.ok,).toBe(true,);
  });

  test("owner can patch presentation-only gmConfig once chat is online (200)", async () => {
    // Move the chat past draft: a confirmed message makes it online.
    await server.db
      .insertInto("messages",)
      .values({
        id: "a0000098-0000-4000-a000-000000000000",
        chat_id: server.context.chatId,
        actor_id: "a0000001-0000-4000-a000-000000000000",
        role: "user",
        content: "hello",
        content_format: "markdown",
        content_type: "text",
        content_encoding: "identity",
        status: "confirmed",
        visibility: "visible",
      },)
      .execute();

    await api.loginAs("e2euser", "password",);
    const res = await api.put(`/api/v1/chats/${server.context.chatId}`, {
      gmConfig: { visualNovel: true, vnLayout: "split", },
    },);
    expect(res.ok,).toBe(true,);
    expect(res.status,).toBe(200,);
  });

  test("owner is rejected with 409 when patching GM-execution keys online", async () => {
    await api.loginAs("e2euser", "password",);
    const res = await api.put(`/api/v1/chats/${server.context.chatId}`, {
      gmConfig: { type: "llm", },
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(409,);
    expect(res.code,).toBe("key_mechanic_conflict",);
  });
});
