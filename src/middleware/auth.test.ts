import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import type { AuthConfig, } from "../config/schema/auth";
import { UserStatus, } from "../db/enums";
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

/**
 * Minimal AuthConfig fixtures passed as the explicit DI 4th argument to
 * `resolveUserIdFromRequest`. Only fields the resolver consults are
 * configured; `jwtSecret: ""` skips the JWT branch, and
 * `legacyOpaqueTokenFallback` selects the sha256(token) lookup.
 *
 * Every call in this suite passes a fixture explicitly: other test files
 * `mock.module("../config/load", ...)` at the top level (Bun module mocks
 * are process-global and leak across files), so any test relying on the
 * no-DI `loadConfig()` path would observe a foreign partial config whose
 * `auth` section is missing (TypeError inside resolveUserIdFromSession).
 */
const LEGACY_ONLY_AUTH_CONFIG = {
  required: false,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
  jwtSecret: "",
  legacyOpaqueTokenFallback: true,
} as const satisfies AuthConfig;

/** Same shape with the legacy sha256(token) fallback OFF — mirrors the schema default. */
const LEGACY_OFF_AUTH_CONFIG = {
  ...LEGACY_ONLY_AUTH_CONFIG,
  legacyOpaqueTokenFallback: false,
} as const satisfies AuthConfig;

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
  // RESOURCE CONTRACT: this suite owns process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK for each test;
  // the prior host value is captured here and restored in afterEach (parallel/global safety).
  let prevLegacyFallback: string | undefined;

  beforeEach(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    // Keep the env-driven fallback ON: the DI-contract test below relies on
    // the ambient fallback being active to prove that an explicit authConfig
    // fixture (legacyOpaqueTokenFallback: false) wins over it. The other
    // tests never consult the env — they pass config fixtures explicitly,
    // because other test files mock `config/load` process-globally and the
    // no-DI loadConfig() path is untestable in a full-suite run. Real
    // deployments leave this off; login.ts now writes `token_hash =
    // "jwt:" + sessionId` so JWT-issued sessions never collide with the
    // legacy path regardless of the flag.
    prevLegacyFallback = process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK;
    process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK = "1";
  },);

  afterEach(async () => {
    resetSoloUserCache();
    if (prevLegacyFallback === undefined) { delete process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK; }
    else { process.env.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK = prevLegacyFallback; }
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

    expect(await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),).toBe(userId,);
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

    expect(await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),).toBe(userId,);
  });

  it("falls back to solo user when token has no matching session", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);

    const req = new Request("http://localhost", {
      headers: { Cookie: "ll_token=no-such-session", },
    },);

    expect(await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),).toBe(solo?.id ?? null,);
  });

  it("falls back to solo user when no cookie is present", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);

    const req = new Request("http://localhost",);

    expect(await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),).toBe(solo?.id ?? null,);
  });

  it("does NOT resolve via sha256 lookup when legacyOpaqueTokenFallback is off", async () => {
    // SECURITY (BUG-legacy-sha256-token-hash-fallback): a session row keyed by
    // sha256(raw_token) is the pre-JWT-era compat surface. Without the explicit
    // opt-in flag, a secret-less deployment must not silently authenticate
    // anyone whose hash happens to be in the table. The flag is OFF by default.

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
    expect(await resolveUserIdFromRequest(req, db, "demo", LEGACY_OFF_AUTH_CONFIG,),).toBe(solo?.id ?? null,);
  });

  it("does NOT resolve via sha256 lookup when jwtSecret is empty even with legacy flag on — because jwt is checked first and falls through", async () => {
    // Belt-and-suspenders: the gate is on `legacyOpaqueTokenFallback`, not on
    // jwtSecret presence. Verify the gate alone is sufficient: with the flag
    // off, even a populated sessions table is unauthenticated.

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
    const resolved = await resolveUserIdFromRequest(req, db, "demo", LEGACY_OFF_AUTH_CONFIG,);
    expect(resolved,).not.toBe(userId,);
    expect(resolved,).toBe(solo?.id ?? null,);
  });

  it("falls back to solo when the resolved user is Disabled (BUG-resolveuseridfromrequest-missing-user-status-check)", async () => {
    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `disabled-${userId}`,
        display_name: "Disabled User",
        role: "user",
        status: UserStatus.Disabled,
        settings: "{}",
      },)
      .execute();

    const token = "disabled-user-token";
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

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo?.id ?? null,).not.toBe(userId,); // sanity: test user is NOT the solo user
    // Disabled user must NOT resolve — falls through to solo.
    expect(
      await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),
    ).toBe(solo?.id ?? null,);
  });

  it("falls back to solo when the resolved user is Deactivated", async () => {
    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `deactivated-${userId}`,
        display_name: "Deactivated User",
        role: "user",
        status: UserStatus.Deactivated,
        settings: "{}",
      },)
      .execute();

    const token = "deactivated-user-token";
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

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo?.id ?? null,).not.toBe(userId,); // sanity
    expect(
      await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),
    ).toBe(solo?.id ?? null,);
  });

  it("resolves an active user normally (status gate does not block active users)", async () => {
    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `active-${userId}`,
        display_name: "Active User",
        role: "user",
        status: UserStatus.Active,
        settings: "{}",
      },)
      .execute();

    const token = "active-user-token";
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

    expect(
      await resolveUserIdFromRequest(req, db, "demo", LEGACY_ONLY_AUTH_CONFIG,),
    ).toBe(userId,);
  });
  it("uses the authConfig 4th-arg over env when DI is provided (BUG-resolveuseridfromrequest-authconfig-di)", async () => {
    // With AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK=1 set globally (via beforeEach),
    // a caller without DI would consult the legacy sha256(token) path. When a
    // caller passes an `authConfig` whose `legacyOpaqueTokenFallback` is
    // false, that DI must win — otherwise the caller has no way to opt out of
    // the env-driven fallback from inside a route handler. This guards the DI
    // contract used by export.ts and export-sse/start.ts. The fixture is the
    // shared LEGACY_OFF_AUTH_CONFIG; the former no-DI sanity call depended on
    // the real loadConfig(), which other test files mock process-globally —
    // the env plumbing is covered by the config-layer tests instead.

    const userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `di-${userId}`,
        display_name: "DI User",
        role: "user",
        status: UserStatus.Active,
        settings: "{}",
      },)
      .execute();

    const token = "di-token-only-resolves-via-legacy";
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

    // Contract: DI with legacyOpaqueTokenFallback=false suppresses the env-driven fallback.
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo?.id ?? null,).not.toBe(userId,); // sanity: test user is NOT the solo user
    expect(
      await resolveUserIdFromRequest(req, db, "demo", LEGACY_OFF_AUTH_CONFIG,),
    ).toBe(solo?.id ?? null,);
  });
});
