/**
 * E2E: Character/Actor Flows
 *
 * Tests actor CRUD: list, create, get, update, delete, import.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServer } from "../helpers/server";
import { createClient, type ApiClient } from "../helpers/client";
import { seedUsers, seedCharacter, SEED } from "../helpers/seed";

describe("Characters E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url);
    await seedUsers(server.db);
    await seedCharacter(server.db);
    await api.loginAs(SEED.user.username, SEED.user.password);
  });

  afterAll(() => {
    server.close();
  });
  test("GET /api/actors returns list", async () => {
    const res = await api.get<{ data: Array<{ id: string; display_name: string }> }>("/api/actors");
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data!.data)).toBe(true);
  });

  test("POST /api/actors creates a character", async () => {
    const res = await api.post<{ id: string }>("/api/actors", {
      displayName: "New Character",
      actorType: "character",
      description: "A test character",
    });
    expect(res.ok).toBe(true);
    expect(res.data!.id).toBeTruthy();
  });

  test("POST /api/actors requires displayName", async () => {
    const res = await api.post("/api/actors", { actorType: "character" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.code).toBeTruthy(); // TEST.2 error envelope
  });

  test("GET /api/actors/:id returns single actor", async () => {
    const res = await api.get<{ id: string; display_name: string }>(
      `/api/actors/${SEED.character.id}`,
    );
    expect(res.ok).toBe(true);
    expect(res.data!.display_name).toBe(SEED.character.name);
  });

  test("GET /api/actors/:id/card exports V2 character card", async () => {
    const res = await api.get<{ spec: string; data: { name: string } }>(
      `/api/actors/${SEED.character.id}/card`,
    );
    expect(res.ok).toBe(true);
    expect(res.data!.spec).toBe("chara_card_v2");
    expect(res.data!.data.name).toBe(SEED.character.name);
  });

  test("PUT /api/actors/:id updates actor", async () => {
    const res = await api.put(`/api/actors/${SEED.character.id}`, {
      displayName: "Updated Character Name",
    });
    expect(res.ok).toBe(true);

    const getRes = await api.get<{ display_name: string }>(`/api/actors/${SEED.character.id}`);
    expect(getRes.data!.display_name).toBe("Updated Character Name");
  });

  test("DELETE /api/actors/:id deletes actor", async () => {
    // Create then delete
    const createRes = await api.post<{ id: string }>("/api/actors", {
      displayName: "To Delete",
    });
    const actorId = createRes.data!.id;

    const deleteRes = await api.del(`/api/actors/${actorId}`);
    expect(deleteRes.ok).toBe(true);

    const getRes = await api.get(`/api/actors/${actorId}`);
    expect(getRes.status).toBe(404);
    expect(getRes.code).toBeTruthy(); // TEST.2 error envelope
  });
});
