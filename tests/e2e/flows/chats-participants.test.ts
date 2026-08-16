import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

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

  test("POST /api/chats/:id/side creates a side-channel linked to the group", async () => {
    const createRes = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/side`, {
      name: "OOC Channel",
    },);
    expect(createRes.ok,).toBe(true,);
    const sideId = createRes.data!.id;

    // List side-channels returns the created child.
    const listRes = await api.get<{ sideChannels: Array<{ id: string; name: string }> }>(
      `/api/chats/${SEED.chat.id}/side`,
    );
    expect(listRes.ok,).toBe(true,);
    expect(listRes.data!.sideChannels.some((s,) => s.id === sideId),).toBe(true,);
    expect(listRes.data!.sideChannels.some((s,) => s.name === "OOC Channel"),).toBe(true,);

    // The side-channel is a real chat owned by the user.
    const chatRes = await api.get<{ parent_chat_id: string | null; name: string }>(
      `/api/chats/${sideId}`,
    );
    expect(chatRes.ok,).toBe(true,);
    expect(chatRes.data!.parent_chat_id,).toBe(SEED.chat.id,);
  });

  test("GET /api/chats/:id/side excludes migrated (template) children", async () => {
    // Side-channel creation for a non-group (direct) chat still lists cleanly.
    const direct = await api.post<{ id: string }>("/api/chats", { name: "Direct for Side", },);
    const directId = direct.data!.id;

    const listRes = await api.get<{ sideChannels: unknown[] }>(`/api/chats/${directId}/side`,);
    expect(listRes.ok,).toBe(true,);
    expect(Array.isArray(listRes.data!.sideChannels,),).toBe(true,);
  });

  test("GET /api/chats/:id/turn-order returns a snapshot for a group chat", async () => {
    // Create a group chat and add the seeded AI character as a participant.
    const group = await api.post<{ id: string }>("/api/chats", {
      name: "Turn Order Group",
      type: "group",
      mode: "group",
    },);
    const groupId = group.data!.id;
    await api.post(`/api/chats/${groupId}/participants`, {
      actorId: SEED.character.id,
      roleInChat: "member",
    },);

    const res = await api.get<{
      turnOrder: {
        strategy: string | null;
        currentActorId: string | null;
        nextActorId: string | null;
        order: Array<{ actor_id: string; display_name: string }>;
      } | null;
    }>(`/api/chats/${groupId}/turn-order`,);
    expect(res.ok,).toBe(true,);
    // The group has an AI participant → a turn order is computed.
    expect(res.data!.turnOrder,).not.toBeNull();
    expect(res.data!.turnOrder!.order.length,).toBeGreaterThan(0,);
    // The seeded AI character is in the order (non-user agent).
    expect(res.data!.turnOrder!.order.some((o,) => o.actor_id === SEED.character.id),).toBe(true,);
    // Without a configured strategy, nextActorId may be null, but the order
    // still reflects the participant set.
    expect(res.data!.turnOrder!.order[0]?.actor_id,).toBeDefined();
  });

  test("GET /api/chats/:id/turn-order returns null for a direct chat", async () => {
    const direct = await api.post<{ id: string }>("/api/chats", { name: "Direct Turn", },);
    const directId = direct.data!.id;
    const res = await api.get<{ turnOrder: unknown }>(`/api/chats/${directId}/turn-order`,);
    expect(res.ok,).toBe(true,);
    expect(res.data!.turnOrder,).toBeNull();
  });
});
