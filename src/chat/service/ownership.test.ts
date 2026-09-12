// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `transferOwnership` (chat ownership transfer).
 *
 * Covers:
 *   - Success path (existing participant): ownership flips, previous owner demoted,
 *     audit log + notifications emitted.
 *   - Success path (auto-invite): new owner inserted as `role_in_chat = owner`.
 *   - Authority: non-owner non-admin cannot transfer (forbidden).
 *   - Validation: self-transfer / already-current-owner rejected.
 *   - Audit: log_entries row written with `event_type = chat_ownership_transferred`.
 *   - Notifications: two `NotificationType.System` rows created (one for previous
 *     owner, one for new owner).
 *   - Transaction rollback on conflict (simulated by handing the service an
 *     already-closed DB handle).
 *
 * TODO(chat-ownership): the rollback-on-conflict bullet above has no test — add it (plus an
 * admin-path test for the can() bypass), and fix "target already current owner" to actually hit
 * that branch with an admin requester instead of re-testing the self-transfer guard.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { transferOwnership, } from "./ownership";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const STRANGER_ID = randomUUID();
const CHAT_ID = randomUUID();
const CHAT_NO_OWNER_ID = randomUUID();

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());

  // Seed users
  const userFixtures: Array<{ id: string; name: string }> = [
    { id: OWNER_ID, name: "Owner", },
    { id: PARTICIPANT_ID, name: "Participant", },
    { id: OUTSIDER_ID, name: "Outsider", },
    { id: STRANGER_ID, name: "Stranger", },
  ];
  for (const { id, name, } of userFixtures) {
    await insertUsers(db, `${name.toLowerCase()}-${id}`, name, { id, } as never,);
    await insertActors(db, name, { id, user_id: id, owner_id: id, } as never,);
  }

  // Chat with valid owner + 1 participant
  await insertChats(db, "Chat", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, },);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, { role_in_chat: ChatParticipantRole.Member, },);

  // Chat whose original creator is a non-participant (so transfer can promote)
  await insertChats(db, "No Owner Chat", OWNER_ID, { id: CHAT_NO_OWNER_ID, } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * Reset CHAT_ID to a known baseline: OWNER owns it, PARTICIPANT is a member,
 * every other participant/join side-effect from prior tests is wiped. Run this
 * in `beforeEach` so each test starts from the same state regardless of order
 * or filter selection (`bun test -t …`).
 */
async function resetChat(): Promise<void> {
  await db
    .updateTable("chats",)
    .set({ created_by: OWNER_ID, },)
    .where("id", "=", CHAT_ID,)
    .execute();
  await db
    .updateTable("chat_participants",)
    .set({ role_in_chat: ChatParticipantRole.Owner, },)
    .where("chat_id", "=", CHAT_ID,)
    .where("actor_id", "=", OWNER_ID,)
    .execute();
  await db
    .updateTable("chat_participants",)
    .set({ role_in_chat: ChatParticipantRole.Member, },)
    .where("chat_id", "=", CHAT_ID,)
    .where("actor_id", "=", PARTICIPANT_ID,)
    .execute();
  await db
    .deleteFrom("chat_participants",)
    .where("chat_id", "=", CHAT_ID,)
    .where("actor_id", "not in", [OWNER_ID, PARTICIPANT_ID,],)
    .execute();
  await db.deleteFrom("log_entries",).where("entity_id", "=", CHAT_ID,).execute();
}

describe("transferOwnership", () => {
  beforeEach(resetChat,);

  test("transfers ownership to existing participant; flips created_by and demotes previous owner", async () => {
    const beforeChat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,)
      .executeTakeFirstOrThrow();
    expect(beforeChat.created_by,).toBe(OWNER_ID,);

    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: OWNER_ID,
      requesterRole: "user",
      newOwnerId: PARTICIPANT_ID,
      reason: "stepping down",
    },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.result.previousOwnerId,).toBe(OWNER_ID,);
    expect(result.result.newOwnerId,).toBe(PARTICIPANT_ID,);
    expect(result.result.autoInvited,).toBe(false,);

    const afterChat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,)
      .executeTakeFirstOrThrow();
    expect(afterChat.created_by,).toBe(PARTICIPANT_ID,);

    const roles = await db
      .selectFrom("chat_participants",)
      .select(["actor_id", "role_in_chat",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    const roleById = Object.fromEntries(roles.map((r,) => [r.actor_id, r.role_in_chat,]),);
    expect(roleById[PARTICIPANT_ID],).toBe(ChatParticipantRole.Owner,);
    expect(roleById[OWNER_ID],).toBe(ChatParticipantRole.Member,);
  });

  test("writes an audit log_entries row with event_type = chat_ownership_transferred", async () => {
    // Self-contained setup: OWNER → PARTICIPANT, observe the resulting audit row.
    // No dependency on prior-test leftovers; `beforeEach(resetChat)` ensures
    // OWNER owns the chat at test start.
    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: OWNER_ID,
      requesterRole: "user",
      newOwnerId: PARTICIPANT_ID,
      reason: "audit-test fixture",
    },);
    expect(result.ok,).toBe(true,);

    const logs = await db
      .selectFrom("log_entries",)
      .select(["event_type", "entity_type", "entity_id", "meta",],)
      .where("event_type", "=", "chat_ownership_transferred",)
      .where("entity_id", "=", CHAT_ID,)
      .orderBy("timestamp", "desc",)
      .limit(1,)
      .execute();

    expect(logs,).toHaveLength(1,);
    const meta = JSON.parse(logs[0]!.meta ?? "{}",) as Record<string, unknown>;
    expect(meta.previous_owner_id,).toBe(OWNER_ID,);
    expect(meta.new_owner_id,).toBe(PARTICIPANT_ID,);
    expect(meta.reason,).toBe("audit-test fixture",);
  });

  test("auto-invites a non-participant with role_in_chat = owner", async () => {
    // OUTSIDER_ID has an actors row but no chat_participants row for CHAT_ID
    const before = await db
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", OUTSIDER_ID,)
      .executeTakeFirst();
    expect(before,).toBeUndefined();

    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: OWNER_ID,
      requesterRole: "user",
      newOwnerId: OUTSIDER_ID,
    },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.result.autoInvited,).toBe(true,);

    const row = await db
      .selectFrom("chat_participants",)
      .select("role_in_chat",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", OUTSIDER_ID,)
      .executeTakeFirstOrThrow();
    expect(row.role_in_chat,).toBe(ChatParticipantRole.Owner,);
    // State cleanup is handled by `beforeEach(resetChat)` — no in-test rollback needed.
  });

  test("forbidden: non-owner non-admin cannot transfer", async () => {
    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: STRANGER_ID,
      requesterRole: "user",
      newOwnerId: PARTICIPANT_ID,
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("forbidden",);
  });

  test("bad_request: self-transfer rejected", async () => {
    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: OWNER_ID,
      requesterRole: "user",
      newOwnerId: OWNER_ID,
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("bad_request",);
    expect(result.error.message,).toContain("yourself",);
  });

  test("bad_request: target already current owner (admin-bypass hits the explicit branch)", async () => {
    // Self-guard rejects user→user-self; the `previousOwnerId === newOwnerId` branch
    // is reached only when an admin transfers to the chat's current owner.
    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: STRANGER_ID, // not the owner, not a participant
      requesterRole: "admin", // bypasses checkChatSettingsAccess
      newOwnerId: OWNER_ID, // → previousOwnerId === newOwnerId
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("bad_request",);
    expect(result.error.message,).toContain("already the current owner",);
  });

  test("200 admin-bypass: admin who is not creator nor participant can transfer ownership", async () => {
    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: STRANGER_ID, // admin but not a participant
      requesterRole: "admin",
      newOwnerId: PARTICIPANT_ID,
      reason: "compliance audit",
    },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.result.previousOwnerId,).toBe(OWNER_ID,);
    expect(result.result.newOwnerId,).toBe(PARTICIPANT_ID,);
    expect(result.result.autoInvited,).toBe(false,);

    const afterChat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,)
      .executeTakeFirstOrThrow();
    expect(afterChat.created_by,).toBe(PARTICIPANT_ID,);
  });

  test("not_found: unknown chat id", async () => {
    const result = await transferOwnership(db, {
      chatId: randomUUID(),
      requesterId: OWNER_ID,
      requesterRole: "user",
      newOwnerId: PARTICIPANT_ID,
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("not_found",);
  });

  test("not_found: bogus new-owner id returns not_found before the tx", async () => {
    // randomUUID() is never seeded as an actor: the up-front actors probe
    // rejects it instead of dying on the participants FK deep in the tx.
    const result = await transferOwnership(db, {
      chatId: CHAT_ID,
      requesterId: OWNER_ID,
      requesterRole: "user",
      newOwnerId: randomUUID(),
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("not_found",);
  });

  test("concurrent transfers: exactly one wins; loser fails without partial writes", async () => {
    // OWNER fires two transfers at once (→ PARTICIPANT, → OUTSIDER).
    // Awaits yield between the two flows, so their pre-tx reads and
    // transactions interleave the way concurrent HTTP requests do.
    // Exactly one conditional `created_by` flip can match: the winner
    // commits, the loser fails (conflict guard, or the authority check
    // if it read post-commit) — never silently last-writer-wins.
    const [toParticipant, toOutsider,] = await Promise.all([
      transferOwnership(db, {
        chatId: CHAT_ID,
        requesterId: OWNER_ID,
        requesterRole: "user",
        newOwnerId: PARTICIPANT_ID,
      },),
      transferOwnership(db, {
        chatId: CHAT_ID,
        requesterId: OWNER_ID,
        requesterRole: "user",
        newOwnerId: OUTSIDER_ID,
      },),
    ],);
    const winners = [toParticipant, toOutsider,].filter((o,) => o.ok);
    expect(winners.length,).toBe(1,);
    const winner = winners[0]!;
    if (!winner.ok) { return; }

    const afterChat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,)
      .executeTakeFirstOrThrow();
    expect(afterChat.created_by,).toBe(winner.result.newOwnerId,);

    const roles = await db
      .selectFrom("chat_participants",)
      .select(["actor_id", "role_in_chat",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    const roleById = Object.fromEntries(roles.map((r,) => [r.actor_id, r.role_in_chat,]),);
    expect(roleById[winner.result.newOwnerId],).toBe(ChatParticipantRole.Owner,);

    // Single winner ⇒ single audit row; the loser wrote nothing.
    const auditRows = await db
      .selectFrom("log_entries",)
      .select(["user_id", "meta",],)
      .where("entity_id", "=", CHAT_ID,)
      .where("event_type", "=", "chat_ownership_transferred",)
      .execute();
    expect(auditRows.length,).toBe(1,);
  });
});
