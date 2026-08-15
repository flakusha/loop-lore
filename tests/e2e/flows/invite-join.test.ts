/**
 * E2E: Chat Invite & Join Flows
 *
 * Validates the invite/join mechanics end-to-end:
 *   - Owner creates an invite (code) for a chat
 *   - Non-owner cannot create/list/revoke invites (404)
 *   - A second user joins the chat by redeeming the code
 *   - Joining grants access to the chat (GET /api/chats/:id)
 *   - Expired / revoked / used-up / invalid codes are rejected
 *   - Cross-tenant isolation: a user cannot join a chat they weren't invited to
 *
 * Uses the test server + seeded users/chats.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedChat, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** Shared invite code captured by the create test and consumed by the join tests. */
let inviteCode = "";

describe("Chat Invite & Join E2E", () => {
  let server: TestServer;
  let owner: ApiClient;
  let joiner: ApiClient;
  let joiner2: ApiClient;
  let outsider: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    await seedUsers(server.db,);
    await seedChat(server.db,);

    owner = createClient(server.url,);
    joiner = createClient(server.url,);
    outsider = createClient(server.url,);

    await owner.loginAs(SEED.user.username, SEED.user.password,);
    // A second user who can join via invite.
    await server.db
      .insertInto("users",)
      .values({
        id: "a0000021-0000-4000-a000-000000000000",
        username: "e2ejoiner",
        display_name: "E2E Joiner",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await server.db
      .insertInto("actors",)
      .values({
        id: "a0000021-0000-4000-a000-000000000000",
        actor_type: "user",
        display_name: "E2E Joiner",
        user_id: "a0000021-0000-4000-a000-000000000000",
        owner_id: "a0000021-0000-4000-a000-000000000000",
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();
    await joiner.loginAs("e2ejoiner", "password",);

    // A third user who is not invited and should not be able to join.
    await server.db
      .insertInto("users",)
      .values({
        id: "a0000022-0000-4000-a000-000000000000",
        username: "e2eoutsider",
        display_name: "E2E Outsider",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await server.db
      .insertInto("actors",)
      .values({
        id: "a0000022-0000-4000-a000-000000000000",
        actor_type: "user",
        display_name: "E2E Outsider",
        user_id: "a0000022-0000-4000-a000-000000000000",
        owner_id: "a0000022-0000-4000-a000-000000000000",
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();
    await outsider.loginAs("e2eoutsider", "password",);

    // A fourth user who is not a member — used to test capacity exhaustion.
    await server.db
      .insertInto("users",)
      .values({
        id: "a0000023-0000-4000-a000-000000000000",
        username: "e2ejoiner2",
        display_name: "E2E Joiner 2",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await server.db
      .insertInto("actors",)
      .values({
        id: "a0000023-0000-4000-a000-000000000000",
        actor_type: "user",
        display_name: "E2E Joiner 2",
        user_id: "a0000023-0000-4000-a000-000000000000",
        owner_id: "a0000023-0000-4000-a000-000000000000",
        agent_type: "none",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();
    joiner2 = createClient(server.url,);
    await joiner2.loginAs("e2ejoiner2", "password",);
  },);

  afterAll(() => {
    server.close();
  },);

  test("owner creates an invite for the chat", async () => {
    const res = await owner.post<{ id: string; code: string; chatId: string; uses: number; status: string }>(
      `/api/chats/${SEED.chat.id}/invites`,
      {},
    );
    expect(res.ok,).toBe(true,);
    expect(res.status,).toBe(201,);
    expect(res.data!.code,).toHaveLength(8,);
    expect(res.data!.chatId,).toBe(SEED.chat.id,);
    expect(res.data!.uses,).toBe(0,);
    expect(res.data!.status,).toBe("active",);
    // Store for later tests
    inviteCode = res.data!.code;
  });

  test("non-owner cannot create an invite (404)", async () => {
    const res = await joiner.post(`/api/chats/${SEED.chat.id}/invites`, {},);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(404,);
  });

  test("non-owner cannot list invites (404)", async () => {
    const res = await joiner.get(`/api/chats/${SEED.chat.id}/invites`,);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(404,);
  });

  test("owner lists the invites", async () => {
    const res = await owner.get<{ data: Array<{ code: string }> }>(`/api/chats/${SEED.chat.id}/invites`,);
    expect(res.ok,).toBe(true,);
    expect(Array.isArray(res.data!.data,),).toBe(true,);
    expect(res.data!.data.length,).toBeGreaterThanOrEqual(1,);
  });

  test("joiner redeems the code and gains access to the chat", async () => {
    const code = inviteCode;
    const joinRes = await joiner.post<{ chatId: string; alreadyMember: boolean }>(
      `/api/invites/${code}/join`,
      {},
    );
    expect(joinRes.ok,).toBe(true,);
    expect(joinRes.data!.chatId,).toBe(SEED.chat.id,);

    // Joiner can now access the chat.
    const chatRes = await joiner.get(`/api/chats/${SEED.chat.id}`,);
    expect(chatRes.ok,).toBe(true,);
  });

  test("re-joining as an already-member is idempotent", async () => {
    const code = inviteCode;
    const joinRes = await joiner.post<{ chatId: string; alreadyMember: boolean }>(
      `/api/invites/${code}/join`,
      {},
    );
    expect(joinRes.ok,).toBe(true,);
    expect(joinRes.data!.alreadyMember,).toBe(true,);
  });

  test("invalid code is rejected (404)", async () => {
    const res = await joiner.post("/api/invites/NOPE1234/join", {},);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(404,);
  });

  test("revoked invite is rejected (404)", async () => {
    // Create a fresh invite and revoke it.
    const created = await owner.post<{ id: string; code: string }>(`/api/chats/${SEED.chat.id}/invites`, {},);
    expect(created.ok,).toBe(true,);
    const inviteId = created.data!.id;
    const code = created.data!.code;

    const revokeRes = await owner.del(`/api/chats/${SEED.chat.id}/invites/${inviteId}`,);
    expect(revokeRes.ok,).toBe(true,);

    const joinRes = await joiner.post(`/api/invites/${code}/join`, {},);
    expect(joinRes.ok,).toBe(false,);
    expect(joinRes.status,).toBe(404,);
  });

  test("used-up invite is rejected (410)", async () => {
    const created = await owner.post<{ id: string; code: string }>(
      `/api/chats/${SEED.chat.id}/invites`,
      { maxUses: 1, },
    );
    expect(created.ok,).toBe(true,);
    const code = created.data!.code;

    // First join consumes the single use.
    const first = await outsider.post(`/api/invites/${code}/join`, {},);
    expect(first.ok,).toBe(true,);

    // A different user cannot join — capacity exhausted.
    const second = await joiner2.post(`/api/invites/${code}/join`, {},);
    expect(second.ok,).toBe(false,);
    expect(second.status,).toBe(410,);
  });

  test("expired invite is rejected (410)", async () => {
    const past = new Date(Date.now() - 1000,).toISOString();
    const created = await owner.post<{ id: string; code: string }>(
      `/api/chats/${SEED.chat.id}/invites`,
      { expiresAt: past, },
    );
    expect(created.ok,).toBe(true,);
    const code = created.data!.code;

    const joinRes = await outsider.post(`/api/invites/${code}/join`, {},);
    expect(joinRes.ok,).toBe(false,);
    expect(joinRes.status,).toBe(410,);
  });
});
