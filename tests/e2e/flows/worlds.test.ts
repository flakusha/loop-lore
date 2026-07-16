import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, seedWorld, SEED } from "../helpers/seed";

describe("Worlds E2E", () => {
  let server: TestServer;
  let api: ApiClient;
  let createdWorldId: string;
  let createdLocationId: string;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true } });
    api = createClient(server.url);
    await seedUsers(server.db);
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
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });

  test("GET /api/worlds returns empty list initially", async () => {
    const res = await api.get<{ data: [] }>("/api/worlds");
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data!.data)).toBe(true);
  });

  test("POST /api/worlds creates a world", async () => {
    const res = await api.post<{ id: string }>("/api/worlds", {
      name: "Test World",
      description: "A world for E2E testing",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
    createdWorldId = res.data!.id;
  });

  test("GET /api/worlds returns created world in list", async () => {
    const res = await api.get<{ data: Array<{ id: string; name: string }> }>("/api/worlds");
    expect(res.ok).toBe(true);
    const worlds = res.data!.data;
    expect(worlds.some((w) => w.name === "Test World")).toBe(true);
  });

  test("GET /api/worlds/:id returns single world", async () => {
    const res = await api.get<{ name: string }>(`/api/worlds/${createdWorldId}`);
    expect(res.ok).toBe(true);
    expect(res.data!.name).toBe("Test World");
  });

  test("PUT /api/worlds/:id updates world", async () => {
    const res = await api.put(`/api/worlds/${createdWorldId}`, { name: "Updated World" });
    expect(res.ok).toBe(true);

    const getRes = await api.get<{ name: string }>(`/api/worlds/${createdWorldId}`);
    expect(getRes.data!.name).toBe("Updated World");
  });

  test("POST /api/worlds/:id/locations creates location", async () => {
    const res = await api.post<{ id: string }>(`/api/worlds/${createdWorldId}/locations`, {
      name: "Test Location",
      description: "A test location",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
    createdLocationId = res.data!.id;
  });

  test("GET /api/worlds/:id/locations lists locations", async () => {
    const res = await api.get<{ data: Array<{ id: string; name: string }> }>(
      `/api/worlds/${createdWorldId}/locations`,
    );
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data!.data)).toBe(true);
    expect(res.data!.data.some((l) => l.name === "Test Location")).toBe(true);
  });

  test("GET /api/worlds/:id/locations/:locId returns single location", async () => {
    const res = await api.get<{ name: string }>(
      `/api/worlds/${createdWorldId}/locations/${createdLocationId}`,
    );
    expect(res.ok).toBe(true);
    expect(res.data!.name).toBe("Test Location");
  });

  test("PUT /api/worlds/:id/locations/:locId updates location", async () => {
    const res = await api.put(`/api/worlds/${createdWorldId}/locations/${createdLocationId}`, {
      name: "Updated Location",
    });
    expect(res.ok).toBe(true);

    const getRes = await api.get<{ name: string }>(
      `/api/worlds/${createdWorldId}/locations/${createdLocationId}`,
    );
    expect(getRes.data!.name).toBe("Updated Location");
  });

  test("DELETE /api/worlds/:id/locations/:locId deletes location", async () => {
    const res = await api.del(`/api/worlds/${createdWorldId}/locations/${createdLocationId}`);
    expect(res.ok).toBe(true);

    const getRes = await api.get(`/api/worlds/${createdWorldId}/locations/${createdLocationId}`);
    expect(getRes.status).toBe(404);
    expect(getRes.code).toBeTruthy(); // TEST.2 error envelope
  });

  test("DELETE /api/worlds/:id deletes world", async () => {
    const res = await api.del(`/api/worlds/${createdWorldId}`);
    expect(res.ok).toBe(true);

    const getRes = await api.get(`/api/worlds/${createdWorldId}`);
    expect(getRes.status).toBe(404);
    expect(getRes.code).toBeTruthy(); // TEST.2 error envelope
  });

  test("cross-tenant isolation: User B cannot access User A's world", async () => {
    await seedWorld(server.db);

    const resA = await api.get<{ id: string }>(`/api/worlds/${SEED.world.id}`);
    expect(resA.ok).toBe(true);
    expect(resA.data!.id).toBe(SEED.world.id);

    const apiB = createClient(server.url);
    await apiB.loginAs("e2eother", "password");
    const resB = await apiB.get(`/api/worlds/${SEED.world.id}`);
    expect(resB.ok).toBe(false);
    expect(resB.status).toBe(404);
    expect(resB.code).toBeTruthy();
  });
});
