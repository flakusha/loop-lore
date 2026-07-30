/**
 * E2E: Character/Actor Flows
 *
 * Tests actor CRUD: list, create, get, update, delete, import.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedCharacter, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Characters E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await seedCharacter(server.db,);
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
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);
  test("GET /api/actors returns list", async () => {
    const res = await api.get<{ data: Array<{ id: string; display_name: string }> }>("/api/actors",);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data!.data,),).toBe(true,);
  });

  test("POST /api/actors creates a character", async () => {
    const res = await api.post<{ id: string }>("/api/actors", {
      displayName: "New Character",
      actorType: "character",
      description: "A test character",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data!.id,).toBeTruthy();
  });

  test("POST /api/actors requires displayName", async () => {
    const res = await api.post("/api/actors", { actorType: "character", },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("GET /api/actors/:id returns single actor", async () => {
    const res = await api.get<{ id: string; display_name: string }>(
      `/api/actors/${SEED.character.id}`,
    );
    expect(res.ok,).toBe(true,);
    expect(res.data!.display_name,).toBe(SEED.character.name,);
  });

  test("GET /api/actors/:id/card exports V2 character card", async () => {
    const res = await api.get<{ spec: string; data: { name: string } }>(
      `/api/actors/${SEED.character.id}/card`,
    );
    expect(res.ok,).toBe(true,);
    expect(res.data!.spec,).toBe("chara_card_v2",);
    expect(res.data!.data.name,).toBe(SEED.character.name,);
  });

  test("PUT /api/actors/:id updates actor", async () => {
    const res = await api.put(`/api/actors/${SEED.character.id}`, {
      displayName: "Updated Character Name",
    },);
    expect(res.ok,).toBe(true,);

    const getRes = await api.get<{ display_name: string }>(`/api/actors/${SEED.character.id}`,);
    expect(getRes.data!.display_name,).toBe("Updated Character Name",);
  });

  test("DELETE /api/actors/:id deletes actor", async () => {
    // Create then delete
    const createRes = await api.post<{ id: string }>("/api/actors", {
      displayName: "To Delete",
    },);
    const actorId = createRes.data!.id;

    const deleteRes = await api.del(`/api/actors/${actorId}`,);
    expect(deleteRes.ok,).toBe(true,);

    const getRes = await api.get(`/api/actors/${actorId}`,);
    expect(getRes.status,).toBe(404,);
    expect(getRes.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("cross-tenant isolation: User B cannot access User A's character", async () => {
    const resA = await api.get<{ id: string }>(`/api/actors/${SEED.character.id}`,);
    expect(resA.ok,).toBe(true,);
    expect(resA.data!.id,).toBe(SEED.character.id,);

    const apiB = createClient(server.url,);
    await apiB.loginAs("e2eother", "password",);
    const resB = await apiB.get(`/api/actors/${SEED.character.id}`,);
    expect(resB.ok,).toBe(false,);
    expect(resB.status,).toBe(404,);
    expect(resB.code,).toBeTruthy();
  });
});
