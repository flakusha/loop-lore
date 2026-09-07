// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for chat invite routes (create / list / revoke / join).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { invitesRoutes, } from "./invites";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-invites-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(invitesRoutes({ database: db, },),) as unknown as Elysia;
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

interface InviteBody {
  id: string;
  chatId: string;
  code: string;
  uses: number;
  revoked: boolean;
}

describe("invitesRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const joiner = uid();
  const lateJoiner = uid();
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, joiner, "Joiner",);
    await seedUser(db, lateJoiner, "Late",);
    chatId = uid();
    await insertChats(db, "Invite Chat", owner, { id: chatId, } as never,);
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
    target: string = chatId,
  ): Promise<InviteBody> {
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${target}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
    expect(res.status,).toBe(201,);
    return (await res.json()) as InviteBody;
  }

  test("401 across invite endpoints without userId", async () => {
    const app = makeApp(db, null, null,);
    const create = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(create.status,).toBe(401,);
    const list = await app.handle(new Request(`http://localhost/api/chats/${chatId}/invites`,),);
    expect(list.status,).toBe(401,);
    const revoke = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites/${uid()}`, { method: "DELETE", },),
    );
    expect(revoke.status,).toBe(401,);
    const join = await app.handle(
      new Request("http://localhost/api/invites/abc/join", { method: "POST", },),
    );
    expect(join.status,).toBe(401,);
  },);

  test("create + list round-trip for the owner", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    expect(invite.chatId,).toBe(chatId,);
    expect(invite.code.length,).toBeGreaterThan(0,);
    const list = await app.handle(new Request(`http://localhost/api/chats/${chatId}/invites`,),);
    expect(list.status,).toBe(200,);
    const parsed = (await list.json()) as { data: InviteBody[] };
    expect(parsed.data.some((i,) => i.id === invite.id,),).toBe(true,);
  },);

  test("create 404 for non-owner and missing chat", async () => {
    const other = makeApp(db, joiner, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(denied.status,).toBe(404,);
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(missing.status,).toBe(404,);
  },);

  test("list 404 for non-owner", async () => {
    const other = makeApp(db, joiner, "user",);
    const res = await other.handle(new Request(`http://localhost/api/chats/${chatId}/invites`,),);
    expect(res.status,).toBe(404,);
  },);

  test("revoke removes the invite and is idempotent", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites/${invite.id}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
    const again = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites/${invite.id}`, { method: "DELETE", },),
    );
    // Revoking twice stays 204 (idempotent revoke path).
    expect(again.status,).toBe(204,);
  },);

  test("revoke 404 for non-owner", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    const other = makeApp(db, joiner, "user",);
    const res = await other.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites/${invite.id}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  },);

  test("join adds the participant; repeat join reports alreadyMember", async () => {
    const app = makeApp(db, owner, "user",);
    const invite = await createInvite(app,);
    const joinApp = makeApp(db, joiner, "user",);
    const first = await joinApp.handle(
      new Request(`http://localhost/api/invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(first.status,).toBe(200,);
    const firstBody = (await first.json()) as { chatId: string; alreadyMember: boolean };
    expect(firstBody.chatId,).toBe(chatId,);
    expect(firstBody.alreadyMember,).toBe(false,);
    const second = await joinApp.handle(
      new Request(`http://localhost/api/invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(second.status,).toBe(200,);
    const secondBody = (await second.json()) as { alreadyMember: boolean };
    expect(secondBody.alreadyMember,).toBe(true,);
  },);

  test("join 404 for unknown or revoked codes", async () => {
    const app = makeApp(db, joiner, "user",);
    const unknown = await app.handle(
      new Request("http://localhost/api/invites/does-not-exist/join", { method: "POST", },),
    );
    expect(unknown.status,).toBe(404,);
    const ownerApp = makeApp(db, owner, "user",);
    const invite = await createInvite(ownerApp,);
    await ownerApp.handle(
      new Request(`http://localhost/api/chats/${chatId}/invites/${invite.id}`, { method: "DELETE", },),
    );
    const revoked = await app.handle(
      new Request(`http://localhost/api/invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(revoked.status,).toBe(404,);
  },);

  test("join 410 for expired invites", async () => {
    const ownerApp = makeApp(db, owner, "user",);
    const past = new Date(Date.now() - 60_000,).toISOString();
    const invite = await createInvite(ownerApp, { expiresAt: past, },);
    const app = makeApp(db, lateJoiner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(410,);
  },);
  test("join 410 once maxUses is exhausted", async () => {
    // Fresh chat: neither joiner is a member, so both redemptions consume a use.
    const freshChat = uid();
    await insertChats(db, "Single Use Chat", owner, { id: freshChat, } as never,);
    const ownerApp = makeApp(db, owner, "user",);
    const invite = await createInvite(ownerApp, { maxUses: 1, }, freshChat,);
    const first = makeApp(db, joiner, "user",);
    const ok = await first.handle(
      new Request(`http://localhost/api/invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(ok.status,).toBe(200,);
    const second = makeApp(db, lateJoiner, "user",);
    const gone = await second.handle(
      new Request(`http://localhost/api/invites/${invite.code}/join`, { method: "POST", },),
    );
    expect(gone.status,).toBe(410,);
  },);
});
