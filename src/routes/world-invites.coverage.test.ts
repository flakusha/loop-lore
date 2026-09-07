// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for world invite routes (create / list / revoke / join).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../chat/service";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { worldInvitesRoutes, } from "./world-invites";
import { worldsRoutes, } from "./worlds";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-world-invites-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(worldInvitesRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

interface WorldInviteBody {
  id: string;
  worldId: string;
  code: string;
}

describe("worldInvitesRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const joiner = uid();
  const lateJoiner = uid();
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedChatSetupTemplates(db,);
    await seedUser(db, owner, "Owner",);
    await seedUser(db, joiner, "Joiner",);
    await seedUser(db, lateJoiner, "Late",);
    const worldsApp = new Elysia({ name: "test-world-create-coverage", },)
      .derive({ as: "scoped", }, () => ({ userId: owner, userRole: "user", }),)
      .use(worldsRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;
    const res = await worldsApp.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Invite World", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const created: { id: string } = await res.json();
    worldId = created.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param app
   * @param body
   * @param target
   */
  async function createInvite(
    app: Elysia,
    body: Record<string, unknown> = {},
    target: string = worldId,
  ): Promise<WorldInviteBody> {
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${target}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
    expect(res.status,).toBe(201,);
    return (await res.json()) as WorldInviteBody;
  }

  /**
   */
  async function createWorld(name: string,): Promise<string> {
    const worldsApp = new Elysia({ name: "test-world-create-more", },)
      .derive({ as: "scoped", }, () => ({ userId: owner, userRole: "user", }),)
      .use(worldsRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;
    const res = await worldsApp.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name, },),
      },),
    );
    expect(res.status,).toBe(201,);
    const created: { id: string } = await res.json();
    return created.id;
  }

  test("401 across world invite endpoints without userId", async () => {
    const app = makeApp(db, null, null,);
    const create = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(create.status,).toBe(401,);
    const list = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites`,),
    );
    expect(list.status,).toBe(401,);
    const revoke = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites/${uid()}`, { method: "DELETE", },),
    );
    expect(revoke.status,).toBe(401,);
    const join = await app.handle(
      new Request("http://localhost/api/world-invites/abc/join", { method: "POST", },),
    );
    expect(join.status,).toBe(401,);
  },);

  test("create + list round-trip for the owner", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    expect(invite.worldId,).toBe(worldId,);
    expect(invite.code.length,).toBeGreaterThan(0,);
    const list = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites`,),
    );
    expect(list.status,).toBe(200,);
    const parsed = (await list.json()) as { data: WorldInviteBody[] };
    expect(parsed.data.some((i,) => i.id === invite.id,),).toBe(true,);
  },);

  test("create/list 404 for non-owner and missing world", async () => {
    const other = makeApp(db, joiner, "user",);
    const deniedCreate = await other.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(deniedCreate.status,).toBe(404,);
    const deniedList = await other.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites`,),
    );
    expect(deniedList.status,).toBe(404,);
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/worlds/${uid()}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(missing.status,).toBe(404,);
  },);

  test("revoke is idempotent; non-owner gets 404", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites/${invite.id}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(204,);
    const again = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites/${invite.id}`, {
        method: "DELETE",
      },),
    );
    expect(again.status,).toBe(204,);
    const fresh = await createInvite(app,);
    const other = makeApp(db, joiner, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites/${fresh.id}`, {
        method: "DELETE",
      },),
    );
    expect(denied.status,).toBe(404,);
  },);

  test("join adds the member; repeat join reports alreadyMember", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    const joinApp = makeApp(db, joiner, "user",);
    const first = await joinApp.handle(
      new Request(`http://localhost/api/world-invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(first.status,).toBe(200,);
    const firstBody = (await first.json()) as { worldId: string; alreadyMember: boolean };
    expect(firstBody.worldId,).toBe(worldId,);
    expect(firstBody.alreadyMember,).toBe(false,);
    const second = await joinApp.handle(
      new Request(`http://localhost/api/world-invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(second.status,).toBe(200,);
    expect(((await second.json()) as { alreadyMember: boolean }).alreadyMember,).toBe(true,);
  },);

  test("join 404 for unknown or revoked codes", async () => {
    const app = makeApp(db, joiner, "user",);
    const unknown = await app.handle(
      new Request("http://localhost/api/world-invites/does-not-exist/join", { method: "POST", },),
    );
    expect(unknown.status,).toBe(404,);
    const ownerApp = makeApp(db, owner, "user",);
    const invite = await createInvite(ownerApp,);
    await ownerApp.handle(
      new Request(`http://localhost/api/worlds/${worldId}/invites/${invite.id}`, { method: "DELETE", },),
    );
    const revoked = await app.handle(
      new Request(`http://localhost/api/world-invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(revoked.status,).toBe(404,);
  },);

  test("join 410 for expired and exhausted invites", async () => {
    const ownerApp = makeApp(db, owner, "user",);
    const past = new Date(Date.now() - 60_000,).toISOString();
    const expired = await createInvite(ownerApp, { expiresAt: past, },);
    const app = makeApp(db, lateJoiner, "user",);
    const gone = await app.handle(
      new Request(`http://localhost/api/world-invites/${expired.code}/join`, { method: "POST", },),
    );
    expect(gone.status,).toBe(410,);

    const freshWorld = await createWorld("Single Use World",);
    const single = await createInvite(ownerApp, { maxUses: 1, }, freshWorld,);
    const first = makeApp(db, joiner, "user",);
    const ok = await first.handle(
      new Request(`http://localhost/api/world-invites/${single.code}/join`, { method: "POST", },),
    );
    expect(ok.status,).toBe(200,);
    const second = makeApp(db, lateJoiner, "user",);
    const used = await second.handle(
      new Request(`http://localhost/api/world-invites/${single.code}/join`, { method: "POST", },),
    );
    expect(used.status,).toBe(410,);
  },);
});
