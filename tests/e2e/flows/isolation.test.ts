/**
 * E2E: Cross-Tenant Isolation Tests
 *
 * Verifies User A's resources are inaccessible to User B.
 * Uses two separate client instances with different auth tokens.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, seedCharacter, SEED } from "../helpers/seed";

describe("Cross-Tenant Isolation E2E", () => {
  let server: TestServer;
  let userA: ApiClient;
  let userB: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true } });
    await seedUsers(server.db);
    await seedCharacter(server.db);

    // Create a second regular user (non-admin) for isolation testing
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

    userA = createClient(server.url);
    userB = createClient(server.url);

    await new Promise((r) => setTimeout(r, 200));

    const aOk = await userA.loginAs(SEED.user.username, SEED.user.password);
    expect(aOk).toBe(true);

    const bOk = await userB.loginAs("e2eother", "password");
    expect(bOk).toBe(true);
  }, 30_000);

  afterAll(() => {
    server.close();
  });

  test("User A creates chat — User B gets 403/404", async () => {
    const createRes = await userA.post<{ id: string }>("/api/chats", {
      name: "Isolation Chat",
      type: "direct",
      mode: "direct",
    });
    expect(createRes.ok).toBe(true);
    expect(createRes.data?.id).toBeTruthy();

    const getRes = await userB.get(`/api/chats/${createRes.data!.id}`);
    expect(getRes.ok).toBe(false);
    expect([403, 404]).toContain(getRes.status);
  });

  test("User A still accesses own chat after B rejected", async () => {
    const createRes = await userA.post<{ id: string }>("/api/chats", {
      name: "Own Chat",
      type: "direct",
      mode: "direct",
    });
    expect(createRes.ok).toBe(true);

    const getRes = await userA.get(`/api/chats/${createRes.data!.id}`);
    expect(getRes.ok).toBe(true);
  });

  test("User B cannot access user A's character", async () => {
    const getRes = await userB.get(`/api/actors/${SEED.character.id}`);
    expect(getRes.ok).toBe(false);
    expect([403, 404]).toContain(getRes.status);
  });

  test("User B cannot delete user A's chat", async () => {
    const createRes = await userA.post<{ id: string }>("/api/chats", {
      name: "Delete Target",
      type: "direct",
      mode: "direct",
    });
    expect(createRes.ok).toBe(true);
    const chatId = createRes.data!.id;

    const deleteRes = await userB.del(`/api/chats/${chatId}`);
    expect(deleteRes.ok).toBe(false);
    expect([403, 404]).toContain(deleteRes.status);

    const getRes = await userA.get(`/api/chats/${chatId}`);
    expect(getRes.ok).toBe(true);
  });

  test("User B cannot list user A's chats", async () => {
    const createRes = await userA.post<{ id: string }>("/api/chats", {
      name: "Hidden Chat",
      type: "direct",
      mode: "direct",
    });
    expect(createRes.ok).toBe(true);

    const listRes = await userB.get<{ data: Array<{ id: string }> }>("/api/chats");
    expect(listRes.ok).toBe(true);
    const ids = listRes.data!.data.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(createRes.data!.id);
  });
});