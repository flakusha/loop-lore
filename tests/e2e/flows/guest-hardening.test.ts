// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guest hardening e2e smoke (epic-guest-access Phase 4):
 * fresh multi-user server -> guest public read under the per-IP limit
 * succeeds and is audited -> repeats past the limit get 429 + Retry-After
 * (not audited) -> a registered user on the same route is unaffected and
 * writes no audit rows.
 */
import { ChatMode, ChatType, } from "@/db/enums";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

const GUEST_LIMIT = 2;
const CHAT_ID = "b0000071-0000-4000-a000-000000000000";

describe("guest hardening smoke (per-IP limiter + audit rows)", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({
      auth: {
        required: true,
        guestAccess: true,
        guestReadLimit: GUEST_LIMIT,
        guestReadWindowSec: 60,
      },
    },);

    await seedUsers(server.db,);
    await server.db
      .insertInto("chats",)
      .values({
        id: CHAT_ID,
        name: "Public Smoke Chat",
        type: ChatType.Direct,
        mode: ChatMode.Story,
        created_by: SEED.user.id,
        visibility: "public",
      },)
      .execute();

    api = createClient(server.url,);
  },);

  afterAll(async () => {
    await server.close();
  },);

  async function auditRowCount(): Promise<number> {
    const rows = await server.db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "guest.read",)
      .execute();

    return rows.length;
  }

  test("guest public read under the limit succeeds and is audited", async () => {
    const res = await api.get(`/api/v1/chats/${CHAT_ID}`,);
    expect(res.status,).toBe(200,);

    const rows = await server.db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "guest.read",)
      .execute();

    expect(rows.length,).toBe(1,);
    expect(rows[0]!.request_id,).toBeTruthy();
    // No invented identity: the guest tier has no user row.
    expect(rows[0]!.user_id,).toBeNull();
    const meta = JSON.parse(rows[0]!.meta!,) as Record<string, unknown>;
    expect(meta,).toMatchObject({
      userRole: "guest",
      route: `/api/v1/chats/${CHAT_ID}`,
      targetId: CHAT_ID,
    },);
  });

  test("repeating past the per-IP limit gets 429 with Retry-After", async () => {
    // Second served read fills the budget of 2…
    expect((await api.get(`/api/v1/chats/${CHAT_ID}`,)).status,).toBe(200,);
    // …the third is blocked, via a raw cookie-less request so the 429
    // headers are inspectable (the client collapses them).
    const raw = await fetch(`${server.url}/api/v1/chats/${CHAT_ID}`,);
    expect(raw.status,).toBe(429,);
    expect(raw.headers.get("Retry-After",),).toBeTruthy();

    // 429 rejections are not audited: rows still count served reads only.
    expect(await auditRowCount(),).toBe(GUEST_LIMIT,);
  });

  test("registered user on the same route is unaffected and unaudited", async () => {
    expect(await api.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);
    for (let i = 0; i < GUEST_LIMIT + 2; i++) {
      expect((await api.get(`/api/v1/chats/${CHAT_ID}`,)).status,).toBe(200,);
    }

    expect(await auditRowCount(),).toBe(GUEST_LIMIT,);
  });
});
