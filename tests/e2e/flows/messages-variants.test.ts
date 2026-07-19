import { SEED, seedAll, } from "../helpers/seed";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestServer, type TestServer, } from "../helpers/server";
import { type ApiClient, createClient, } from "../helpers/client";

describe("Message Variants, Visibility, Status E2E", () => {
  let server: TestServer;
  let api: ApiClient;
  let parentMsgId: string;
  let variantMsgId: string;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    api = createClient(server.url,);
    await seedAll(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);

    // Create messages with shared parent_id so they form a variant group
    const r1 = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: "Parent message",
      role: "user",
    },);
    parentMsgId = r1.data!.id;

    const r2 = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: "Variant A",
      role: "assistant",
      parentId: parentMsgId,
    },);
    variantMsgId = r2.data!.id;

    await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "Variant B",
      role: "assistant",
      parentId: parentMsgId,
    },);
  },);

  afterAll(() => {
    server.close();
  },);

  test("GET /api/messages/:id/variants returns variants array", async () => {
    const res = await api.get<Array<{ content: string }>>(`/api/messages/${variantMsgId}/variants`,);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data,),).toBe(true,);
    expect(res.data!.length,).toBe(2,);
  });

  test("PUT /api/messages/:id/variant selects variant by index", async () => {
    const res = await api.put(`/api/messages/${variantMsgId}/variant`, { variantIndex: 1, },);
    expect(res.ok,).toBe(true,);
    const selected = res.data as { content?: string } | null;
    expect(selected,).toBeTruthy();
    expect(selected!.content,).toBe("Variant B",);
  });

  test("PUT /api/messages/:id/variant rejects invalid index", async () => {
    const res = await api.put(`/api/messages/${variantMsgId}/variant`, { variantIndex: 99, },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(400,);
  });

  test("PUT /api/messages/:id/visibility updates visibility", async () => {
    const res = await api.put(`/api/messages/${SEED.message.id}/visibility`, {
      visibility: "hidden_by_user",
    },);
    expect(res.ok,).toBe(true,);

    const getRes = await api.get<{ visibility: string }>(`/api/messages/${SEED.message.id}`,);
    expect(getRes.data!.visibility,).toBe("hidden_by_user",);
  });

  test("PUT /api/messages/:id/visibility requires valid visibility", async () => {
    const res = await api.put(`/api/messages/${SEED.message.id}/visibility`, {
      visibility: "invalid",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
  });
});
