// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** List-envelope shape returned by GET /api/v1/sessions. */
interface SessionList {
  data: { id: string; isCurrent: boolean }[];
}

/**
 * Resource contract: this file OWNS one createTestServer instance (random
 * port, per-file :memory: DB) created in beforeAll and closed in afterAll.
 * Every test logs in a FRESH client (own session + CSRF binding — switch
 * rotates server-side session state, so sharing a client across tests would
 * order-couple them) and fixture rows use unique "e2e-*" ids.
 */
describe("Sessions Management E2E", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    await seedUsers(server.db,);
  },);

  afterAll(async () => {
    await server.close();
  },);

  /** Fresh logged-in client — one session per test, never shared. */
  async function loginFresh(): Promise<ApiClient> {
    const client = createClient(server.url,);
    await client.loginAs(SEED.user.username, SEED.user.password,);
    return client;
  }

  /**
   * Insert a device-session fixture row for the seeded user. `expiresAt`
   * defaults to +24h; pass a past date to mint an expired row.
   */
  async function insertDeviceSession(id: string, expiresAt?: Date,): Promise<void> {
    await server.db
      .insertInto("sessions",)
      .values({
        id,
        user_id: SEED.user.id,
        secret_hash: `fixture-hash-${id}`,
        ip: "127.0.0.1",
        user_agent: "E2E Fixture Device/1.0",
        expires_at: (expiresAt ?? new Date(Date.now() + 86_400_000,)).toISOString(),
      },)
      .execute();
  }

  test("lists sessions including the current one", async () => {
    const api = await loginFresh();

    const res = await api.get<SessionList>("/api/v1/sessions",);
    expect(res.ok,).toBe(true,);
    expect(res.data!.data.length,).toBeGreaterThanOrEqual(1,);
    expect(res.data!.data.some((s,) => s.isCurrent),).toBe(true,);
  });

  test("revokes a second device session", async () => {
    const api = await loginFresh();
    await insertDeviceSession("e2e-sessions-del",);

    const before = await api.get<SessionList>("/api/v1/sessions",);
    expect(before.data!.data.some((s,) => s.id === "e2e-sessions-del"),).toBe(true,);

    const del = await api.del("/api/v1/sessions/e2e-sessions-del",);
    expect(del.status,).toBe(204,);

    const after = await api.get<SessionList>("/api/v1/sessions",);
    expect(after.data!.data.some((s,) => s.id === "e2e-sessions-del"),).toBe(false,);
  });

  test("switch to a live device session succeeds", async () => {
    const api = await loginFresh();
    await insertDeviceSession("e2e-sessions-switch",);

    const res = await api.post("/api/v1/sessions/e2e-sessions-switch/switch",);
    expect(res.status,).toBe(200,);
  });

  test("switch to an expired device session returns 410", async () => {
    const api = await loginFresh();
    await insertDeviceSession("e2e-sessions-expired", new Date(Date.now() - 3_600_000,),);

    const res = await api.post("/api/v1/sessions/e2e-sessions-expired/switch",);
    expect(res.status,).toBe(410,);
  });

  test("deleting the current session is rejected", async () => {
    const api = await loginFresh();

    const list = await api.get<SessionList>("/api/v1/sessions",);
    const current = list.data!.data.find((s,) => s.isCurrent);
    expect(current,).toBeDefined();

    const del = await api.del(`/api/v1/sessions/${current!.id}`,);
    expect(del.status,).toBe(400,);
  });
});
