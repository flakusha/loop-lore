// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Message Edge-Cases
 *
 * Drives /api/chats/:id/messages + /api/messages/:id with adversarial
 * payloads to pin what those routes validate today. Acts as a regression
 * net for future hardening.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Message edge-cases E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db,);
    api = createClient(server.url,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  // ── Validation: required fields ──────────────────────────────

  test("POST message with no body returns 4xx, not 5xx", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {},);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });

  test("POST message with empty content string is rejected (4xx)", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "",
      role: "user",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });
  test("POST message with whitespace-only content is rejected (400)", async () => {
    // BUG-message-whitespace-only-accepted fixed: route now trims and
    // rejects whitespace-only payloads before any side effect.
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "   \n\t  ",
      role: "user",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(400,);
  });
  test("POST message with leading/trailing whitespace is accepted (trimmed, not rejected)", async () => {
    // BUG-message-whitespace-only-accepted fixed: trailing/leading whitespace
    // is trimmed at the route boundary, so the message is persisted with
    // the trimmed content (not rejected wholesale, not stored with the
    // surrounding whitespace). We confirm via 201 + an id; content shape
    // is verified by the message-read coverage tests elsewhere.
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "   hello world\n\n",
      role: "user",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.status,).toBe(201,);
    const created = (res.data ?? {}) as { id?: string };
    expect(typeof created.id,).toBe("string",);
  });
  test("POST message with unknown role is rejected (4xx)", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "hi",
      role: "moderator-impersonator",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });

  test("POST message with non-string content is rejected (4xx)", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: { "$gt": "", },
      role: "user",
    },);
    expect(res.ok,).toBe(false,);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });

  // ── Oversize payloads ────────────────────────────────────────

  test("POST message with 1MB content is bounded (no 5xx, no OOM)", async () => {
    const huge = "x".repeat(1_000_000,);
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: huge,
      role: "user",
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  // ── Unicode / control chars ──────────────────────────────────

  test("POST message with full unicode + emoji round-trips byte-for-byte", async () => {
    const sent = `日本語 🌌 \u{1F600}\u{1F4A9} кир тест`;
    const res = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: sent,
      role: "user",
    },);
    expect(res.ok,).toBe(true,);

    const list = await api.get<{ data: Array<{ content: string }> }>(`/api/chats/${SEED.chat.id}/messages`,);
    expect(list.ok,).toBe(true,);
    const found = list.data!.data.find((m,) => m.content === sent);
    expect(found,).toBeTruthy();
  });

  test("POST message with ANSI escape codes is accepted, not 5xx", async () => {
    const text = "line1\u0007line2\u001B[31mred\u001B[0mline3";
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: text,
      role: "user",
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  // ── SQL injection probe ──────────────────────────────────────

  test("POST message with SQL DROP statement does not crash server", async () => {
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "'; DROP TABLE messages; --",
      role: "user",
    },);
    expect(res.status,).toBeLessThan(500,);
    // Table must still exist:
    const probe = await server.db
      .selectFrom("messages",)
      .select("id",)
      .limit(1,)
      .executeTakeFirst();
    expect(probe,).toBeTruthy();
  });

  // ── Cross-tenant access ──────────────────────────────────────

  test("Other user cannot create a message in SEED.chat", async () => {
    await server.db
      .insertInto("users",)
      .values({
        id: "00000000-0000-4000-b000-000000000099",
        username: "edgeOther",
        display_name: "Edge Other",
        password_hash: "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    const apiB = createClient(server.url,);
    await apiB.loginAs("edgeOther", "password",);
    const res = await apiB.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: "I should not post here",
      role: "user",
    },);
    expect([403, 404,],).toContain(res.status,);
  });

  test("Other user cannot read messages in SEED.chat", async () => {
    const apiB = createClient(server.url,);
    await apiB.loginAs("edgeOther", "password",);
    const res = await apiB.get(`/api/chats/${SEED.chat.id}/messages`,);
    expect([403, 404,],).toContain(res.status,);
  });

  // ── GET edge cases ───────────────────────────────────────────

  test("GET /api/messages/:id with non-UUID returns 4xx, not 5xx", async () => {
    const res = await api.get("/api/v1/messages/not-a-uuid",);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });

  test("GET /api/messages/:id with UUID-like non-existent returns 404", async () => {
    const res = await api.get("/api/v1/messages/00000000-0000-0000-0000-000000000000",);
    expect(res.status,).toBe(404,);
  });

  // ── Soft-delete sanity ───────────────────────────────────────

  test("Deleting then re-fetching a message shows it as hidden, not 5xx", async () => {
    const createRes = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: "to-delete",
      role: "user",
    },);
    const msgId = createRes.data!.id;

    const delRes = await api.del(`/api/messages/${msgId}`,);
    expect(delRes.ok,).toBe(true,);

    const getRes = await api.get<{ visibility: string }>(`/api/messages/${msgId}`,);
    expect(getRes.ok,).toBe(true,);
    expect(getRes.data!.visibility,).toBe("hidden_by_user",);
  });

  test("Deleting an already-deleted message is idempotent or 4xx (not 5xx)", async () => {
    const createRes = await api.post<{ id: string }>(`/api/chats/${SEED.chat.id}/messages`, {
      content: "double-delete",
      role: "user",
    },);
    const msgId = createRes.data!.id;

    await api.del(`/api/messages/${msgId}`,);
    const res = await api.del(`/api/messages/${msgId}`,);
    expect(res.status,).toBeLessThan(500,);
  });

  // ── Raw content preservation (sanitization is render-time) ──

  test("Raw HTML/script content is preserved verbatim in the DB row", async () => {
    const xss = `<script>alert('xss-${Date.now()}');</script>`;
    const res = await api.post(`/api/chats/${SEED.chat.id}/messages`, {
      content: xss,
      role: "user",
    },);
    expect(res.ok,).toBe(true,);

    const list = await api.get<{ data: Array<{ content: string }> }>(`/api/chats/${SEED.chat.id}/messages`,);
    expect(list.ok,).toBe(true,);
    const found = list.data!.data.find((m,) => m.content === xss);
    expect(found,).toBeTruthy();
  });
});
