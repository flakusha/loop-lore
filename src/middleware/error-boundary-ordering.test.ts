// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for BUG-middleware-asyncstore-fail-dead-code.
 *
 * Elysia walks `event.error` in REGISTRATION ORDER and stops at the first
 * handler that returns a non-undefined value. `onValidationError` always
 * returns a payload, so an `asyncStore.fail()` boundary registered after it is
 * unreachable: every errored request left its `request_results` row on
 * `pending` forever, so `GET /api/requests/:id/status` never resolved.
 *
 * This exercises the REAL `createApp` wiring (not a replica) because the bug
 * is purely about handler registration order inside that builder.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { flushActiveStore, setStore, } from "../async/store-registry";
import { loadConfig, } from "../config/load";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { createTestDb, } from "../test-utils/create-test-db";

describe("asyncStore.fail error boundary ordering", () => {
  let db: Kysely<DB>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    const config = loadConfig();
    config.auth.required = false;
    config.assets.uploadDir = ".tmp/";
    app = createApp({
      database: db,
      config,
      handleNonApiRequest: async () => new Response("nf", { status: 404, },),
      handleApiRequest: async () => new Response("nf", { status: 404, },),
    },);
  },);

  /**
   * The auth derive resolves the sole user on first request, and `fail()` is
   * owner-scoped — a row owned by `null` is never flipped by an authenticated
   * caller. So warm the app, then read back the real user id to seed with.
   */
  let owner: string;

  beforeAll(async () => {
    await app.handle(new Request("http://localhost/api/health",),);
    const rows = await db.selectFrom("users",).select("id",).execute();
    owner = rows[0]?.id ?? "";
  },);

  afterAll(async () => {
    // Shutdown contract (BUG-browser-teardown-destroys-the-db-before-flushing-
    // the-async-s): quiesce the async-store queue BEFORE closing the DB handle,
    // otherwise queued writes hit a closed database.
    //
    // Do NOT call `app.stop()` here: BunAdapter.stop() runs the onStop hooks
    // only when `app.server` exists and logs an unhandled error otherwise.
    await flushActiveStore();
    await db.destroy();
  },);

  /** Seed a tracked row the way the generation reply path does. */
  async function seedPending(requestId: string, userId: string | null,): Promise<void> {
    await db.insertInto("request_results",).values({
      id: requestId,
      method: "POST",
      route_pattern: "/api/v1/actors",
      user_id: userId,
      status: "pending",
      progress: null,
      response_status: null,
      response_headers: null,
      response_body: null,
      error: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      offloaded_at: null,
      offload_path: null,
    },).execute();
  }

  /**
   * POST /api/v1/actors with a body missing `displayName` → 422 from
   * onValidationError. That handler returns a payload and short-circuits the
   * chain, so the fail-boundary MUST be registered ahead of it.
   */
  function postInvalidActor(requestId: string,): Promise<Response> {
    return app.handle(
      new Request("http://localhost/api/v1/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": requestId, },
        body: JSON.stringify({ name: "no-display-name", },),
      },),
    );
  }

  test("validation error flips a tracked row to failed (was stuck pending)", async () => {
    const requestId = "ord-val-1";
    await seedPending(requestId, owner,);

    const res = await postInvalidActor(requestId,);
    expect(res.status,).toBe(422,);

    await flushActiveStore();

    const row = await db.selectFrom("request_results",).selectAll().where("id", "=", requestId,).executeTakeFirst();
    expect(row,).toBeDefined();
    // The regression: this row stayed "pending" before the fix.
    expect(row?.status,).toBe("failed",);
    expect(row?.completed_at,).not.toBeNull();
    // The boundary records the raw Elysia validation error, so the row carries
    // the offending property rather than the mapped client-facing code.
    expect(row?.error,).toContain("displayName",);
  });

  test("a validation error cannot flip a row owned by a different user", async () => {
    const foreign = "ord-foreign";
    await seedPending(foreign, "some-other-user-id",);

    const res = await postInvalidActor(foreign,);
    expect(res.status,).toBe(422,);

    await flushActiveStore();

    const row = await db.selectFrom("request_results",).selectAll().where("id", "=", foreign,).executeTakeFirst();
    // The boundary ran, but the owner-scoped WHERE matched nothing.
    expect(row?.status,).toBe("pending",);
  });

  test("validation error still returns the client-facing error payload", async () => {
    const res = await postInvalidActor("ord-val-2",);

    expect(res.status,).toBe(422,);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error,).toBe("Validation failed",);
    expect(body.code,).toBe("VALIDATION_ERROR",);
  });
});

/**
 * The unauthenticated branch of the auth derive: it must strip a
 * client-supplied `x-user-id` so a spoofed header cannot be attributed to
 * another user in the access log.
 */
describe("unauthenticated x-user-id spoofing", () => {
  let db2: Kysely<DB>;
  let app2: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ({ db: db2, } = await createTestDb());
    const config = loadConfig();
    config.auth.required = true;
    config.assets.uploadDir = ".tmp/";
    app2 = createApp({
      database: db2,
      config,
      handleNonApiRequest: async () => new Response("nf", { status: 404, },),
      handleApiRequest: async () => new Response("nf", { status: 404, },),
    },);
  },);

  afterAll(async () => {
    await flushActiveStore();
    await db2.destroy();
    // createApp registered THIS app's store in the module-level registry.
    // Clear it so a later suite cannot flush a store bound to a closed DB.
    setStore(null,);
  },);

  test("a spoofed x-user-id is dropped, so the request cannot borrow another identity", async () => {
    let seenUserId: string | null = "unset";
    const spy = app2.get("/spy-actor", ({ request, }: { request: Request },) => {
      // The access-log handler reads the same (mutated) Request object.
      seenUserId = request.headers.get("x-user-id",);
      return { ok: true, };
    },);

    const res = await spy.handle(
      new Request("http://localhost/spy-actor", {
        headers: { "x-user-id": "attacker-claimed-id", },
      },),
    );

    expect(res.status,).toBe(200,);
    expect(seenUserId,).toBeNull();
  });
});
