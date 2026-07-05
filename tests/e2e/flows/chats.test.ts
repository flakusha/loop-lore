/**
 * E2E: Chat Flows
 *
 * Tests chat CRUD: list, create, get, update, delete.
 * Requires seeded user in the database.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, seedChat, SEED } from "../helpers/seed";

describe("Chats E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url);
  });

  afterAll(() => {
    server.close();
  });
  test("GET /api/chats returns empty list when no chats", async () => {
    await api.login();
    const res = await api.get<{ data: [] }>("/api/chats");
    expect(res.ok).toBe(true);
    expect(res.data).toBeTruthy();
    expect(Array.isArray(res.data!.data)).toBe(true);
  });

  test("POST /api/chats creates a new chat", async () => {
    await api.login();
    const res = await api.post<{ id: string }>("/api/chats", {
      name: "Created Chat",
      type: "direct",
      mode: "direct",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("GET /api/chats returns created chat in list", async () => {
    await api.login();
    const res = await api.get<{ data: Array<{ id: string; name: string }> }>("/api/chats");
    expect(res.ok).toBe(true);
    const chats = res.data!.data;
    expect(chats.length).toBeGreaterThanOrEqual(1);
    expect(chats.some((c) => c.name === "Created Chat")).toBe(true);
  });

  test("POST /api/chats requires name", async () => {
    await api.login();
    const res = await api.post("/api/chats", { type: "direct" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  test("GET /api/chats/:id returns single chat", async () => {
    await api.login();
    // Create a chat first
    const createRes = await api.post<{ id: string }>("/api/chats", {
      name: "Single Chat",
      type: "direct",
      mode: "direct",
    });
    expect(createRes.ok).toBe(true);
    const chatId = createRes.data!.id;

    const res = await api.get(`/api/chats/${chatId}`);
    expect(res.ok).toBe(true);
    const chat = res.data as Record<string, unknown>;
    expect(chat.name).toBe("Single Chat");
  });

  test("PUT /api/chats/:id updates chat name", async () => {
    await api.login();
    const createRes = await api.post<{ id: string }>("/api/chats", {
      name: "Old Name",
      type: "direct",
    });
    const chatId = createRes.data!.id;

    const updateRes = await api.put(`/api/chats/${chatId}`, { name: "Updated Name" });
    expect(updateRes.ok).toBe(true);

    const getRes = await api.get<Record<string, unknown>>(`/api/chats/${chatId}`);
    expect(getRes.data!.name).toBe("Updated Name");
  });

  test("DELETE /api/chats/:id deletes chat", async () => {
    await api.login();
    const createRes = await api.post<{ id: string }>("/api/chats", {
      name: "To Delete",
      type: "direct",
    });
    const chatId = createRes.data!.id;

    const deleteRes = await api.del(`/api/chats/${chatId}`);
    expect(deleteRes.ok).toBe(true);

    const getRes = await api.get(`/api/chats/${chatId}`);
    expect(getRes.status).toBe(404);
  });

  test("seeded chat is accessible", async () => {
  await seedUsers(server.db);
  await seedChat(server.db);
  await api.loginAs(SEED.user.username, SEED.user.password);

    const res = await api.get<Record<string, unknown>>(`/api/chats/${SEED.chat.id}`);
    expect(res.ok).toBe(true);
    expect(res.data!.name).toBe(SEED.chat.name);
  });
});
