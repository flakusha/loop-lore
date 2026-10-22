// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Export route identity and authorization.
 *
 * The bulk export (POST /api/v1/export) and the SSE export job
 * (POST /api/v1/export/progress) must be owned by the identity the global
 * auth derive already resolved. A session token that does not resolve is a
 * client error (401) - never a downgrade to the admin-equivalent solo
 * identity, and never another user's archive.
 *
 * Sessions are minted directly (a sessions row + a signed JWT) instead of
 * through POST /api/v1/auth/login: the login rate limiter is process-global
 * and keyed by IP, so a login here would spend budget other e2e files need.
 *
 * See BUG-resolveuseridfromrequest-missing-user-status-check.
 */

import { signJwt, } from "@/auth/jwt";
import { ActorType, AgentType, UserRole, UserStatus, } from "@/db/enums";
import { mintCsrfToken, } from "@/middleware/csrf";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import JSZip from "jszip";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, loadTestConfig, type TestServer, } from "../helpers/server";
import { createTestSession, type TestSession, } from "../helpers/session";

/** A token that no session row can resolve. */
const UNRESOLVABLE_TOKEN = "e2e-export-token-that-resolves-to-nothing";

/**
 * Mint the CSRF pair for an unauthenticated request.
 *
 * An unauthenticated request is bound to `anonymous::<requestId>`, so the
 * token must be minted with the SAME request id the POST will carry.
 * @param baseUrl
 * @param requestId
 * @param tokenCookie the ll_token value presented while minting
 * @returns the csrf_token value
 */
