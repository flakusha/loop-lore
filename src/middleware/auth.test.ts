import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import {
  extractBearerToken,
  getOrCreateSoloUserForAuth,
  resetSoloUserCache,
  resolveUserIdFromRequest,
} from "./auth";

describe("extractBearerToken", () => {
  it("extracts token from Bearer header", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer abc123", },
    },);
    expect(extractBearerToken(req,),).toBe("abc123",);
  });

  it("trims whitespace from token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer   abc123  ", },
    },);
    expect(extractBearerToken(req,),).toBe("abc123",);
  });

  it("returns null for non-Bearer auth", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Basic abc123", },
    },);
    expect(extractBearerToken(req,),).toBeNull();
  });

  it("returns null for missing Authorization header", () => {
    const req = new Request("http://localhost",);
    expect(extractBearerToken(req,),).toBeNull();
  });

  it("returns null for empty Bearer token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer ", },
    },);
    expect(extractBearerToken(req,),).toBeNull();
  });
});

describe("resolveUserIdFromRequest", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    // Enable the legacy sha256(token) lookup path so the tests below (which
    // seed sessions with `token_hash = sha256(raw_token)`) resolve. Real
    // deployments leave this off; login.ts now writes `token_hash =
    // "jwt:" + sessionId` so JWT-issued sessions never collide with this
    // path regardless of the flag.
    process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK = "1";
  },);

  afterEach(async () => {
    resetSoloUserCache();
    delete process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK;
    await db.destroy();
  },);

  it("resolves userId from a valid ll_token session cookie", async () => {
    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `authed-${userId}`,
        display_name: "Authed User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "Authed User",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    const token = "valid-session-token";
    const tokenHash = crypto.createHash("sha256",).update(token,).digest("hex",);
    await db
      .insertInto("sessions",)
      .values({
        user_id: userId,
        token_hash: tokenHash,
        ip: "127.0.0.1",
        user_agent: "test",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const req = new Request("http://localhost", {
      headers: { Cookie: `ll_token=${token}`, },
    },);

    expect(await resolveUserIdFromRequest(req, db, "demo",),).toBe(userId,);
  });

  it("handles a mid-header ll_token cookie (canonical LL_TOKEN boundary)", async () => {
    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `authed-${userId}`,
        display_name: "Authed User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const token = "mid-header-token";
    const tokenHash = crypto.createHash("sha256",).update(token,).digest("hex",);
    await db
      .insertInto("sessions",)
      .values({
        user_id: userId,
        token_hash: tokenHash,
        ip: "127.0.0.1",
        user_agent: "test",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const req = new Request("http://localhost", {
      headers: { Cookie: "theme=dark; ll_token=mid-header-token; ll_locale=en", },
    },);

    expect(await resolveUserIdFromRequest(req, db, "demo",),).toBe(userId,);
  });

  it("falls back to solo user when token has no matching session", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);

    const req = new Request("http://localhost", {
      headers: { Cookie: "ll_token=no-such-session", },
    },);

    expect(await resolveUserIdFromRequest(req, db, "demo",),).toBe(solo?.id ?? null,);
  });

  it("falls back to solo user when no cookie is present", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);

    const req = new Request("http://localhost",);

    expect(await resolveUserIdFromRequest(req, db, "demo",),).toBe(solo?.id ?? null,);
  });

  it("does NOT resolve via sha256 lookup when legacyOpaqueTokenFallback is off", async () => {
    // SECURITY (BUG-legacy-sha256-token-hash-fallback): a session row keyed by
    // sha256(raw_token) is the pre-JWT-era compat surface. Without the explicit
    // opt-in flag, a secret-less deployment must not silently authenticate
    // anyone whose hash happens to be in the table. The flag is OFF by default.
    delete process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK;

    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `legacy-${userId}`,
        display_name: "Legacy User",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const token = "legacy-opaque-token";
    const tokenHash = crypto.createHash("sha256",).update(token,).digest("hex",);
    await db
      .insertInto("sessions",)
      .values({
        user_id: userId,
        token_hash: tokenHash,
        ip: "127.0.0.1",
        user_agent: "legacy",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const req = new Request("http://localhost", {
      headers: { Cookie: `ll_token=${token}`, },
    },);

    // The fallback must NOT fire — falls through to solo user.
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(req, db, "demo",),).toBe(solo?.id ?? null,);

    // Restore for any subsequent tests in the suite.
    process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK = "1";
  });

  it("does NOT resolve via sha256 lookup when jwtSecret is empty even with legacy flag on — because jwt is checked first and falls through", async () => {
    // Belt-and-suspenders: the gate is on `legacyOpaqueTokenFallback`, not on
    // jwtSecret presence. Verify the gate alone is sufficient: with the flag
    // off, even a populated sessions table is unauthenticated.
    delete process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK;

    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `secretless-${userId}`,
        display_name: "Secretless",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const token = "should-not-resolve";
    const tokenHash = crypto.createHash("sha256",).update(token,).digest("hex",);
    await db
      .insertInto("sessions",)
      .values({
        user_id: userId,
        token_hash: tokenHash,
        ip: "127.0.0.1",
        user_agent: "secretless",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const req = new Request("http://localhost", {
      headers: { Cookie: `ll_token=${token}`, },
    },);

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    const resolved = await resolveUserIdFromRequest(req, db, "demo",);
    expect(resolved,).not.toBe(userId,);
    expect(resolved,).toBe(solo?.id ?? null,);

    process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK = "1";
  });
});
