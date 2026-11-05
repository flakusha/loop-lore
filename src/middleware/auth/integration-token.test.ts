// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/middleware/auth/integration-token.test.ts — the integration-token
// verification seam (ADR-credentials-issuer-model, admin-scoped slice).
//
// Covers: mint format + hash properties; fail-closed verification (unknown,
// revoked, expired, corrupt-expiry rows); the off-surface rejection; the
// external-agent context shape (SUBJECT BINDING: userId = issuing admin,
// userRole null so the token never inherits RBAC); authenticateRequest's
// no-solo-downgrade rule for a presented llri_ bearer.
//
// Resource contract: one :memory: SQLite via createTestDb, no ports, no env,
// no sleeps (expiry uses explicit past instants, not timers).

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../../config/schema/auth";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertIntegrationTokens, insertUsers, } from "../../test-utils/insert-helpers";
import { authenticateRequest, } from "./authenticate-request";
import {
  hashIntegrationToken,
  INTEGRATION_TOKEN_PREFIX,
  integrationTokenContext,
  mintIntegrationToken,
  resolveIntegrationTokenAuth,
  verifyIntegrationToken,
} from "./integration-token";

const ISSUER = "it-issuer-admin";

const JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";

/** required:true deployment — token clients only. */
const REQUIRED_CONFIG = {
  required: true,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
  jwtSecret: JWT_SECRET,
  legacyOpaqueTokenFallback: false,
} as const satisfies AuthConfig;

/** Solo mode (app default) — the downgrade a presented token must NOT get. */
const SOLO_CONFIG = { ...REQUIRED_CONFIG, required: false, } as const satisfies AuthConfig;

let testDb: TestDb;
let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, ISSUER, "Issuer Admin", { id: ISSUER, },);
},);

afterAll(async () => {
  await destroyTestDb(testDb,);
},);

/** Seed a token row and return its RAW bearer value. */
async function seedToken(opts: {
  scopes?: "read" | "chat-write";
  revokedAt?: string;
  expiresAt?: string | null;
  name?: string;
} = {},): Promise<string> {
  const { raw, hash, } = mintIntegrationToken();
  await insertIntegrationTokens(db, opts.name ?? "agent-token", hash, opts.scopes ?? "read", ISSUER, {
    revoked_at: opts.revokedAt ?? null,
    expires_at: opts.expiresAt ?? null,
  },);

  return raw;
}

function bearer(value: string | null, pathname = "/api/v1/integrations/chat.send",): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: value === null ? {} : { authorization: `Bearer ${value}`, },
  },);
}

describe("mintIntegrationToken", () => {
  test("mints llri_-prefixed urlsafe base64 with 256-bit entropy", () => {
    const { raw, hash, } = mintIntegrationToken();
    expect(raw.startsWith(INTEGRATION_TOKEN_PREFIX,),).toBe(true,);
    const secretPart = raw.slice(INTEGRATION_TOKEN_PREFIX.length,);
    expect(secretPart.length,).toBe(43,); // 32 bytes -> unpadded base64url
    expect(secretPart,).toMatch(/^[A-Za-z0-9_-]+$/,);
    expect(hash,).toMatch(/^[0-9a-f]{64}$/,);
  });

  test("hashes are stable per value and distinct across mints", () => {
    const a = mintIntegrationToken();
    const b = mintIntegrationToken();
    expect(hashIntegrationToken(a.raw,),).toBe(a.hash,);
    expect(hashIntegrationToken(b.raw,),).toBe(b.hash,);
    expect(a.hash === b.hash,).toBe(false,);
  });
});

describe("verifyIntegrationToken — fail-closed", () => {
  test("a live row resolves to the token attribution", async () => {
    const raw = await seedToken({ scopes: "chat-write", name: "live-token", },);
    const resolved = await verifyIntegrationToken(db, raw,);
    expect(resolved,).not.toBeNull();
    expect(resolved!.scopes,).toBe("chat-write",);
    expect(resolved!.issuerAdminUserId,).toBe(ISSUER,);
  });

  test("first use stamps last_used_at on a NULL row (NULL < x never matches)", async () => {
    const raw = await seedToken({ name: "stamp-token", },);
    const id = await db
      .selectFrom("integration_tokens",)
      .select("id",)
      .where("token_hash", "=", hashIntegrationToken(raw,),)
      .executeTakeFirst();

    expect(
      (await db.selectFrom("integration_tokens",).select("last_used_at",).where("id", "=", id!.id,).executeTakeFirst())!
        .last_used_at,
    ).toBeNull();

    expect(await verifyIntegrationToken(db, raw,),).not.toBeNull();

    const after = await db.selectFrom("integration_tokens",).select("last_used_at",).where("id", "=", id!.id,)
      .executeTakeFirst();

    expect(after!.last_used_at,).not.toBeNull();
  });

  test("an unknown bearer is null (hash miss)", async () => {
    expect(await verifyIntegrationToken(db, `${INTEGRATION_TOKEN_PREFIX}not-a-real-token`,),).toBeNull();
  });

  test("a revoked row is null — revocation is the row value, fail closed", async () => {
    const raw = await seedToken({ revokedAt: new Date().toISOString(), },);
    expect(await verifyIntegrationToken(db, raw,),).toBeNull();
  });

  test("an expired row is null", async () => {
    const raw = await seedToken({ expiresAt: new Date(Date.now() - 1000,).toISOString(), },);
    expect(await verifyIntegrationToken(db, raw,),).toBeNull();
  });

  test("a NULL expires_at never expires (open ADR lifetime question)", async () => {
    const raw = await seedToken({ expiresAt: null, },);
    expect(await verifyIntegrationToken(db, raw,),).not.toBeNull();
  });

  test("a CORRUPT (unparseable) expires_at fails closed, never eternal", async () => {
    const raw = await seedToken({ expiresAt: "not-a-date", },);
    expect(await verifyIntegrationToken(db, raw,),).toBeNull();
  });
});

