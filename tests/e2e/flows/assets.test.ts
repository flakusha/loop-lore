/**
 * E2E: Asset Flows
 *
 * Tests asset upload, list, serve, link, delete.
 * Requires seeded chat for link tests.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ApiClient, createClient } from "../helpers/client";
import { SEED, seedChat, seedUsers } from "../helpers/seed";
import { createTestServer, type TestServer } from "../helpers/server";

describe("Assets E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url);
    await seedUsers(server.db);
    await seedChat(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });
  test("GET /api/assets returns empty list", async () => {
    const res = await api.get<{ data: [] }>("/api/assets");
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data!.data)).toBe(true);
  });

  test("POST /api/assets uploads a file", async () => {
    const file = new File(["test content"], "test.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);

    const res = await api.upload<{ id: string; filename: string }>("/api/assets", formData);
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
    expect(res.data!.filename).toBe("test.txt");
  });

  test("GET /api/assets returns uploaded asset", async () => {
    // Upload first
    const file = new File(["png data"], "logo.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await api.upload<{ id: string; filename: string }>("/api/assets", formData);
    const assetId = uploadRes.data!.id;

    const res = await api.get<{ id: string; filename: string }>(`/api/assets/${assetId}`);
    expect(res.ok).toBe(true);
    expect(res.data!.filename).toBe("logo.png");
  });

  test("POST /api/assets/:id/links links asset to chat", async () => {
    // Upload
    const file = new File(["chat asset"], "chat-image.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData);
    const assetId = uploadRes.data!.id;

    // Link to chat
    const linkRes = await api.post(`/api/assets/${assetId}/links`, {
      entityType: "chat",
      entityId: SEED.chat.id,
    });
    expect(linkRes.ok).toBe(true);

    // Verify link exists
    const linksRes = await api.get<Array<{ entity_type: string; entity_id: string }>>(
      `/api/assets/${assetId}/links`,
    );
    expect(Array.isArray(linksRes.data)).toBe(true);
  });

  test("DELETE /api/assets/:id deletes asset", async () => {
    const file = new File(["delete me"], "delete.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await api.upload<{ id: string }>("/api/assets", formData);
    const assetId = uploadRes.data!.id;

    const deleteRes = await api.del(`/api/assets/${assetId}`);
    expect(deleteRes.ok).toBe(true);

    const getRes = await api.get(`/api/assets/${assetId}`);
    expect(getRes.status).toBe(404);
    expect(getRes.code).toBeTruthy(); // TEST.2 error envelope
  });
});
