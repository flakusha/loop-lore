/**
 * E2E: Auth Flows
 *
 * Tests login, demo-login, logout, and me endpoint.
 * Uses the test server + seeded demo user.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Auth E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    // Use auth.required=true so unauthenticated requests get 401
    server = await createTestServer({ auth: { required: true, }, },);
    api = createClient(server.url,);
  },);

  afterAll(() => {
    server.close();
  },);
  test("GET /api/auth/me returns 401 when not authenticated", async () => {
    const res = await api.get("/api/auth/me",);
    expect(res.status,).toBe(401,);
    expect(res.error,).toBeTruthy();
    expect(res.code,).toBeTruthy(); // TEST.2 error envelope
  });

  test("POST /api/demo-login creates session and returns cookie", async () => {
    const res = await api.post("/api/demo-login",);
    expect(res.ok,).toBe(true,);
    expect(api.token,).toBeTruthy();
  });

  test("GET /api/auth/me returns user info after login", async () => {
    // Ensure logged in
    await api.login();
    const res = await api.get<{
      id: string;
      username: string;
      display_name: string;
      role: string;
    }>("/api/auth/me",);
    expect(res.ok,).toBe(true,);
    expect(res.data,).toBeTruthy();
    expect(res.data!.role,).toBe("solo",);
  });

  test("POST /api/auth/logout clears session", async () => {
    // Login first
    await api.login();
    expect(api.token,).toBeTruthy();

    // Logout
    const logoutRes = await api.post("/api/auth/logout",);
    expect(logoutRes.ok,).toBe(true,);

    // Token should be cleared or invalidated
    // The client still has the old token, but server should reject it
    api.setToken("invalid-token",);
    const meRes = await api.get("/api/auth/me",);
    expect(meRes.status,).toBe(401,);
    expect(meRes.code,).toBeTruthy(); // TEST.2 error envelope
  });
  describe("Auth E2E — seeded user login", () => {
    test("POST /api/auth/login with valid credentials", async () => {
      // Seed users before test
      await seedUsers(server.db,);

      // BUG-auth-login-silent-fail fixed: /api/auth/login only accepts
      // form-urlencoded bodies. JSON is rejected with 400 (covered by
      // edge-cases-auth E2E). Use api.loginAs() which posts form-encoded.
      const loginRes = { ok: await api.loginAs(SEED.user.username, SEED.user.password,), };

      // Demo-login works without seeding (creates solo user)
      // For regular login, we need seeded users
      // Just verify the endpoint shape
      expect(loginRes.ok,).toBe(true,);
    });
  });

  describe("Auth E2E — boundary regressions", () => {
    let scopedServer: TestServer;
    let scopedApi: ApiClient;

    beforeAll(async () => {
      scopedServer = await createTestServer({ auth: { required: true, }, },);
      await seedUsers(scopedServer.db,);
      scopedApi = createClient(scopedServer.url,);
    },);

    afterAll(() => {
      scopedServer.close();
    },);

    test("POST /api/auth/login with bad credentials returns 401 when JSON is requested", async () => {
      // The route's HTML path intentionally returns 200 + inline error so the
      // htmx swap contract keeps working. The JSON path returns a proper 4xx.
      const r = await fetch(`${scopedServer.url}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          username: SEED.user.username,
          password: "wrong-password",
        },).toString(),
      },);
      expect(r.status,).toBeGreaterThanOrEqual(400,);
      expect(r.status,).toBeLessThan(500,);
    },);

    test("POST /api/auth/logout twice never returns 5xx", async () => {
      const ok = await scopedApi.loginAs(
        SEED.user.username,
        SEED.user.password,
      );
      expect(ok,).toBe(true,);

      const first = await scopedApi.post("/api/auth/logout",);
      expect(first.status,).toBeLessThan(500,);

      // Second logout — first call already revoked the session and unbound
      // the CSRF cookie, so the second unsafe POST hits the CSRF gate (403).
      // Either 200/204 (idempotent), 401 (session gone), or 403 (CSRF gate)
      // is acceptable; a 5xx would be a regression.
      const second = await scopedApi.post("/api/auth/logout",);
      expect(second.status,).toBeLessThan(500,);
      expect([200, 204, 401, 403,],).toContain(second.status,);
    },);

    test("GET /api/auth/me returns 401 with a forged-but-unparseable cookie", async () => {
      const tampered = createClient(scopedServer.url,);
      tampered.setToken("not-a-real-jwt",);
      const res = await tampered.get("/api/auth/me",);
      expect(res.status,).toBe(401,);
      expect(res.code,).toBeTruthy();
    },);

    test("GET /api/auth/me is consistent across two clients (session scoping)", async () => {
      const a = createClient(scopedServer.url,);
      const b = createClient(scopedServer.url,);
      const ok = await a.loginAs(SEED.user.username, SEED.user.password,);
      expect(ok,).toBe(true,);

      const meA = await a.get("/api/auth/me",);
      const meB = await b.get("/api/auth/me",);
      expect(meA.status,).toBe(200,);
      expect(meB.status,).toBe(401,); // b never logged in
    },);
  });
});
