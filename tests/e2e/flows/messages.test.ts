/**
 * E2E: Message Flows
 *
 * Tests message CRUD within a chat: list, create, get, delete.
 * Requires seeded chat.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedAll, SEED } from "../helpers/seed";

describe("Messages E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db); // seed users, character, chat, message
    await server.db
      .insertInto("users")
      .values({
        id: "00000000-0000-4000-b000-000000000099",
        username: "e2eother",
        display_name: "E2E Other User",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      })
      .execute();
    api = createClient(server.url);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });
  test("GET /api/chats/:id/messages returns messages", async () => {
    const res = await api.get<{ data: Array<{ id: string; content: string }> }>(
      `/api/chats/${SEED.chat.id}/messages`,
    );
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data!.data)).toBe(true);
    expect(res.data!.data.length).toBeGreaterThanOrEqual(1);
  });

  test("POST /api/chats/:id/messages creates a new message", async () => {
    const res = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: "New E2E message",
      role: "user",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

test("POST /api/chats/:id/messages requires content", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, { role: "user" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
  });

  test("GET /api/messages/:id returns single message", async () => {
    const res = await api.get<{ id: string; content: string }>(`/api/messages/${SEED.message.id}`);
    expect(res.ok).toBe(true);
    expect(res.data!.content).toBe(SEED.message.content);
  });

  test("DELETE /api/messages/:id soft-deletes message", async () => {
    // Create a message first
    const createRes = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: "Message to delete",
      role: "user",
    });
    const msgId = createRes.data!.id;

    const deleteRes = await api.del(`/api/messages/${msgId}`);
    expect(deleteRes.ok).toBe(true);

    // GET should still return it (soft-delete)
    const getRes = await api.get<{ visibility: string }>(`/api/messages/${msgId}`);
    expect(getRes.ok).toBe(true);
    expect(getRes.data!.visibility).toBe("hidden_by_user");
  });

  test("GET /api/messages/:id returns 404 for non-existent", async () => {
    const res = await api.get("/api/messages/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.code).toBeTruthy(); // TEST.2 error envelope
  });

  test("cross-tenant isolation: User B cannot access User A's message", async () => {
    const resA = await api.get<{ id: string }>(`/api/messages/${SEED.message.id}`);
    expect(resA.ok).toBe(true);
    expect(resA.data!.id).toBe(SEED.message.id);

    const apiB = createClient(server.url);
    await apiB.loginAs("e2eother", "password");
    const resB = await apiB.get(`/api/messages/${SEED.message.id}`);
    expect(resB.ok).toBe(false);
    expect(resB.status).toBe(404);
    expect(resB.code).toBeTruthy();
  });
});
