/**
 * E2E: Chat Flows
 *
 * Tests chat CRUD: list, create, get, update, delete.
 * Requires seeded user in the database.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedChat, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Chats E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url,);
    await server.db
      .insertInto("users",)
      .values({
        id: "00000000-0000-4000-b000-000000000099",
        username: "e2eother",
        display_name: "E2E Other User",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
  },);

  afterAll(() => {
    server.close();
  },);
  test("GET /api/chats returns empty list when no chats", async () => {
    await api.login();
    const res = await api.get<{ data: [] }>("/api/chats",);
    expect(res.ok,).toBe(true,);
    expect(res.data,).toBeTruthy();
    expect(Array.isArray(res.data!.data,),).toBe(true,);
  });

  test("POST /api/chats creates a new chat", async () => {
    await api.login();
    const res = await api.post<{ id: string }>("/api/chats", {
      name: "Created Chat",
      type: "direct",
      mode: "direct",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.id,).toBeTruthy();
  });

  test("GET /api/chats returns created chat in list", async () => {
    await api.login();
    const res = await api.get<{ data: Array<{ id: string; name: string }> }>("/api/chats",);
    expect(res.ok,).toBe(true,);
    const chats = res.data!.data;
    expect(chats.length,).toBeGreaterThanOrEqual(1,);
    expect(chats.some((c,) => c.name === "Created Chat"),).toBe(true,);
  });

  test("POST /api/chats requires name", async () => {
    await api.login();
    const res = await api.post("/api/chats", { type: "direct", },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("GET /api/chats/:id returns single chat", async () => {
    await api.login();
    // Create a chat first
    const createRes = await api.post<{ id: string }>("/api/chats", {
      name: "Single Chat",
      type: "direct",
      mode: "direct",
    },);
    expect(createRes.ok,).toBe(true,);
    const chatId = createRes.data!.id;

    const res = await api.get(`/api/chats/${chatId}`,);
    expect(res.ok,).toBe(true,);
    const chat = res.data as Record<string, unknown>;
    expect(chat.name,).toBe("Single Chat",);
  });

  test("PUT /api/chats/:id updates chat name", async () => {
    await api.login();
    const createRes = await api.post<{ id: string }>("/api/chats", {
      name: "Old Name",
      type: "direct",
    },);
    const chatId = createRes.data!.id;

    const updateRes = await api.put(`/api/chats/${chatId}`, { name: "Updated Name", },);
    expect(updateRes.ok,).toBe(true,);

    const getRes = await api.get<Record<string, unknown>>(`/api/chats/${chatId}`,);
    expect(getRes.data!.name,).toBe("Updated Name",);
  });

  test("DELETE /api/chats/:id deletes chat", async () => {
    await api.login();
    const createRes = await api.post<{ id: string }>("/api/chats", {
      name: "To Delete",
      type: "direct",
    },);
    const chatId = createRes.data!.id;

    const deleteRes = await api.del(`/api/chats/${chatId}`,);
    expect(deleteRes.ok,).toBe(true,);

    const getRes = await api.get(`/api/chats/${chatId}`,);
    expect(getRes.status,).toBe(404,);
    expect(getRes.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("seeded chat is accessible", async () => {
    await seedUsers(server.db,);
    await seedChat(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);

    const res = await api.get<Record<string, unknown>>(`/api/chats/${SEED.chat.id}`,);
    expect(res.ok,).toBe(true,);
    expect(res.data!.name,).toBe(SEED.chat.name,);
  });

  test("cross-tenant isolation: User B cannot access User A's chat", async () => {
    await seedUsers(server.db,);
    await seedChat(server.db,);

    // Log in as User A and verify access
    await api.loginAs(SEED.user.username, SEED.user.password,);
    const ownRes = await api.get(`/api/chats/${SEED.chat.id}`,);
    expect(ownRes.ok,).toBe(true,);

    // Log in as User B (e2eother) and try to access User A's chat
    await api.loginAs("e2eother", "password",);
    const otherRes = await api.get(`/api/chats/${SEED.chat.id}`,);
    expect(otherRes.ok,).toBe(false,);
    expect(otherRes.status,).toBe(404,);
  });

  test("cross-tenant isolation: User B cannot see User A's chat list", async () => {
    await seedUsers(server.db,);
    await seedChat(server.db,);

    // Log in as User A and verify chat is visible
    await api.loginAs(SEED.user.username, SEED.user.password,);
    const ownList = await api.get<{ data: Array<{ id: string }> }>("/api/chats",);
    expect(ownList.ok,).toBe(true,);
    const ownChats = ownList.data!.data;
    expect(ownChats.some((c,) => c.id === SEED.chat.id),).toBe(true,);

    // Log in as User B and verify chat is NOT visible
    await api.loginAs("e2eother", "password",);
    const otherList = await api.get<{ data: Array<{ id: string }> }>("/api/chats",);
    expect(otherList.ok,).toBe(true,);
    const otherChats = otherList.data!.data;
    expect(otherChats.some((c,) => c.id === SEED.chat.id),).toBe(false,);
  });
});
