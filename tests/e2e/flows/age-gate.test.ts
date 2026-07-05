/**
 * E2E: Age Gate Flows
 *
 * Tests age gate enforcement on chat creation:
 *   1. Blocked when age gate not accepted
 *   2. Allowed after accepting age gate
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, SEED } from "../helpers/seed";

describe("Age Gate E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({
      ageGate: { enabled: true, minimumAge: 18, mode: "self-declaration" },
    });
    api = createClient(server.url);
  });

  afterAll(() => {
    server.close();
  });

  test("blocks chat creation when age gate not accepted", async () => {
    await seedUsers(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);

    // Try to create a chat — should be blocked by age gate
    const res = await api.post<{ id: string }>("/api/chats", {
      name: "Test Chat",
      type: "direct",
      mode: "direct",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.error).toContain("Age gate");

    // Accept age gate
    const acceptRes = await api.post("/api/age-gate/accept", {
      birthDate: "2000-01-01",
    });
    expect(acceptRes.ok).toBe(true);

    // Now chat creation should succeed
    const res2 = await api.post<{ id: string }>("/api/chats", {
      name: "Test Chat",
      type: "direct",
      mode: "direct",
    });
    expect(res2.ok).toBe(true);
    expect(res2.data!.id).toBeDefined();
  });
});