import { SEED, seedAll, } from "../helpers/seed";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestServer, type TestServer, } from "../helpers/server";
import { type ApiClient, createClient, } from "../helpers/client";

describe("Story E2E", () => {
  let server: TestServer;
  let api: ApiClient;
  let worldId: string;
  let locationId: string;
  let itemDefId: string;
  let itemInstanceId: string;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    api = createClient(server.url,);
    await seedAll(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);

    const worldRes = await api.post<{ id: string }>("/api/worlds", { name: "Story Test World", },);
    worldId = worldRes.data!.id;

    const locRes = await api.post<{ id: string }>(`/api/worlds/${worldId}/locations`, {
      name: "Story Location",
    },);
    locationId = locRes.data!.id;
  },);

  afterAll(() => {
    server.close();
  },);

  // ── Story Turns ──────────────────────────────────────────────

  test("GET /api/chats/:id/story-turns returns empty list", async () => {
    const res = await api.get(`/api/chats/${SEED.chat.id}/story-turns`,);
    expect(res.ok,).toBe(true,);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
  });

  // ── Story Items: Definitions ─────────────────────────────────

  test("POST /api/worlds/:id/items creates item definition", async () => {
    const res = await api.post<{ id: string }>(`/api/worlds/${worldId}/items`, {
      name: "Test Sword",
      description: "A sharp blade",
      category: "weapon",
      rarity: "uncommon",
      stackable: false,
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.id,).toBeTruthy();
    itemDefId = res.data!.id;
  });

  test("GET /api/worlds/:id/items lists definitions", async () => {
    const res = await api.get(`/api/worlds/${worldId}/items`,);
    expect(res.ok,).toBe(true,);
    const body = res.data as { data?: Array<{ name: string }> };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.data!.some((i,) => i.name === "Test Sword"),).toBe(true,);
  });

  test("GET /api/worlds/:id/items/:itemId returns definition", async () => {
    const res = await api.get<{ name: string }>(`/api/worlds/${worldId}/items/${itemDefId}`,);
    expect(res.ok,).toBe(true,);
    expect(res.data!.name,).toBe("Test Sword",);
  });

  test("PUT /api/worlds/:id/items/:itemId updates definition", async () => {
    const res = await api.put(`/api/worlds/${worldId}/items/${itemDefId}`, {
      name: "Updated Sword",
    },);
    expect(res.ok,).toBe(true,);

    const getRes = await api.get<{ name: string }>(`/api/worlds/${worldId}/items/${itemDefId}`,);
    expect(getRes.data!.name,).toBe("Updated Sword",);
  });

  test("POST /api/worlds/:id/item-instances places item in location", async () => {
    const res = await api.post<{ id: string }>(`/api/worlds/${worldId}/item-instances`, {
      itemId: itemDefId,
      locationId,
      quantity: 1,
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.id,).toBeTruthy();
    itemInstanceId = res.data!.id;
  });

  test("GET /api/worlds/:id/item-instances?locationId=... lists instances", async () => {
    const res = await api.get(`/api/worlds/${worldId}/item-instances?locationId=${locationId}`,);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data,),).toBe(true,);
    expect((res.data as Array<unknown>).length,).toBeGreaterThanOrEqual(1,);
  });

  test("GET /api/worlds/:id/items/:itemId/instances lists by definition", async () => {
    const res = await api.get(`/api/worlds/${worldId}/items/${itemDefId}/instances`,);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data,),).toBe(true,);
  });

  test("DELETE /api/worlds/:id/item-instances/:instanceId destroys instance", async () => {
    const delRes = await api.del(`/api/worlds/${worldId}/item-instances/${itemInstanceId}`,);
    expect(delRes.ok,).toBe(true,);
  });

  // ── Story States ─────────────────────────────────────────────

  test("POST /api/worlds/:id/states takes snapshot", async () => {
    const res = await api.post<{ id: string }>(`/api/worlds/${worldId}/states`, {
      description: "Test snapshot",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.id,).toBeTruthy();
  });

  test("GET /api/worlds/:id/states lists snapshots", async () => {
    const res = await api.get(`/api/worlds/${worldId}/states`,);
    expect(res.ok,).toBe(true,);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
  });

  test("GET /api/locations/:locationId/state handles missing state (404 ok)", async () => {
    const res = await api.get(`/api/locations/${locationId}/state`,);
    // Location state may not exist until snapshot is taken
    expect(res.status,).toBeOneOf([200, 404,],);
  });

  test("DELETE /api/worlds/:id/items/:itemId deletes definition", async () => {
    const delRes = await api.del(`/api/worlds/${worldId}/items/${itemDefId}`,);
    expect(delRes.ok,).toBe(true,);

    const getRes = await api.get(`/api/worlds/${worldId}/items/${itemDefId}`,);
    expect(getRes.status,).toBe(404,);
  });
});