describe("resolveIntegrationTokenAuth — branch routing", () => {
  test("no bearer defers to the JWT chain", async () => {
    expect((await resolveIntegrationTokenAuth({ request: bearer(null,), database: db, },)).kind,).toBe(
      "not-integration-token",
    );
  });

  test("a JWT-shaped bearer defers to the JWT chain (prefix gate)", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.e30.signature";
    expect((await resolveIntegrationTokenAuth({ request: bearer(jwt,), database: db, },)).kind,).toBe(
      "not-integration-token",
    );
  });

  test("an llri_ bearer OFF the integration surface is rejected as off-surface", async () => {
    const raw = await seedToken();
    const result = await resolveIntegrationTokenAuth({
      request: bearer(raw, "/api/v1/chats",),
      database: db,
    },);

    expect(result,).toEqual({ kind: "rejected", reason: "off-surface", },);
  });

  test("an llri_ bearer on a WEBHOOK path is rejected as off-surface too", async () => {
    // Webhook receivers authorize via their own in-handler HMAC proof; a
    // token principal has no business presenting there.
    const raw = await seedToken();
    const result = await resolveIntegrationTokenAuth({
      request: bearer(raw, "/api/v1/integrations/webhooks/discord",),
      database: db,
    },);

    expect(result,).toEqual({ kind: "rejected", reason: "off-surface", },);
  });

  test("an unknown llri_ bearer on-surface is rejected as unknown", async () => {
    const result = await resolveIntegrationTokenAuth({
      request: bearer(`${INTEGRATION_TOKEN_PREFIX}deadbeef`,),
      database: db,
    },);

    expect(result,).toEqual({ kind: "rejected", reason: "unknown", },);
  });

  test("a live llri_ bearer on the MCP surface resolves", async () => {
    const raw = await seedToken();
    const result = await resolveIntegrationTokenAuth({
      request: bearer(raw, "/api/v1/integrations/mcp",),
      database: db,
    },);

    expect(result.kind,).toBe("resolved",);
  });
});

describe("integationTokenContext — subject binding", () => {
  test("binds to the ISSUING ADMIN's userId with no RBAC inheritance", () => {
    const ctx = integrationTokenContext({
      id: "tok-1",
      name: "agent-token",
      scopes: "read",
      issuerAdminUserId: ISSUER,
    },);

    expect(ctx.principalKind,).toBe("external-agent",);
    expect(ctx.userId,).toBe(ISSUER,);
    // userRole is deliberately null: the token is a scoped credential, not
    // the admin's session — `can(null, "admin.system")` is false everywhere.
    expect(ctx.userRole,).toBeNull();
    expect(ctx.sessionId,).toBeNull();
    expect(ctx.credentialId,).toBe("tok-1",);
    expect(ctx.credentialName,).toBe("agent-token",);
    expect(ctx.credentialScope,).toBe("read",);
  });
});

describe("authenticateRequest — presented llri_ bearer never downgrades", () => {
  test("a valid token resolves to the external-agent context + credential", async () => {
    const raw = await seedToken();
    const result = await authenticateRequest({
      request: bearer(raw,),
      database: db,
      authConfig: REQUIRED_CONFIG,
    },);

    expect("context" in result,).toBe(true,);
    if (!("context" in result)) { throw new Error("expected context",); }
    expect(result.context.principalKind,).toBe("external-agent",);
    expect(result.context.userId,).toBe(ISSUER,);
    expect(result.credential,).not.toBeNull();
  });

  test("an INVALID token in SOLO MODE is a 401 — never the solo identity", async () => {
    // The pre-seam rule must stop a presented-but-dead token from falling
    // through to the admin-equivalent solo user (authenticate.test.ts's B4
    // defect, replayed for the new credential kind).
    const result = await authenticateRequest({
      request: bearer(`${INTEGRATION_TOKEN_PREFIX}forged`,),
      database: db,
      authConfig: SOLO_CONFIG,
    },);

    expect(result instanceof Response,).toBe(true,);
    if (result instanceof Response) { expect(result.status,).toBe(401,); }
  });
});
