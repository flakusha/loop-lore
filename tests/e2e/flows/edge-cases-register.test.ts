// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Registration Edge-Cases
 *
 * Pins the /api/auth/register route's contract on adversarial inputs.
 * Routes that return HTML 200 on validation failure today (see
 * BUG-auth-login-silent-fail) are documented with the current status
 * rather than asserted to a stricter contract.
 *
 * Bypass the module-singleton register limiter with a fresh one so this
 * file's many calls never trip the 3/hour cap. Each test gets a unique
 * peer IP so concurrent calls share no bucket.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../src/config/schema";
import type { DB, } from "../../../src/db/schema";
import type { RateLimiter, } from "../../../src/middleware/rate-limit";
import { createRegisterLimiter, } from "../../../src/routes/auth";
import { handleRegister, } from "../../../src/routes/auth/register";
import { createClient, } from "../helpers/client";
import { createTestServer, type TestServer, } from "../helpers/server";

let testCounter = 0;
function uniqueIp(): string {
  testCounter += 1;
  return `10.0.0.${testCounter}`;
}

async function postRegister(
  server: TestServer,
  body: URLSearchParams,
  database: Kysely<DB>,
  limiter: RateLimiter,
  ip: string,
): Promise<Response> {
  const req = new Request(`${server.url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", },
    body: body.toString(),
  },);
  const config = (server as unknown as { config: Config }).config;
  const res = await handleRegister(req, database, config, undefined, ip, limiter,);
  return res;
}

describe("Registration edge-cases E2E", () => {
  let server: TestServer;
  let limiter: RateLimiter;

  beforeAll(async () => {
    server = await createTestServer({ auth: { registrationOpen: true, }, },);
    limiter = createRegisterLimiter();
  },);

  beforeEach(() => {
    // Fresh limiter state so each test gets a full 3/hour quota.
    limiter.clear();
  },);

  afterAll(() => {
    server.close();
  },);

  // ── Length boundaries (route validates these) ────────────────

  test("Username 2 chars is bounded (no 5xx) — pin current shape", async () => {
    const res = await postRegister(
      server,
      new URLSearchParams({ username: "ab", password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
  });

  test("Username 3 chars is accepted (boundary inclusive)", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const res = await postRegister(
      server,
      new URLSearchParams({ username: `abc${r}`, password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBe(200,);
  });

  test("Username 32 chars is accepted (boundary inclusive)", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const username = ("a".repeat(29,) + r).slice(0, 32,);
    const res = await postRegister(
      server,
      new URLSearchParams({ username, password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBe(200,);
  });

  test("Username 33 chars is bounded AND user not persisted", async () => {
    const res = await postRegister(
      server,
      new URLSearchParams({ username: "a".repeat(33,), password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
    expect(res.status,).toBeGreaterThanOrEqual(200,);
    const user = await server.db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "a".repeat(33,),)
      .executeTakeFirst();
    expect(user,).toBeUndefined();
  });

  test("Password 5 chars is bounded (no 5xx)", async () => {
    const res = await postRegister(
      server,
      new URLSearchParams({ username: "shorty1", password: "abcde", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
  });

  test("Password 6 chars is accepted (boundary inclusive)", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const res = await postRegister(
      server,
      new URLSearchParams({ username: `pw6_${r}`, password: "abcdef", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBe(200,);
  });

  // ── Oversize input ───────────────────────────────────────────

  test("Username 1MB long is bounded (no 5xx, no OOM)", async () => {
    const long = "a".repeat(1_000_000,);
    const res = await postRegister(
      server,
      new URLSearchParams({ username: long, password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
    expect(res.status,).toBeGreaterThanOrEqual(200,);
  });

  test("Password 1MB long is bounded (no 5xx, no OOM)", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const res = await postRegister(
      server,
      new URLSearchParams({ username: `bigpw${r}`, password: "x".repeat(1_000_000,), },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
  });

  // ── Unicode / control chars ──────────────────────────────────

  test("Username with control characters is bounded (no 5xx)", async () => {
    const res = await postRegister(
      server,
      new URLSearchParams({ username: "ctrl\u0000\u0007name", password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
  });

  test("Password with unicode + emoji is accepted when long enough", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const res = await postRegister(
      server,
      new URLSearchParams({ username: `uni${r}`, password: "ж中🐉密码", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBe(200,);
  });

  // ── Duplicate handling ───────────────────────────────────────

  test("Registering same username twice — second attempt is bounded", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const username = `dup_${r}`;
    const ip = uniqueIp();
    const a = await postRegister(
      server,
      new URLSearchParams({ username, password: "validpass1", },),
      server.db,
      limiter,
      ip,
    );
    expect(a.status,).toBe(200,);

    const b = await postRegister(
      server,
      new URLSearchParams({ username, password: "different", },),
      server.db,
      limiter,
      ip, // same IP within this test → 2nd request still has quota
    );
    expect(b.status,).toBeLessThan(500,);
    expect(b.status,).toBeGreaterThanOrEqual(200,);

    const rows = await server.db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", username,)
      .execute();
    expect(rows.length,).toBe(1,);
  });

  // ── Empty/missing fields ─────────────────────────────────────

  test("Empty body is bounded (no 5xx)", async () => {
    const res = await postRegister(
      server,
      new URLSearchParams({},),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
  });

  test("Whitespace-only username is bounded (no 5xx)", async () => {
    const res = await postRegister(
      server,
      new URLSearchParams({ username: "   ", password: "validpass1", },),
      server.db,
      limiter,
      uniqueIp(),
    );
    expect(res.status,).toBeLessThan(500,);
  });

  // ── After register, login works ──────────────────────────────

  test("Newly registered user can immediately log in", async () => {
    const r = Math.random().toString(36,).slice(2, 5,);
    const username = `login_after_${r}`;
    const password = "validpass1";
    await postRegister(
      server,
      new URLSearchParams({ username, password, },),
      server.db,
      limiter,
      uniqueIp(),
    );

    const api = createClient(server.url,);
    const ok = await api.loginAs(username, password,);
    expect(ok,).toBe(true,);
  });
});