async function mintAnonymousCsrf(
  baseUrl: string,
  requestId: string,
  tokenCookie: string = UNRESOLVABLE_TOKEN,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/health`, {
    headers: {
      "X-Request-Id": requestId,
      Cookie: `ll_token=${tokenCookie}`,
    },
  },);

  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const raw = cookies.find((cookie,) => cookie.startsWith("csrf_token=",));
  const token = raw?.slice("csrf_token=".length,).split(";",)[0];
  if (!token) { throw new Error("server did not issue a csrf_token cookie",); }

  return token;
}

/**
 * Decode the claims of a JWT so a test can mint a variant of it.
 * @param token
 * @returns the payload claims
 */
function decodeClaims(token: string,): { sub: string; role: string; sid: string } {
  const payload = token.split(".",)[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url",).toString("utf8",),) as {
    sub: string;
    role: string;
    sid: string;
  };
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
  let user: TestSession;
  let admin: TestSession;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db,);
    user = await createTestSession(server.db, SEED.user.id, UserRole.User,);
    admin = await createTestSession(server.db, SEED.admin.id, UserRole.Admin,);
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
    const res = await postExport(server, {
      "X-CSRF-Token": user.csrf,
      Cookie: `ll_token=${user.token}; csrf_token=${user.csrf}`,
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
    // No ll_token cookie: the identity comes from the Authorization header.
    const res = await postExport(server, {
      "X-CSRF-Token": user.csrf,
      Authorization: `Bearer ${user.token}`,
      Cookie: `csrf_token=${user.csrf}`,
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
    // No stream, no archive, no row of the seeded user's data.
    expect(await res.text(),).not.toContain("E2E Test Chat",);
  });

  test("POST /api/v1/export rejects an expired session token", async () => {
    const claims = decodeClaims(user.token,);
    // The session id is LIVE - only the token's own expiry can reject this.
    const expired = await signJwt({
      secret: loadTestConfig().auth.jwtSecret ?? "",
      userId: claims.sub,
      role: claims.role,
      sessionId: claims.sid,
      expiresInSeconds: -60,
    },);

    const requestId = "e2e-export-expired-token";
    const csrf = await mintAnonymousCsrf(server.url, requestId, expired,);

    const res = await postExport(server, {
      "X-Request-Id": requestId,
      "X-CSRF-Token": csrf,
      Cookie: `ll_token=${expired}; csrf_token=${csrf}`,
    },);

    expect(res.status,).toBe(401,);
    expect(res.headers.get("content-type",),).not.toContain("application/zip",);
    expect(await res.text(),).not.toContain("E2E Test Chat",);
  });

  test("POST /api/v1/export rejects a session token signed with another secret", async () => {
    const claims = decodeClaims(user.token,);
    // Live session id, valid claims, wrong signing key.
    const forged = await signJwt({
      secret: `${loadTestConfig().auth.jwtSecret ?? ""}-forged`,
      userId: claims.sub,
      role: claims.role,
      sessionId: claims.sid,
      expiresInSeconds: 3600,
    },);

    const requestId = "e2e-export-forged-token";
    const csrf = await mintAnonymousCsrf(server.url, requestId, forged,);

    const res = await postExport(server, {
      "X-Request-Id": requestId,
      "X-CSRF-Token": csrf,
      Cookie: `ll_token=${forged}; csrf_token=${csrf}`,
    },);

    expect(res.status,).toBe(401,);
    expect(res.headers.get("content-type",),).not.toContain("application/zip",);
    expect(await res.text(),).not.toContain("E2E Test Chat",);
  });

  test("POST /api/v1/export rejects a session whose user was deactivated", async () => {
    try {
      await server.db
        .updateTable("users",)
        .set({ status: UserStatus.Deactivated, },)
        .where("id", "=", SEED.admin.id,)
        .execute();

      // A deactivated user fails the auth derive, so the request is bound to
      // `anonymous::<requestId>` - the session's own CSRF token no longer
      // verifies. Mint one for this request id.
      const requestId = "e2e-export-deactivated-user";
      const secret = loadTestConfig().auth.csrfSecret || loadTestConfig().auth.jwtSecret || "";
      const csrf = mintCsrfToken(secret, `anonymous::${requestId}`, {},);

      const res = await postExport(server, {
        "X-Request-Id": requestId,
        "X-CSRF-Token": csrf,
        Cookie: `ll_token=${admin.token}; csrf_token=${csrf}`,
      },);

      expect(res.status,).toBe(401,);
      expect(res.headers.get("content-type",),).not.toContain("application/zip",);
    } finally {
      await server.db
        .updateTable("users",)
        .set({ status: UserStatus.Active, },)
        .where("id", "=", SEED.admin.id,)
        .execute();
    }
  });

  test("POST /api/v1/export contains only the requesting user's data", async () => {
    // A character owned by the OTHER seeded user. The export must scope by
    // the acting user, not by "whoever has data".
    await server.db
      .insertInto("actors",)
      .values({
        id: "a0000009-0000-4000-a000-000000000009",
        actor_type: ActorType.Character,
        display_name: "Admin Only Character",
        user_id: SEED.admin.id,
        owner_id: SEED.admin.id,
        agent_type: AgentType.Ai,
        description: "Belongs to the admin user only",
        system_prompt: "Admin only.",
        settings: "{}",
        import_spec: "raw",
      },)
      .execute();

    const mine = await postExport(server, {
      "X-CSRF-Token": user.csrf,
      Cookie: `ll_token=${user.token}; csrf_token=${user.csrf}`,
    },);

    expect(mine.status,).toBe(200,);
    const mineFiles = await parseZip(mine,);
    expect(mineFiles["chats/e2e_test_chat.json"],).toBeDefined();
    expect(mineFiles["characters/e2e_test_character.json"],).toBeDefined();
    // The other user's character is not in the caller's archive.
    expect(Object.values(mineFiles,).join("\n",),).not.toContain("Admin Only Character",);

    // The admin's own export does contain it, and is attributed to the admin.
    const theirs = await postExport(server, {
      "X-CSRF-Token": admin.csrf,
      Cookie: `ll_token=${admin.token}; csrf_token=${admin.csrf}`,
    },);

    expect(theirs.status,).toBe(200,);
    const theirFiles = await parseZip(theirs,);
    expect(Object.values(theirFiles,).join("\n",),).toContain("Admin Only Character",);
    const theirManifest = JSON.parse(theirFiles["manifest.json"] ?? "{}",) as { exported_by?: string };
    expect(theirManifest.exported_by,).toBe(SEED.admin.id,);
  });
});
