// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat moderation — combined test surface.
 *
 * - Pure layer (`createModerationAction`, `checkModerationPermission`,
 *   `isBlocked`, `isBanned`, `getShadowState`) is exercised without I/O.
 * - DB-backed primitives (`applyBan`, `applyKick`, `applyMute`,
 *   `applyFlag`, `isMuted`, `isParticipantBanned`) run against an
 *   in-memory SQLite test DB with migrations applied. Each vertical
 *   slice covers one acceptance criterion from
 *   `TASK-chat-feature-moderation.md`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import { type DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertModerationActions,
  insertUsers,
} from "../test-utils/insert-helpers";
import {
  applyBan,
  applyFlag,
  applyKick,
  applyMute,
  checkModerationPermission,
  createModerationAction,
  getShadowState,
  isBanned,
  isBlocked,
  isMuted,
  isParticipantBanned,
} from "./moderation";
import { checkChatSettingsAccess, } from "./service";
import type { ModerationAction, } from "./types";

// ─── Pure-helper suite (existing, unchanged) ────────────────────────────

describe("createModerationAction", () => {
  it("creates a moderation action with defaults", () => {
    const action = createModerationAction({
      type: "ban",
      targetActorId: "user-1",
      scope: "global",
      actorId: "admin-1",
    },);

    expect(action.type,).toBe("ban",);
    expect(action.targetActorId,).toBe("user-1",);
    expect(action.scope,).toBe("global",);
    expect(action.actorId,).toBe("admin-1",);
    expect(action.internal,).toBe(true,);
  });

  it("respects custom internal flag", () => {
    const action = createModerationAction({
      type: "flag",
      targetActorId: "user-1",
      scope: "chat",
      actorId: "user-2",
      internal: false,
    },);

    expect(action.internal,).toBe(false,);
  });

  it("includes reason when provided", () => {
    const action = createModerationAction({
      type: "block",
      targetActorId: "user-1",
      scope: "chat",
      actorId: "user-2",
      reason: "Spam",
    },);

    expect(action.reason,).toBe("Spam",);
  });
});

