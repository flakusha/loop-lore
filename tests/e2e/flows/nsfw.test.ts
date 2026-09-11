/**
 * E2E: NSFW Moderation
 *
 * Validates the NSFW gate + moderation endpoints as the full HTTP surface.
 * Mirrors the actual server contract:
 *   - moderation.action is gated BEFORE user auth — anon gets 403, not 401
 *     (the route checks `can(userRole, "moderation.action")` via requireModerationAction)
 *   - write endpoints require `{ targetUserId, reason }` (modBody schema); omit either → 422
 *   - admin role satisfies admin.system → 200
 *
 * Coverage:
 *   - anon request rejected (403)
 *   - regular user gets 403
 *   - admin block -> unblock round-trip
 *   - admin shadow -> unshadow round-trip
 *   - missing body field → 422 (Elysia schema validation)
 *   - flags list reachable for admin
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import {
  type ApiClient,
  createClient,
} from "../helpers/client";
import { SEED, seedUsers, } from "../helpers/seed";
import {
  type TestServer,
  createTestServer,
} from "../helpers/server";

describe("NSFW E2E", () => {
  let server: TestServer;
  let userApi: ApiClient;
  let adminApi: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({
      auth: { required: true, },
    },);
    await seedUsers(server.db,);
    userApi = createClient(server.url,);
    adminApi = createClient(server.url,);

    // Login as regular user + admin
    await userApi.loginAs(SEED.user.username, SEED.user.password,);
    await adminApi.loginAs(SEED.admin.username, SEED.admin.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  // Helper: write endpoint requires both fields per modBody schema.
  const blockBody = (targetUserId: string) => ({
    targetUserId,
    reason: "e2e-spec block",
  });

  test("POST /api/nsfw/moderation/block is gated before reaching the moderation role check", async () => {
    // Without an established session, the global CSRF beforeHandle fires
    // first and rejects unsafe methods with 403 csrf_verification_failed.
    // This is the correct order — a forged session can't reach the role gate.
    const anon = createClient(server.url,);
    const res = await anon.post("/api/nsfw/moderation/block", blockBody(SEED.user.id,),);
    expect(res.status,).toBe(403,);
    expect(res.error ?? "",).toContain("csrf",);
  },);
  test("POST /api/nsfw/moderation/block returns 403 for regular user", async () => {
    const res = await userApi.post(
      "/api/nsfw/moderation/block",
      blockBody(SEED.admin.id,),
    );
    expect(res.status,).toBe(403,);
    expect(res.code,).toBeTruthy();
  },);

  test("POST /api/nsfw/moderation/ban returns 403 for regular user", async () => {
    const res = await userApi.post(
      "/api/nsfw/moderation/ban",
      blockBody(SEED.admin.id,),
    );
    expect(res.status,).toBe(403,);
  },);

  test("admin can block then unblock a target user (round-trip)", async () => {
    // Synthetic target — endpoint records the action regardless of existence.
    const targetId = "a0000099-0000-4000-a000-000000000000";

    const block = await adminApi.post(
      "/api/nsfw/moderation/block",
      blockBody(targetId,),
    );
    expect(block.ok,).toBe(true,);
    expect(block.data,).toBeTruthy();

    // unblockBody takes only targetUserId
    const unblock = await adminApi.post(
      "/api/nsfw/moderation/unblock",
      { targetUserId: targetId, },
    );
    expect(unblock.ok,).toBe(true,);
  },);

  test("admin can shadow then unshadow a target user (round-trip)", async () => {
    const targetId = "a00000aa-0000-4000-a000-000000000000";

    // shadow route uses modBody — requires reason
    const shadow = await adminApi.post(
      "/api/nsfw/moderation/shadow",
      blockBody(targetId,),
    );
    expect(shadow.ok,).toBe(true,);

    // unshadow route also uses modBody — requires reason
    const unshadow = await adminApi.post(
      "/api/nsfw/moderation/unshadow",
      blockBody(targetId,),
    );
    expect(unshadow.ok,).toBe(true,);
  },);

  test("GET /api/nsfw/moderation/flags (list) is reachable for admin", async () => {
    const res = await adminApi.get("/api/nsfw/moderation/flags",);
    expect(res.status,).toBe(200,);
    expect(res.data,).toBeTruthy();
  },);

  test("POST /api/nsfw/moderation/block with missing targetUserId returns 422", async () => {
    // modBody schema requires targetUserId; Elysia schema validation → 422.
    const res = await adminApi.post(
      "/api/nsfw/moderation/block",
      { reason: "no target" },
    );
    expect(res.status,).toBe(422,);
    expect(res.code,).toBeTruthy();
  },);

  test("POST /api/nsfw/moderation/block with missing reason returns 422", async () => {
    const res = await adminApi.post(
      "/api/nsfw/moderation/block",
      { targetUserId: SEED.user.id, },
    );
    expect(res.status,).toBe(422,);
  },);
});
