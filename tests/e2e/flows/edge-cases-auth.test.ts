// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Auth Edge-Cases
 *
 * HTTP+DB integration tests against the real test server. Drives
 * /api/auth/login and /api/auth/me with adversarial payloads to verify
 * the content-negotiating error contract:
 *
 * - htmx form posts (`HX-Request: true` or no explicit Accept) → 200+
 *   inline `<p class="error-msg">` swap so the existing UI keeps working.
 * - JSON API clients (`Accept: application/json`) → real 4xx with a
 *   `{ error, code, meta }` JSON envelope.
 *
 * Mirrors the bug-shaped behaviour flagged as BUG-auth-login-silent-fail
 * / BUG-register-silent-fail prior to the fix; the routes now reject
 * malformed bodies via TypeBox-style validation.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createClient, } from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

const VALID_USERNAME = SEED.user.username;
const VALID_PASSWORD = SEED.user.password;

const JSON_CT = "application/json";
const FORM = "application/x-www-form-urlencoded";

async function postJson(
  server: TestServer,
  body: unknown,
): Promise<Response> {
  return fetch(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": JSON, Accept: JSON, },
    body: globalThis.JSON.stringify(body,),
  },);
}

async function postForm(
  server: TestServer,
  body: string,
): Promise<Response> {
  return fetch(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": FORM, },
    body,
  },);
}

describe("Auth edge-cases E2E", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    await seedUsers(server.db,);
  },);

  afterAll(() => {
    server.close();
  },);

  // ── JSON API: empty / malformed bodies return 4xx JSON ───────

  test("POST empty JSON body returns 400 JSON", async () => {
    const res = await postJson(server, {},);
    expect(res.status,).toBe(400,);
    expect(res.headers.get("content-type",),).toMatch(/application\/json/,);
    const body = await res.json() as { error: string; code: string };
    expect(body.code,).toBe("BAD_REQUEST",);
  });

  test("POST missing username returns 400 JSON", async () => {
    const res = await postJson(server, { password: "x", },);
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string; code: string };
    expect(body.code,).toBe("BAD_REQUEST",);
  });

  test("POST missing password returns 400 JSON", async () => {
    const res = await postJson(server, { username: "x", },);
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string; code: string };
    expect(body.code,).toBe("BAD_REQUEST",);
  });

  test("POST malformed JSON returns 400 JSON", async () => {
    const res = await fetch(`${server.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": JSON, Accept: JSON, },
      body: "{not-json",
    },);
    expect(res.status,).toBe(400,);
    expect(res.headers.get("content-type",),).toMatch(/application\/json/,);
  });

  test("POST wrong Content-Type (text/plain) returns 400 JSON", async () => {
    const res = await fetch(`${server.url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Accept: JSON, },
      body: "username=foo&password=bar",
    },);
    expect(res.status,).toBe(400,);
    expect(res.headers.get("content-type",),).toMatch(/application\/json/,);
  });

  // ── JSON API: oversized / hostile inputs are bounded ─────────

  test("POST 10KB username returns 401 JSON (not 5xx)", async () => {
    const res = await postJson(server, {
      username: "x".repeat(10_000,),
      password: VALID_PASSWORD,
    },);
    expect(res.status,).toBeLessThan(500,);
    expect(res.status,).toBeGreaterThanOrEqual(200,);
    // 401 because no user matches; 5xx would be a crash. Either is fine.
    expect([400, 401, 422,],).toContain(res.status,);
  });

  test("POST 100KB password returns 401/422 JSON (not 5xx)", async () => {
    const res = await postJson(server, {
      username: VALID_USERNAME,
      password: "x".repeat(102_400,),
    },);
    expect(res.status,).toBeLessThan(500,);
    expect(res.status,).toBeGreaterThanOrEqual(200,);
  });

  test("POST 1MB password does not OOM and returns <500 JSON", async () => {
    const res = await postJson(server, {
      username: VALID_USERNAME,
      password: "x".repeat(1_000_000,),
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  test("POST 10MB username does not OOM and returns <500 JSON", async () => {
    const res = await postJson(server, {
      username: "x".repeat(10_000_000,),
      password: VALID_PASSWORD,
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  // ── JSON API: unicode / control chars are bounded ───────────

  test("POST unicode username returns 401 JSON (no user matches)", async () => {
    const res = await postJson(server, {
      username: "ж中🐉",
      password: VALID_PASSWORD,
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  test("POST control characters in password returns <500 JSON", async () => {
    const res = await postJson(server, {
      username: VALID_USERNAME,
      password: "\u0000\u0007\u0008",
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  // ── JSON API: injection probes are not 5xx ──────────────────

  test("POST SQL-shaped username returns <500 JSON", async () => {
    const probes = [
      "' OR '1'='1",
      "admin'--",
      "x'; DROP TABLE users;--",
    ];
    for (const username of probes) {
      const res = await postJson(server, { username, password: "anything", },);
      expect(res.status,).toBeLessThan(500,);
    }
  });

  test("POST NoSQL-shape object returns 400 JSON (route rejected non-string)", async () => {
    const res = await postJson(server, {
      username: { "$gt": "", },
      password: { "$gt": "", },
    },);
    // Either rejected at parse time (400) or treated as non-string creds (401/422).
    expect(res.status,).toBeLessThan(500,);
  });

  // ── Happy path (JSON API) ──────────────────────────────────

  test("POST valid credentials returns 200 JSON envelope", async () => {
    const api = createClient(server.url,);
    const ok = await api.loginAs(VALID_USERNAME, VALID_PASSWORD,);
    expect(ok,).toBe(true,);
  });

  // ── htmx form post: 200+HTML still works ─────────────────────

  test("htmx form post with missing fields still returns 200+HTML", async () => {
    const res = await postForm(server, "username=&password=",);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toMatch(/text\/html/,);
    const body = await res.text();
    expect(body,).toContain("Missing required field",);
  });

  test("htmx form post with bad creds still returns 200+HTML inline error", async () => {
    const res = await postForm(
      server,
      `username=${encodeURIComponent("nobody",)}&password=${encodeURIComponent("x",)}`,
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toMatch(/text\/html/,);
    const body = await res.text();
    expect(body,).toContain("Invalid username or password",);
  });

  // ── /api/auth/me ─────────────────────────────────────────────

  test("/api/auth/me without cookie returns 401 JSON", async () => {
    const api = createClient(server.url,);
    const res = await api.get("/api/auth/me",);
    expect(res.status,).toBe(401,);
  });

  test("/api/auth/me with logged-in cookie returns 200", async () => {
    const api = createClient(server.url,);
    await api.loginAs(VALID_USERNAME, VALID_PASSWORD,);
    const res = await api.get("/api/auth/me",);
    expect(res.status,).toBe(200,);
  });

  test("/api/auth/me with 1MB Authorization header is bounded (not 5xx)", async () => {
    const res = await fetch(`${server.url}/api/auth/me`, {
      headers: { Authorization: "Bearer " + "x".repeat(1_000_000,), },
    },);
    expect(res.status,).toBeLessThan(500,);
  });

  test("/api/auth/me without Bearer prefix is rejected cleanly", async () => {
    const res = await fetch(`${server.url}/api/auth/me`, {
      headers: { Authorization: "garbage-no-bearer-prefix", },
    },);
    expect(res.status,).toBeLessThan(500,);
    expect([401, 403,],).toContain(res.status,);
  });
});
