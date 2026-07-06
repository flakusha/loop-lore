import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, seedCharacter, SEED } from "../helpers/seed";

const ACTOR_ID = SEED.character.id;

describe("Actor Subresources E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true } });
    api = createClient(server.url);
    await seedUsers(server.db);
    await seedCharacter(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });

  // ── Memories ────────────────────────────────────────────────

  test("GET /api/actors/:id/memories returns empty list", async () => {
    const res = await api.get(`/api/actors/${ACTOR_ID}/memories`);
    expect(res.ok).toBe(true);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("POST /api/actors/:id/memories creates memory", async () => {
    const res = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/memories`, {
      content: "Test memory content",
      type: "fact",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("GET /api/actors/:id/memories/:memoryId returns memory", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/memories`, {
      content: "Specific memory",
      type: "fact",
    });
    const memoryId = createRes.data!.id;

    const res = await api.get<{ content: string }>(`/api/actors/${ACTOR_ID}/memories/${memoryId}`);
    expect(res.ok).toBe(true);
    expect(res.data!.content).toBe("Specific memory");
  });

  test("PUT /api/actors/:id/memories/:memoryId updates memory", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/memories`, {
      content: "Old memory",
      type: "fact",
    });
    const memoryId = createRes.data!.id;

    await api.put(`/api/actors/${ACTOR_ID}/memories/${memoryId}`, { content: "Updated memory" });

    const getRes = await api.get<{ content: string }>(`/api/actors/${ACTOR_ID}/memories/${memoryId}`);
    expect(getRes.data!.content).toBe("Updated memory");
  });

  test("DELETE /api/actors/:id/memories/:memoryId deletes memory", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/memories`, {
      content: "To delete",
      type: "fact",
    });
    const memoryId = createRes.data!.id;

    const delRes = await api.del(`/api/actors/${ACTOR_ID}/memories/${memoryId}`);
    expect(delRes.ok).toBe(true);

    const getRes = await api.get(`/api/actors/${ACTOR_ID}/memories/${memoryId}`);
    expect(getRes.status).toBe(404);
  });

  // ── Items ───────────────────────────────────────────────────

  test("POST /api/actors/:id/items creates item", async () => {
    const res = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/items`, {
      name: "Test Item",
      description: "An item",
      quantity: 1,
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("GET /api/actors/:id/items returns list", async () => {
    const res = await api.get(`/api/actors/${ACTOR_ID}/items`);
    expect(res.ok).toBe(true);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("PUT /api/actors/:id/items/:itemId updates item", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/items`, {
      name: "Old Name",
      quantity: 1,
    });
    const itemId = createRes.data!.id;

    const res = await api.put(`/api/actors/${ACTOR_ID}/items/${itemId}`, { name: "Updated Name" });
    expect(res.ok).toBe(true);
  });

  test("DELETE /api/actors/:id/items/:itemId deletes item", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/items`, {
      name: "Delete Me",
      quantity: 1,
    });
    const itemId = createRes.data!.id;

    const delRes = await api.del(`/api/actors/${ACTOR_ID}/items/${itemId}`);
    expect(delRes.ok).toBe(true);

    const getRes = await api.get(`/api/actors/${ACTOR_ID}/items/${itemId}`);
    expect(getRes.status).toBe(404);
  });

  // ── Notes ───────────────────────────────────────────────────

  test("POST /api/actors/:id/notes creates note", async () => {
    const res = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/notes`, {
      title: "Test Note",
      content: "Note content",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("GET /api/actors/:id/notes returns list", async () => {
    const res = await api.get(`/api/actors/${ACTOR_ID}/notes`);
    expect(res.ok).toBe(true);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("PUT /api/actors/:id/notes/:noteId updates note", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/notes`, {
      title: "Original",
      content: "Original content",
    });
    const noteId = createRes.data!.id;

    await api.put(`/api/actors/${ACTOR_ID}/notes/${noteId}`, { content: "Updated content" });

    const getRes = await api.get<{ content: string }>(`/api/actors/${ACTOR_ID}/notes/${noteId}`);
    expect(getRes.data!.content).toBe("Updated content");
  });

  test("DELETE /api/actors/:id/notes/:noteId deletes note", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/notes`, {
      title: "Delete Note",
      content: "Bye",
    });
    const noteId = createRes.data!.id;

    const delRes = await api.del(`/api/actors/${ACTOR_ID}/notes/${noteId}`);
    expect(delRes.ok).toBe(true);

    const getRes = await api.get(`/api/actors/${ACTOR_ID}/notes/${noteId}`);
    expect(getRes.status).toBe(404);
  });

  // ── Lore Entries ────────────────────────────────────────────

  test("POST /api/actors/:id/lore-entries creates lore entry", async () => {
    const res = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/lore-entries`, {
      key: "test_lore",
      content: "Test lore content",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("GET /api/actors/:id/lore-entries returns list", async () => {
    const res = await api.get(`/api/actors/${ACTOR_ID}/lore-entries`);
    expect(res.ok).toBe(true);
    const body = res.data as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("PUT /api/actors/:id/lore-entries/:entryId updates lore", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/lore-entries`, {
      key: "update_test",
      content: "Old content",
    });
    const entryId = createRes.data!.id;

    await api.put(`/api/actors/${ACTOR_ID}/lore-entries/${entryId}`, { content: "New content" });

    const getRes = await api.get<{ content: string }>(`/api/actors/${ACTOR_ID}/lore-entries/${entryId}`);
    expect(getRes.data!.content).toBe("New content");
  });

  test("DELETE /api/actors/:id/lore-entries/:entryId deletes lore", async () => {
    const createRes = await api.post<{ id: string }>(`/api/actors/${ACTOR_ID}/lore-entries`, {
      key: "delete_test",
      content: "Bye lore",
    });
    const entryId = createRes.data!.id;

    const delRes = await api.del(`/api/actors/${ACTOR_ID}/lore-entries/${entryId}`);
    expect(delRes.ok).toBe(true);

    const getRes = await api.get(`/api/actors/${ACTOR_ID}/lore-entries/${entryId}`);
    expect(getRes.status).toBe(404);
  });
});
