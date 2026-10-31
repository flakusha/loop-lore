// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scope-mismatch + terminal-state matrix for `revokeInviteRow`
 * (`src/chat/invites/revoke-core.ts`) — the shared revoke flow behind both
 * `chat_invites` and `world_invites`. Only redeem-concurrency was covered;
 * revocation itself had no tests.
 *
 * Matrix: wrong-scope id → not_found; active → Revoked (row written);
 * already-revoked → idempotent ok; consumed/expired → revoked error
 * (no row write); world_invites scoping mirrors chat_invites.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { InviteStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { revokeInviteRow, } from "./revoke-core";

let db: Kysely<DB>;

const OWNER = "revoke-owner";
const CHAT_A = "revoke-chat-a";
const CHAT_B = "revoke-chat-b";
const WORLD_A = "revoke-world-a";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, OWNER, "Revoke Owner", { id: OWNER as never, },);
  await insertChats(db, "Revoke Chat A", OWNER, { id: CHAT_A as never, },);
  await insertChats(db, "Revoke Chat B", OWNER, { id: CHAT_B as never, },);
  await insertWorlds(db, OWNER, "Revoke World A", { id: WORLD_A, },);
},);

afterEach(async () => {
  await db.destroy();
},);

/** @param overrides */
function chatRow(id: string, chatId: string, status: InviteStatus, overrides: Record<string, unknown> = {},) {
  return {
    id,
    code: `code-${id}`,
    chat_id: chatId,
    created_by: null,
    expires_at: null,
    max_uses: null,
    uses: 0,
    status,
    ...overrides,
  } as never;
}

/** @param id @param worldId @param status */
function worldRow(id: string, worldId: string, status: InviteStatus,) {
  return {
    id,
    code: `code-${id}`,
    world_id: worldId,
    created_by: null,
    expires_at: null,
    max_uses: null,
    uses: 0,
    status,
  } as never;
}

describe("revokeInviteRow — chat_invites", () => {
  test("wrong-scope id → not_found", async () => {
    await db.insertInto("chat_invites",).values(chatRow("inv-other-chat", CHAT_A, InviteStatus.Active,),).execute();

    const res = await revokeInviteRow({
      database: db,
      table: "chat_invites",
      scopeId: CHAT_B,
      inviteId: "inv-other-chat",
    },);

    expect(res.ok,).toBe(false,);
    if (res.ok) { return; }
    expect(res.error.code,).toBe("not_found",);
  });

  test("unknown id → not_found", async () => {
    const res = await revokeInviteRow({
      database: db,
      table: "chat_invites",
      scopeId: CHAT_A,
      inviteId: "inv-missing",
    },);

    expect(res.ok,).toBe(false,);
    if (res.ok) { return; }
    expect(res.error.code,).toBe("not_found",);
  });

  test("active → Revoked with a row write", async () => {
    await db.insertInto("chat_invites",).values(chatRow("inv-active", CHAT_A, InviteStatus.Active,),).execute();

    const res = await revokeInviteRow({
      database: db,
      table: "chat_invites",
      scopeId: CHAT_A,
      inviteId: "inv-active",
    },);

    expect(res,).toEqual({ ok: true, value: { id: "inv-active", status: InviteStatus.Revoked, }, },);

    const row = await db.selectFrom("chat_invites",).select("status",).where("id", "=", "inv-active",)
      .executeTakeFirstOrThrow();

    expect(row.status,).toBe(InviteStatus.Revoked,);
  });

  test("already-revoked → idempotent ok", async () => {
    await db.insertInto("chat_invites",).values(chatRow("inv-revoked", CHAT_A, InviteStatus.Revoked,),).execute();

    const res = await revokeInviteRow({
      database: db,
      table: "chat_invites",
      scopeId: CHAT_A,
      inviteId: "inv-revoked",
    },);

    expect(res,).toEqual({ ok: true, value: { id: "inv-revoked", status: InviteStatus.Revoked, }, },);
  });

  for (const terminal of [InviteStatus.Expired, InviteStatus.Exhausted,] as const) {
    test(`${terminal} → revoked error with no row write`, async () => {
      await db.insertInto("chat_invites",).values(chatRow(`inv-${terminal}`, CHAT_A, terminal,),).execute();

      const res = await revokeInviteRow({
        database: db,
        table: "chat_invites",
        scopeId: CHAT_A,
        inviteId: `inv-${terminal}`,
      },);

      expect(res.ok,).toBe(false,);
      if (res.ok) { return; }
      expect(res.error.code,).toBe("revoked",);

      const row = await db.selectFrom("chat_invites",).select("status",).where("id", "=", `inv-${terminal}`,)
        .executeTakeFirstOrThrow();

      expect(row.status,).toBe(terminal,);
    });
  }
});

describe("revokeInviteRow — world_invites", () => {
  test("active → Revoked with a row write", async () => {
    await db.insertInto("world_invites",).values(worldRow("winv-active", WORLD_A, InviteStatus.Active,),).execute();

    const res = await revokeInviteRow({
      database: db,
      table: "world_invites",
      scopeId: WORLD_A,
      inviteId: "winv-active",
    },);

    expect(res,).toEqual({ ok: true, value: { id: "winv-active", status: InviteStatus.Revoked, }, },);

    const row = await db.selectFrom("world_invites",).select("status",).where("id", "=", "winv-active",)
      .executeTakeFirstOrThrow();

    expect(row.status,).toBe(InviteStatus.Revoked,);
  });

  test("wrong-scope id → not_found", async () => {
    await db.insertInto("world_invites",).values(worldRow("winv-other", WORLD_A, InviteStatus.Active,),).execute();

    const res = await revokeInviteRow({
      database: db,
      table: "world_invites",
      scopeId: "revoke-world-b",
      inviteId: "winv-other",
    },);

    expect(res.ok,).toBe(false,);
    if (res.ok) { return; }
    expect(res.error.code,).toBe("not_found",);
  });

  test("already-revoked → idempotent ok", async () => {
    await db.insertInto("world_invites",).values(worldRow("winv-revoked", WORLD_A, InviteStatus.Revoked,),).execute();

    const res = await revokeInviteRow({
      database: db,
      table: "world_invites",
      scopeId: WORLD_A,
      inviteId: "winv-revoked",
    },);

    expect(res,).toEqual({ ok: true, value: { id: "winv-revoked", status: InviteStatus.Revoked, }, },);
  });
});
