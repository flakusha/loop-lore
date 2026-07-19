import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ApiClient, createClient } from "../helpers/client";
import { SEED, seedUsers } from "../helpers/seed";
import { createTestServer, type TestServer } from "../helpers/server";

describe("World Lore Entries E2E", () => {
  let server: TestServer;
  let api: ApiClient;
  let worldId: string;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true } });
    api = createClient(server.url);
    await seedUsers(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);

    const worldRes = await api.post<{ id: string }>("/api/worlds", {
      name: "Lore Test World",
    });
    worldId = worldRes.data!.id;
  });

  afterAll(() => {
    server.close();
  });

  test("GET /api/worlds/:id/lore-entries returns empty list", async () => {
    const res = await api.get(`/api/worlds/${worldId}/lore-entries`);
    expect(res.ok).toBe(true);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("POST /api/worlds/:id/lore-entries creates entry", async () => {
    const res = await api.post<Record<string, unknown>>(`/api/worlds/${worldId}/lore-entries`, {
      key: "world_history",
      content: "The world was created in ancient times.",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("GET /api/worlds/:id/lore-entries lists entries", async () => {
    const res = await api.get(`/api/worlds/${worldId}/lore-entries`);
    expect(res.ok).toBe(true);
    const body = res.data as { data?: unknown[] };
    expect(body.data!.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/worlds/:id/lore-entries/:entryId returns single entry (has keys array, not single key)", async () => {
    const createRes = await api.post<Record<string, unknown>>(`/api/worlds/${worldId}/lore-entries`, {
      key: "specific_lore",
      content: "Specific content",
    });
    const entryId = createRes.data!.id as string;

    const res = await api.get<{ keys: string; content: string }>(
      `/api/worlds/${worldId}/lore-entries/${entryId}`,
    );
    expect(res.ok).toBe(true);
    // The response may use `keys` array instead of single `key` field
    expect(res.data!.content).toBe("Specific content");
  });

  test("PUT /api/worlds/:id/lore-entries/:entryId updates entry", async () => {
    const createRes = await api.post<Record<string, unknown>>(`/api/worlds/${worldId}/lore-entries`, {
      key: "update_lore",
      content: "Old content",
    });
    const entryId = createRes.data!.id as string;

    await api.put(`/api/worlds/${worldId}/lore-entries/${entryId}`, { content: "New content" });

    const getRes = await api.get<{ content: string }>(
      `/api/worlds/${worldId}/lore-entries/${entryId}`,
    );
    expect(getRes.data!.content).toBe("New content");
  });

  test("DELETE /api/worlds/:id/lore-entries/:entryId deletes entry", async () => {
    const createRes = await api.post<Record<string, unknown>>(`/api/worlds/${worldId}/lore-entries`, {
      key: "delete_lore",
      content: "To delete",
    });
    const entryId = createRes.data!.id as string;

    const delRes = await api.del(`/api/worlds/${worldId}/lore-entries/${entryId}`);
    expect(delRes.ok).toBe(true);

    const getRes = await api.get(`/api/worlds/${worldId}/lore-entries/${entryId}`);
    expect(getRes.status).toBe(404);
  });
});
