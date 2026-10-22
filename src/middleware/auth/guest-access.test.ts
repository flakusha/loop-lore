// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the synthetic guest tier (`auth.guestAccess`).
 *
 * The guest tier gives an unauthenticated visitor a read-mostly `guest`
 * context: no account, no session row, nothing persisted. These tests pin
 * the properties the tier must hold:
 *  - flag on + no token → a guest context instead of a 401;
 *  - flag off → the historical 401, unchanged;
 *  - a solo deployment never degrades into a guest one;
 *  - a presented-but-invalid token never degrades to a guest;
 *  - a guest request cannot borrow another identity via `x-user-id`.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { setStore, } from "../../async/store-registry";
import { signJwt, } from "../../auth/jwt";
import { loadConfig, } from "../../config/load";
import type { AuthConfig, } from "../../config/schema/auth";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createApp, } from "../../elysia-app";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertSessions, insertUsers, } from "../../test-utils/insert-helpers";
import { authenticate, } from "./authenticate";
import { resetSoloUserCache, } from "./solo-user";

const JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";

/** Multi-user mode with the guest tier enabled. */
const GUEST_CONFIG = {
  required: true,
  guestAccess: true,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
  jwtSecret: JWT_SECRET,
} as const satisfies AuthConfig;

/** Same shape, guest tier off — the shipped default. */
const NO_GUEST_CONFIG = { ...GUEST_CONFIG, guestAccess: false, } as const satisfies AuthConfig;

/** Guest tier on, but the solo fallback still wins (auth.required = false). */
const SOLO_CONFIG = { ...GUEST_CONFIG, required: false, } as const satisfies AuthConfig;

describe("authenticate — guest tier", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    resetSoloUserCache();
    await db.destroy();
  },);

  /** Bearer-header request carrying `token`, or a bare request when null. */
  function req(token: string | null,): Request {
    return new Request(
      "http://localhost/api/chats",
      token ? { headers: { Authorization: `Bearer ${token}`, }, } : {},
    );
  }

  async function expectUnauthorized(result: Response | { context: unknown },): Promise<void> {
    expect(result instanceof Response,).toBe(true,);
    if (!(result instanceof Response)) { throw new Error("expected a 401 Response",); }
    expect(result.status,).toBe(401,);
  }

  test("flag on + no token → guest context: no account, no session", async () => {
    const result = await authenticate({ request: req(null,), database: db, authConfig: GUEST_CONFIG, },);
    expect("context" in result,).toBe(true,);
    if (!("context" in result)) { throw new Error("expected context",); }
    expect(result.context.userRole,).toBe(UserRole.Guest,);
    expect(result.context.userId,).toBeNull();
    expect(result.context.sessionId,).toBeNull();
  });

  test("flag on + no token → persists nothing (no users row, no sessions row)", async () => {
    await authenticate({ request: req(null,), database: db, authConfig: GUEST_CONFIG, },);
    const users = await db.selectFrom("users",).select("id",).execute();
    const sessions = await db.selectFrom("sessions",).select("id",).execute();
    expect(users,).toHaveLength(0,);
    expect(sessions,).toHaveLength(0,);
  });

  test("flag off + no token → 401 (unchanged default behaviour)", async () => {
    await expectUnauthorized(await authenticate({ request: req(null,), database: db, authConfig: NO_GUEST_CONFIG, },),);
  });

  test("flag on but required = false → the solo user wins over the guest tier", async () => {
    const result = await authenticate({ request: req(null,), database: db, authConfig: SOLO_CONFIG, },);
    expect("context" in result,).toBe(true,);
    if (!("context" in result)) { throw new Error("expected context",); }
    expect(result.context.userRole,).toBe(UserRole.Solo,);
    expect(result.context.userId,).toBeDefined();
  });

  test("flag on + invalid token → 401, never a guest downgrade", async () => {
    const userId = await insertUsers(db, "alice", "Alice",);
    const token = await signJwt({
      secret: JWT_SECRET,
      userId,
      role: UserRole.User,
      sessionId: "revoked-session-id",
      expiresInSeconds: 3600,
    },);

    await expectUnauthorized(await authenticate({ request: req(token,), database: db, authConfig: GUEST_CONFIG, },),);
  });

  test("flag on + valid token → that user, not the guest tier", async () => {
    const userId = await insertUsers(db, "bob", "Bob",);
    const sessionId = await insertSessions(db, userId, "token-hash", new Date(Date.now() + 86_400_000,).toISOString(),);
    const token = await signJwt({
      secret: JWT_SECRET,
      userId,
      role: UserRole.User,
      sessionId,
      expiresInSeconds: 3600,
    },);

    const result = await authenticate({ request: req(token,), database: db, authConfig: GUEST_CONFIG, },);
    expect("context" in result,).toBe(true,);
    if (!("context" in result)) { throw new Error("expected context",); }
    expect(result.context.userRole,).toBe(UserRole.User,);
    expect(result.context.userId,).toBe(userId,);
  });
});

/**
 * The guest tier has no account behind it, so it must not be able to borrow
 * one: a client-supplied `x-user-id` is dropped before the request reaches a
 * handler (the access log attributes the request from the same header).
 */
describe("guest tier — x-user-id spoofing", () => {
  let db: Kysely<DB>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    const config = loadConfig();
    config.auth.required = true;
    config.auth.guestAccess = true;
    config.assets.uploadDir = ".tmp/";
    app = createApp({
      database: db,
      config,
      handleNonApiRequest: async () => new Response("nf", { status: 404, },),
      handleApiRequest: async () => new Response("nf", { status: 404, },),
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    // createApp registered THIS app's store in the module-level registry.
    // Clear it so a later suite cannot flush a store bound to a closed DB.
    setStore(null,);
  },);

  test("a guest request cannot borrow another identity via x-user-id", async () => {
    let seenUserId: string | null = "unset";
    let seenRole: string | null = "unset";
    const spy = app.get("/spy-guest", (ctx,) => {
      // The derive's values are not part of Elysia's inferred handler ctx.
      const derived = ctx as unknown as { request: Request; userRole: string | null };
      // The access-log handler reads the same (mutated) Request object.
      seenUserId = derived.request.headers.get("x-user-id",);
      seenRole = derived.userRole;
      return { ok: true, };
    },);

    const res = await spy.handle(
      new Request("http://localhost/spy-guest", {
        headers: { "x-user-id": "attacker-claimed-id", },
      },),
    );

    expect(res.status,).toBe(200,);
    expect(seenUserId,).toBeNull();
    expect(seenRole,).toBe(UserRole.Guest,);
  });
});