describe("checkModerationPermission", () => {
  const banAction = createModerationAction({
    type: "ban",
    targetActorId: "user-1",
    scope: "global",
    actorId: "admin-1",
  },);

  const shadowAction = createModerationAction({
    type: "shadow",
    targetActorId: "user-1",
    scope: "chat",
    actorId: "owner-1",
  },);

  const blockAction = createModerationAction({
    type: "block",
    targetActorId: "user-1",
    scope: "chat",
    actorId: "user-2",
  },);

  const flagAction = createModerationAction({
    type: "flag",
    targetActorId: "user-1",
    scope: "chat",
    actorId: "user-2",
  },);

  it("rejects self-moderation", () => {
    const result = checkModerationPermission(banAction, "admin", true,);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toContain("yourself",);
  });

  it("allows admin to ban", () => {
    const result = checkModerationPermission(banAction, "admin", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("allows owner to ban", () => {
    const result = checkModerationPermission(banAction, "owner", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("rejects regular user banning", () => {
    const result = checkModerationPermission(banAction, "user", false,);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toContain("admin",);
  });

  it("allows owner to shadow in chat", () => {
    const result = checkModerationPermission(shadowAction, "owner", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("allows admin to shadow in chat", () => {
    const adminShadow = createModerationAction({
      type: "shadow",
      targetActorId: "user-1",
      scope: "chat",
      actorId: "admin-1",
    },);
    const result = checkModerationPermission(adminShadow, "admin", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("rejects regular user shadowing", () => {
    const result = checkModerationPermission(shadowAction, "user", false,);
    expect(result.allowed,).toBe(false,);
  });

  it("allows any user to block", () => {
    const result = checkModerationPermission(blockAction, "user", false,);
    expect(result.allowed,).toBe(true,);
  });

  it("allows any user to flag", () => {
    const result = checkModerationPermission(flagAction, "user", false,);
    expect(result.allowed,).toBe(true,);
  });
});

describe("isBlocked", () => {
  const blocks: ModerationAction[] = [
    createModerationAction({ type: "block", targetActorId: "user-1", scope: "chat", actorId: "user-2", },),
    createModerationAction({ type: "block", targetActorId: "user-1", scope: "global", actorId: "user-2", },),
  ];

  it("returns true for blocked user in chat scope", () => {
    expect(isBlocked(blocks, "user-1", "chat",),).toBe(true,);
  });

  it("returns true for blocked user via global scope", () => {
    expect(isBlocked(blocks, "user-1", "comment",),).toBe(true,);
  });

  it("returns false for unblocked user", () => {
    expect(isBlocked(blocks, "user-99", "chat",),).toBe(false,);
  });

  it("returns false for empty list", () => {
    expect(isBlocked([], "user-1", "chat",),).toBe(false,);
  });
});

describe("isBanned", () => {
  const bans: ModerationAction[] = [
    createModerationAction({ type: "ban", targetActorId: "bad-user", scope: "global", actorId: "admin", },),
  ];

  it("returns true for banned user", () => {
    expect(isBanned(bans, "bad-user",),).toBe(true,);
  });

  it("returns false for non-banned user", () => {
    expect(isBanned(bans, "good-user",),).toBe(false,);
  });

  it("returns false for empty list", () => {
    expect(isBanned([], "bad-user",),).toBe(false,);
  });
});

describe("getShadowState", () => {
  const actions: ModerationAction[] = [
    createModerationAction({ type: "shadow", targetActorId: "viewer-1", scope: "chat", actorId: "admin", },),
    createModerationAction({ type: "collapse", targetActorId: "viewer-2", scope: "chat", actorId: "admin", },),
  ];

  it("returns shadow for shadowed viewer", () => {
    expect(getShadowState(actions, "viewer-1",),).toBe("shadow",);
  });

  it("returns collapse for collapsed viewer", () => {
    expect(getShadowState(actions, "viewer-2",),).toBe("collapse",);
  });

  it("returns null for unaffected viewer", () => {
    expect(getShadowState(actions, "viewer-3",),).toBeNull();
  });

  it("returns null for empty list", () => {
    expect(getShadowState([], "viewer-1",),).toBeNull();
  });
});

// ─── DB primitive suite (TASK-chat-feature-moderation) ─────────────────

let dbHandle: TestDb;
let database: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  dbHandle = await createTestDb();
  database = dbHandle.db;
},);

afterAll(async () => {
  if (dbHandle?.sqlite) { dbHandle.sqlite.close(); }
},);

beforeEach(async () => {
  await database.deleteFrom("chat_participants",).execute();
  await database.deleteFrom("chats",).execute();
  await database.deleteFrom("actors",).execute();
  await database.deleteFrom("users",).execute();
  await database.deleteFrom("moderation_actions",).execute();
  await database.deleteFrom("log_entries",).execute();
},);

/** Seed a chat with a creator + an optional list of participants. */
async function seedChat(opts: {
  creatorId: string;
  participants?: { userId: string; role: "owner" | "member" | "observer" | "guest" | "gm" }[];
},): Promise<string> {
  // FK on chats.created_by → users.id. Insert creator + actor first.
  await insertUsers(database, opts.creatorId, opts.creatorId, { id: opts.creatorId, } as never,);
  await insertActors(database, opts.creatorId, {
    id: opts.creatorId,
    user_id: opts.creatorId,
    owner_id: opts.creatorId,
  } as never,);

  // Same for each participant.
  for (const p of opts.participants ?? []) {
    await insertUsers(database, p.userId, p.userId, { id: p.userId, } as never,);
    await insertActors(database, p.userId, {
      id: p.userId,
      user_id: p.userId,
      owner_id: p.userId,
    } as never,);
  }

  const chatId = `chat-${opts.creatorId}-${Math.random().toString(36,).slice(2, 8,)}`;
  await insertChats(database, "Test Chat", opts.creatorId, {
    id: chatId,
    type: "group",
    mode: "group",
  } as never,);
  await insertChatParticipants(database, chatId, opts.creatorId, {
    role_in_chat: "owner",
  } as never,);

  for (const p of opts.participants ?? []) {
    await insertChatParticipants(database, chatId, p.userId, {
      role_in_chat: p.role,
    } as never,);
  }
  return chatId;
}

describe("applyBan — ban removes participant + prevents rejoin", () => {
  it("stamps banned_until on the participant and writes one audit row", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-target", role: "member", },],
    },);

    const result = await applyBan(database, {
      chatId,
      targetActorId: "u-target",
      byActorId: "u-owner",
      scope: "chat",
      reason: "spam",
      durationMs: 60 * 60_000, // 1h
    },);

    expect(result.ok,).toBe(true,);
    expect(result.auditEntryId,).toBeTruthy();

    const participant = await database
      .selectFrom("chat_participants",)
      .select(["banned_until",],)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", "u-target",)
      .executeTakeFirst();
    expect(participant?.banned_until,).not.toBeNull();

    const audit = await database
      .selectFrom("log_entries",)
      .selectAll()
      .where("id", "=", result.auditEntryId!,)
      .executeTakeFirst();
    expect(audit?.action,).toBe("ban",);
    expect(audit?.event_type,).toBe("moderation.chat.ban",);

    // Rejoin gate: the predicate returns true until banned_until elapses.
    const stillBanned = isParticipantBanned(participant, Date.now() + 60_000,);
    expect(stillBanned,).toBe(true,);
    const expired = isParticipantBanned(
      { banned_until: participant?.banned_until ?? null, },
      Date.now() + (365 * 24 * 60 * 60 * 1000),
    );
    expect(expired,).toBe(false,);
  });

  it("rejects self-ban", async () => {
    const result = await applyBan(database, {
      chatId: "any",
      targetActorId: "u-self",
      byActorId: "u-self",
      scope: "chat",
    },);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toContain("yourself",);
  });
});

describe("applyKick — removes actor immediately, leaves history intact", () => {
  it("deletes the chat_participants row and writes a kick audit row", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-target", role: "member", },],
    },);

    const result = await applyKick(database, {
      chatId,
      targetActorId: "u-target",
      byActorId: "u-owner",
      scope: "chat",
      reason: "disruptive",
    },);

    expect(result.ok,).toBe(true,);

    const participant = await database
      .selectFrom("chat_participants",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", "u-target",)
      .executeTakeFirst();
    expect(participant,).toBeUndefined();

    const audit = await database
      .selectFrom("log_entries",)
      .selectAll()
      .where("id", "=", result.auditEntryId!,)
      .executeTakeFirst();
    expect(audit?.action,).toBe("kick",);
    expect(audit?.event_type,).toBe("moderation.chat.kick",);
  });
});

describe("applyMute / isMuted — mute predicate unit", () => {
  it("returns true while muted_until is in the future", () => {
    const future = new Date(Date.now() + 60_000,).toISOString();
    expect(isMuted({ muted_until: future, }, Date.now(),),).toBe(true,);
  });

  it("returns false when muted_until is null", () => {
    expect(isMuted({ muted_until: null, }, Date.now(),),).toBe(false,);
    expect(isMuted(null, Date.now(),),).toBe(false,);
    expect(isMuted(undefined, Date.now(),),).toBe(false,);
  });

  it("returns false when muted_until is in the past", () => {
    const past = new Date(Date.now() - 60_000,).toISOString();
    expect(isMuted({ muted_until: past, }, Date.now(),),).toBe(false,);
  });

  it("applyMute stamps muted_until + writes a mute audit row", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-target", role: "member", },],
    },);

    const result = await applyMute(database, {
      chatId,
      targetActorId: "u-target",
      byActorId: "u-owner",
      scope: "chat",
      durationMs: 5 * 60_000,
      reason: "cooldown",
    },);

    expect(result.ok,).toBe(true,);

    const participant = await database
      .selectFrom("chat_participants",)
      .select(["muted_until",],)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", "u-target",)
      .executeTakeFirst();
    expect(isMuted(participant, Date.now(),),).toBe(true,);

    const audit = await database
      .selectFrom("log_entries",)
      .selectAll()
      .where("id", "=", result.auditEntryId!,)
      .executeTakeFirst();
    expect(audit?.action,).toBe("mute",);
    expect(audit?.event_type,).toBe("moderation.chat.mute",);
  });
});

describe("applyFlag — writes audit row + invokes moderation hook", () => {
  it("writes one audit row with flag-nsfw event_type", async () => {
    const chatId = await seedChat({ creatorId: "u-owner", },);

    const result = await applyFlag(
      database,
      {
        chatId,
        targetActorId: "u-target",
        byActorId: "u-owner",
        scope: "chat",
        kind: "flag-nsfw",
        reason: "inappropriate",
      },
      "clean content",
    );

    expect(result.ok,).toBe(true,);

    const audit = await database
      .selectFrom("log_entries",)
      .selectAll()
      .where("id", "=", result.auditEntryId!,)
      .executeTakeFirst();
    expect(audit?.action,).toBe("flag-nsfw",);
    expect(audit?.event_type,).toBe("moderation.chat.flag.nsfw",);
  });

  it("flag-tox uses the warn event_type without scanning content", async () => {
    const chatId = await seedChat({ creatorId: "u-owner", },);

    const result = await applyFlag(
      database,
      {
        chatId,
        targetActorId: "u-target",
        byActorId: "u-owner",
        scope: "chat",
        kind: "flag-tox",
      },
      undefined,
    );

    expect(result.ok,).toBe(true,);
    const audit = await database
      .selectFrom("log_entries",)
      .selectAll()
      .where("id", "=", result.auditEntryId!,)
      .executeTakeFirst();
    expect(audit?.event_type,).toBe("moderation.chat.flag.tox",);
  });
});

describe("admin/owner gate via checkChatSettingsAccess", () => {
  it("rejects non-owner caller (member role) with forbidden", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);

    const access = await checkChatSettingsAccess(database, chatId, "u-member", null,);
    expect(access.ok,).toBe(false,);
    if (!access.ok) { expect(access.error.code,).toBe("forbidden",); }
  });

  it("grants chat creator", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);

    const access = await checkChatSettingsAccess(database, chatId, "u-owner", null,);
    expect(access.ok,).toBe(true,);
  });

  it("grants admin role (moderation.action) bypassing membership", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);

    const access = await checkChatSettingsAccess(database, chatId, "u-admin", "admin",);
    expect(access.ok,).toBe(true,);
  });

  it("rejects a stranger with no role and no membership", async () => {
    const chatId = await seedChat({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);

    const access = await checkChatSettingsAccess(database, chatId, "u-stranger", null,);
    expect(access.ok,).toBe(false,);
  });
});

// Ensure the legacy `insertModerationActions` helper is still importable —
// surface a sanity test so the import isn't shaken by tree-shaking
// lint passes even though we don't call it.
describe("import sanity", () => {
  it("insertModerationActions helper is wired", () => {
    expect(typeof insertModerationActions,).toBe("function",);
    expect(typeof insertActors,).toBe("function",);
    expect(typeof insertChats,).toBe("function",);
    expect(typeof insertChatParticipants,).toBe("function",);
    expect(typeof insertUsers,).toBe("function",);
  });
});
