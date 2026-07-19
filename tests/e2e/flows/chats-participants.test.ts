import { SEED, seedAll } from "../helpers/seed";
import { SEED, seedAll, } from "../helpers/seed";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestServer, type TestServer, } from "../helpers/server";
import { type ApiClient, createClient } from "../helpers/client";
import { type ApiClient, createClient, } from "../helpers/client";

describe("Chat Participants E2E", () => {
  let server: TestServer;
  let api: ApiClient;
  let participantActorId: string;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    api = createClient(server.url,);
    await seedAll(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  test("GET /api/chats/:id/participants lists participants (returns array)", async () => {
    const res = await api.get<Array<{ actor_id: string; role_in_chat: string }>>(
      `/api/chats/${SEED.chat.id}/participants`,
    );
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data,),).toBe(true,);
    expect(res.data!.some((p,) => p.actor_id === SEED.user.id),).toBe(true,);
  });

  test("POST /api/chats/:id/participants adds a participant", async () => {
    const actorRes = await api.post<{ id: string }>("/api/actors", {
      displayName: "Participant Actor",
      actorType: "character",
    },);
    participantActorId = actorRes.data!.id;

    const res = await api.post(`/api/chats/${SEED.chat.id}/participants`, {
      actorId: participantActorId,
      roleInChat: "member",
    },);
    expect(res.ok,).toBe(true,);

    const listRes = await api.get<Array<{ actor_id: string }>>(
      `/api/chats/${SEED.chat.id}/participants`,
    );
    expect(listRes.data!.some((p,) => p.actor_id === participantActorId),).toBe(true,);
  });

  test("POST /api/chats/:id/participants requires actorId", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/participants`, {
      roleInChat: "member",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
  });

  test("DELETE /api/chats/:id/participants/:actorId removes participant", async () => {
    const res = await api.del(`/api/chats/${SEED.chat.id}/participants/${participantActorId}`,);
    expect(res.ok,).toBe(true,);

    const listRes = await api.get<Array<{ actor_id: string }>>(
      `/api/chats/${SEED.chat.id}/participants`,
    );
    expect(listRes.data!.some((p,) => p.actor_id === participantActorId),).toBe(false,);
  });
});
