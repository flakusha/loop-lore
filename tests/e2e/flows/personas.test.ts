/**
 * E2E: Personas CRUD + ownership
 *
 * Validates the /api/personas surface against the HTTP boundary.
 * Personas are user-bound (created_by / owner_id), so we exercise:
 *   - 401 when unauthenticated
 *   - 200 list/create/get/update/delete for the authenticated user
 *   - 200 — convert-to-character (admin only, simplest path)
 *   - 400 / 422 for malformed create body
 *
 * Does NOT exercise cross-user authorization at the route layer; that's
 * covered by `src/personas/controller.test.ts` unit tests on the guard.
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

describe("Personas E2E", () => {
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
    await userApi.loginAs(SEED.user.username, SEED.user.password,);
    await adminApi.loginAs(SEED.admin.username, SEED.admin.password,);
  },);

  afterAll(() => {
    server.close();
  },);

  test("GET /api/personas returns 401 when unauthenticated", async () => {
    const anon = createClient(server.url,);
    const res = await anon.get("/api/personas",);
    expect(res.status,).toBe(401,);
    expect(res.code,).toBeTruthy();
  },);

  test("POST /api/personas creates a persona for the caller", async () => {
    const name = `p-${Date.now().toString(36)}`;
    const res = await userApi.post("/api/personas", {
      name,
      description: "e2e-spec persona",
    },);
    expect(res.ok,).toBe(true,);
    expect(res.data,).toBeTruthy();
  },);

  test("GET /api/personas lists the caller's personas (created one is present)", async () => {
    const stamp = Date.now().toString(36);
    const created = await userApi.post("/api/personas", {
      name: `p-list-${stamp}`,
    },);
    expect(created.ok,).toBe(true,);
    const personaId = (created.data as { id: string } | null | undefined)?.id;
    expect(typeof personaId,).toBe("string",);

    const list = await userApi.get("/api/personas",);
    expect(list.status,).toBe(200,);
    const items = (list.data ?? []) as Array<{ id: string }>;
    expect(Array.isArray(items,),).toBe(true,);
    expect(items.map((p) => p.id,),).toContain(personaId,);
  },);

  test("PATCH /api/personas/:id updates an owned persona", async () => {
    const stamp = Date.now().toString(36);
    const created = await userApi.post("/api/personas", {
      name: `p-patch-${stamp}`,
    },);
    expect(created.ok,).toBe(true,);
    const personaId = (created.data as { id: string } | null | undefined)?.id;
    if (typeof personaId !== "string" || personaId.length === 0) {
      throw new Error("create did not return an id",);
    }

    const updated = await userApi.patch(`/api/personas/${personaId}`, {
      description: "updated by e2e",
    },);
    expect(updated.ok,).toBe(true,);
  },);

  test("DELETE /api/personas/:id removes an owned persona", async () => {
    const stamp = Date.now().toString(36);
    const created = await userApi.post("/api/personas", {
      name: `p-del-${stamp}`,
    },);
    expect(created.ok,).toBe(true,);
    const personaId = (created.data as { id: string } | null | undefined)?.id;
    if (typeof personaId !== "string" || personaId.length === 0) {
      throw new Error("create did not return an id",);
    }

    const del = await userApi.del(`/api/personas/${personaId}`,);
    expect(del.ok,).toBe(true,);
  },);

  test("POST /api/personas with missing name returns 400 + BAD_REQUEST", async () => {
    const res = await userApi.post("/api/personas", { description: "no name", },);
    expect(res.status,).toBe(400,);
    expect(res.code,).toBe("BAD_REQUEST",);
  },);

  test("admin can convert an owned persona to a character", async () => {
    const stamp = Date.now().toString(36);
    const created = await adminApi.post("/api/personas", {
      name: `p-conv-${stamp}`,
    },);
    expect(created.ok,).toBe(true,);
    const personaId = (created.data as { id: string } | null | undefined)?.id;
    if (typeof personaId !== "string" || personaId.length === 0) {
      throw new Error("create did not return an id",);
    }

    const conv = await adminApi.post(
      `/api/personas/${personaId}/convert-to-character`,
      {},
    );
    expect(conv.status,).toBe(201,);
    const actorId = (conv.data as { actorId?: string } | null | undefined)?.actorId;
    expect(typeof actorId,).toBe("string",);
    expect(actorId?.length,).toBeGreaterThan(0,);

    // The conversion actually persisted — the new actor row exists in the actors table.
    const actorRow = await server.db
      .selectFrom("actors")
      .select(["id", "actor_type"])
      .where("id", "=", actorId ?? "",)
      .executeTakeFirst();
    expect(actorRow?.actor_type,).toBe("character",);
  },);
});
