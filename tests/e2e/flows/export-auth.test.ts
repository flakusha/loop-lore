// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Export route identity
 *
 * The bulk export (POST /api/v1/export) and the SSE export job
 * (POST /api/v1/export/progress) must be owned by the identity the global
 * auth derive already resolved. A session token that does not resolve is a
 * client error (401) - never a downgrade to the admin-equivalent solo
 * identity, and never another user's archive.
 *
 * See BUG-resolveuseridfromrequest-missing-user-status-check.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import JSZip from "jszip";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** A token that no session row can resolve. */
const UNRESOLVABLE_TOKEN = "e2e-export-token-that-resolves-to-nothing";

/**
 * Mint the CSRF pair for an unauthenticated request.
 *
 * An unauthenticated request is bound to `anonymous::<requestId>`, so the
 * token must be minted with the SAME request id the POST will carry.
 * @param baseUrl
 * @param requestId
 * @returns the csrf_token value
 */
async function mintAnonymousCsrf(baseUrl: string, requestId: string,): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/health`, {
    headers: {
      "X-Request-Id": requestId,
      Cookie: `ll_token=${UNRESOLVABLE_TOKEN}`,
    },
  },);

  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const raw = cookies.find((cookie,) => cookie.startsWith("csrf_token=",));
  const token = raw?.slice("csrf_token=".length,).split(";",)[0];
  if (!token) { throw new Error("server did not issue a csrf_token cookie",); }

  return token;
}

/**
 * Read every file of a ZIP archive.
 * @param res
 * @returns the archive entries keyed by path
 */
async function parseZip(res: Response,): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await res.arrayBuffer(),);
  const files: Record<string, string> = {};
  await Promise.all(
    Object.keys(zip.files,).map(async (path,) => {
      const file = zip.files[path];
      if (file && !file.dir) { files[path] = await file.async("text",); }
    },),
  );

  return files;
}

/**
 * POST the bulk export with an explicit cookie/authorization header set.
 * @param server
 * @param headers
 * @returns the raw response
 */
function postExport(server: TestServer, headers: Record<string, string>,): Promise<Response> {
  return fetch(`${server.url}/api/v1/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers, },
    body: JSON.stringify({ include: ["chats", "characters",], },),
  },);
}

describe("Export identity E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db,);
    api = createClient(server.url,);
  },);

  afterAll(async () => {
    await server.close();
  },);

  test("POST /api/v1/export rejects a session token that does not resolve", async () => {
    const requestId = "e2e-export-unresolvable-token";
    const csrf = await mintAnonymousCsrf(server.url, requestId,);

    const res = await postExport(server, {
      "X-Request-Id": requestId,
      "X-CSRF-Token": csrf,
      Cookie: `ll_token=${UNRESOLVABLE_TOKEN}; csrf_token=${csrf}`,
    },);

    expect(res.status,).toBe(401,);
    expect(res.headers.get("content-type",),).not.toContain("application/zip",);
    const body = await res.text();
    // No archive, and no row of the seeded user's data.
    expect(body,).not.toContain("E2E Test Chat",);
  });

  test("POST /api/v1/export returns the session owner's archive", async () => {
    expect(await api.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);

    const res = await postExport(server, {
      "X-CSRF-Token": api.csrfToken ?? "",
      Cookie: `ll_token=${api.token ?? ""}; csrf_token=${api.csrfToken ?? ""}`,
    },);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/zip",);

    const files = await parseZip(res,);
    expect(files["chats/e2e_test_chat.json"],).toBeDefined();
    expect(files["characters/e2e_test_character.json"],).toBeDefined();

    const manifest = JSON.parse(files["manifest.json"] ?? "{}",) as { exported_by?: string };
    expect(manifest.exported_by,).toBe(SEED.user.id,);
  });

  test("POST /api/v1/export with a bearer token exports the bearer user's archive", async () => {
    expect(await api.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);

    // No ll_token cookie: the identity comes from the Authorization header.
    const res = await postExport(server, {
      "X-CSRF-Token": api.csrfToken ?? "",
      Authorization: `Bearer ${api.token ?? ""}`,
      Cookie: `csrf_token=${api.csrfToken ?? ""}`,
    },);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/zip",);

    const files = await parseZip(res,);
    expect(files["chats/e2e_test_chat.json"],).toBeDefined();

    const manifest = JSON.parse(files["manifest.json"] ?? "{}",) as { exported_by?: string };
    expect(manifest.exported_by,).toBe(SEED.user.id,);
  });

  test("POST /api/v1/export/progress rejects a session token that does not resolve", async () => {
    const requestId = "e2e-export-sse-unresolvable-token";
    const csrf = await mintAnonymousCsrf(server.url, requestId,);

    const res = await fetch(`${server.url}/api/v1/export/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        "X-CSRF-Token": csrf,
        Cookie: `ll_token=${UNRESOLVABLE_TOKEN}; csrf_token=${csrf}`,
      },
      body: JSON.stringify({ include: ["chats",], },),
    },);

    expect(res.status,).toBe(401,);
    expect(res.headers.get("content-type",),).not.toContain("text/event-stream",);
    await res.body?.cancel();
  });
});
