// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TASK-001: avatar focus round-trip on the actor routes.
 *
 * PUT /api/actors/:actorId accepts optional avatarFocusX/Y (percent), clamps
 * them server-side to 0-100, and GET /api/actors/:actorId returns the stored
 * values. Non-numeric values are rejected by body validation (422).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { charactersRoutes, } from "./characters";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string, userRole = "solo",): Elysia {
  return new Elysia({ name: "test-characters-avatar-focus", },)
    .derive(() => ({ userId, userRole, }))
    .use(charactersRoutes({ database: db, },),) as unknown as Elysia;
}

/** Create one actor and return its id. */
async function createActor(app: Elysia, name: string,): Promise<string> {
  const res = await app.handle(
    new Request("http://localhost/api/actors", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ displayName: name, },),
    },),
  );
  expect(res.status,).toBe(201,);
  const { id, } = (await res.json()) as { id: string };
  return id;
}

/** PUT focus fields (plus a fresh dataVersion) and return the response. */
async function putFocus(
  app: Elysia,
  actorId: string,
  focus: Record<string, unknown>,
  dataVersion: number,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/actors/${actorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ ...focus, dataVersion, },),
    },),
  );
}

/** GET the actor and return its focus fields. */
async function getFocus(
  app: Elysia,
  actorId: string,
): Promise<{ avatar_focus_x: number; avatar_focus_y: number }> {
  const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}`,),);
  expect(res.status,).toBe(200,);
  const body = (await res.json()) as { avatar_focus_x: number; avatar_focus_y: number };
  return { avatar_focus_x: body.avatar_focus_x, avatar_focus_y: body.avatar_focus_y, };
}

describe("actor avatar focus round-trip", () => {
  let db: Kysely<DB>;
  const userId = uid();
  let app: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Focus Tester",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
    app = createApp(db, userId,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("new actors default to centered focus (50/50)", async () => {
    const id = await createActor(app, "Centered",);
    expect(await getFocus(app, id,),).toEqual({ avatar_focus_x: 50, avatar_focus_y: 50, },);
  });

  test("PUT persists focus values and GET round-trips them", async () => {
    const id = await createActor(app, "Off Center",);
    const res = await putFocus(app, id, { avatarFocusX: 25, avatarFocusY: 80, }, 0,);
    expect(res.status,).toBe(200,);
    expect(await getFocus(app, id,),).toEqual({ avatar_focus_x: 25, avatar_focus_y: 80, },);
  });

  test("PUT clamps out-of-range focus into 0-100", async () => {
    const id = await createActor(app, "Clamped",);
    const high = await putFocus(app, id, { avatarFocusX: 150, avatarFocusY: -20, }, 0,);
    expect(high.status,).toBe(200,);
    expect(await getFocus(app, id,),).toEqual({ avatar_focus_x: 100, avatar_focus_y: 0, },);

    const boundary = await putFocus(app, id, { avatarFocusX: 0, avatarFocusY: 100, }, 1,);
    expect(boundary.status,).toBe(200,);
    expect(await getFocus(app, id,),).toEqual({ avatar_focus_x: 0, avatar_focus_y: 100, },);
  });

  test("PUT without focus fields leaves stored focus unchanged", async () => {
    const id = await createActor(app, "Untouched",);
    await putFocus(app, id, { avatarFocusX: 10, avatarFocusY: 90, }, 0,);
    const untouched = await putFocus(app, id, { displayName: "Renamed", }, 1,);
    expect(untouched.status,).toBe(200,);
    expect(await getFocus(app, id,),).toEqual({ avatar_focus_x: 10, avatar_focus_y: 90, },);
  });

  test("PUT rejects non-numeric focus with 422", async () => {
    const id = await createActor(app, "Invalid",);
    for (const bad of ["high", true, null,]) {
      const res = await putFocus(app, id, { avatarFocusX: bad, }, 0,);
      expect(res.status,).toBe(422,);
    }
  });
});
