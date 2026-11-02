// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Command Integration Tests
 *
 * Drives `/battle`, `/attack`, and `/heal` through the real slash-command
 * dispatch (src/routes/messages/command.ts) over a test DB, verifying the
 * command → battles-service → persisted state round trip and the owner role
 * gate.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { dispatchCommand, } from "../../routes/messages/command";
import { getActiveBattle, } from "../../rpg/service/battles";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import "./index"; // register all slash commands (self-registering)

const CALLER_ACTOR_ID = "caller-user";
const ALICE_ACTOR_ID = "alice-char";
const ORC_ACTOR_ID = "orc-char";

/**
 * @param db
 * @param chatId
 * @param content
 */
async function dispatch(db: Kysely<DB>, chatId: string, content: string,): Promise<Response> {
  const result = await dispatchCommand(db, {} as never, CALLER_ACTOR_ID, chatId, content,);
  if (!result.handled) {
    throw new Error(`Expected command to be handled: ${content}`,);
  }

  return result.response;
}

describe("battle commands via slash dispatch", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    chatId = uid();

    // Caller user + owner participant (commands are owner-gated).
    await insertUsers(
      db,
      `user-${CALLER_ACTOR_ID}`,
      "Battle Caller",
      { id: CALLER_ACTOR_ID, role: "solo", status: "active", settings: "{}", } as never,
    );

    await insertChats(db, "Battle Chat", CALLER_ACTOR_ID, { id: chatId, } as never,);
    // The caller user needs a matching actor row (user-actor equivalence) for
    // the chat_participants.actor_id FK.
    await insertActors(db, "Battle Caller", {
      id: CALLER_ACTOR_ID,
      actor_type: "user",
      agent_type: "none",
      user_id: CALLER_ACTOR_ID,
      owner_id: CALLER_ACTOR_ID,
    } as never,);

    await insertChatParticipants(db, chatId, CALLER_ACTOR_ID, { role_in_chat: "owner", } as never,);

    // Two combatant characters with stats + participants.
    for (
      const [actorId, name, hp,] of [
        [ALICE_ACTOR_ID, "Alice", 30,],
        [ORC_ACTOR_ID, "Orc", 20,],
      ] as const
    ) {
      await insertActors(db, name, {
        id: actorId,
        actor_type: "character",
        agent_type: "ai",
        user_id: null,
        owner_id: null,
      } as never,);

      await insertCharacterStats(db, actorId, hp, hp, 16, {
        str: 16,
        dex: 14,
        con: 12,
        int: 10,
        wis: 8,
        cha: 6,
        level: 5,
      } as never,);

      await insertChatParticipants(db, chatId, actorId, { role_in_chat: "member", } as never,);
    }
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param res
   */
  async function sysMsg(res: Response,): Promise<string> {
    const body = await res.json() as { systemMessage?: string };
    return body.systemMessage ?? "";
  }

  it("rejects /battle for a non-owner participant", async () => {
    // Caller has no owner participant row in this chat -> role defaults to
    // Member, which is below the Owner gate.
    const otherChat = uid();
    await insertChats(db, "Other", CALLER_ACTOR_ID, { id: otherChat, } as never,);
    await insertChatParticipants(db, otherChat, CALLER_ACTOR_ID, { role_in_chat: "member", } as never,);

    const res = await dispatch(db, otherChat, "/battle start",);
    const msg = await sysMsg(res,);
    expect(msg,).toContain("Permission denied",);
  });

  it("/battle start creates an active battle from participants", async () => {
    const res = await dispatch(db, chatId, "/battle start",);
    const msg = await sysMsg(res,);
    expect(msg,).toContain("Battle started",);
    expect(msg,).toContain("Alice",);
    expect(msg,).toContain("Orc",);

    const active = await getActiveBattle({ database: db, }, chatId,);
    expect(active,).not.toBeNull();
    expect(active!.combatants,).toHaveLength(2,);
  });

  it("/battle status shows the active roster", async () => {
    const res = await dispatch(db, chatId, "/battle status",);
    const msg = await sysMsg(res,);
    expect(msg,).toContain("Battle — Round",);
    expect(msg,).toContain("Alice",);
    expect(msg,).toContain("Orc",);
  });

  it("/attack resolves against the active battle and persists", async () => {
    const before = await getActiveBattle({ database: db, }, chatId,);
    const orcBefore = before!.combatants.find((c,) => c.id === ORC_ACTOR_ID)!;

    const res = await dispatch(db, chatId, "/attack Orc",);
    const msg = await sysMsg(res,);
    expect(msg,).toContain("Orc",);

    const after = await getActiveBattle({ database: db, }, chatId,);
    const orcAfter = after!.combatants.find((c,) => c.id === ORC_ACTOR_ID)!;
    expect(orcAfter.hp,).toBeLessThanOrEqual(orcBefore.hp,);
  });

  it("/heal restores HP and persists", async () => {
    // Wound Alice first (the attack may hit or miss — both are valid).
    await dispatch(db, chatId, "/attack Alice",);
    const before = await getActiveBattle({ database: db, }, chatId,);
    const aliceBefore = before!.combatants.find((c,) => c.id === ALICE_ACTOR_ID)!;

    const res = await dispatch(db, chatId, `/heal Alice ${aliceBefore.maxHp},`,);
    const msg = await sysMsg(res,);

    const after = await getActiveBattle({ database: db, }, chatId,);
    const aliceAfter = after!.combatants.find((c,) => c.id === ALICE_ACTOR_ID)!;

    if (aliceBefore.hp < aliceBefore.maxHp) {
      // Heal applied — HP restored toward max.
      expect(msg,).toContain("healed",);
      expect(aliceAfter.hp,).toBeGreaterThan(aliceBefore.hp,);
    } else {
      // The self-attack missed; heal correctly short-circuits at full HP.
      expect(msg,).toContain("already at full HP",);
      expect(aliceAfter.hp,).toBe(aliceBefore.hp,);
    }
  });

  it("/battle end abandons the encounter", async () => {
    const res = await dispatch(db, chatId, "/battle end",);
    const msg = await sysMsg(res,);
    expect(msg,).toContain("Battle ended",);

    const active = await getActiveBattle({ database: db, }, chatId,);
    expect(active,).toBeNull();
  });

  it("/battle align marks an enemy so the roster reaches the defeat check", async () => {
    const alignRes = await dispatch(db, chatId, "/battle align Orc enemy",);
    expect(await sysMsg(alignRes,),).toContain("enemy",);

    // Rebuild the roster: Alice (player) + Orc (enemy).
    const startRes = await dispatch(db, chatId, "/battle start",);
    expect(await sysMsg(startRes,),).toContain("Battle started",);

    const battle = await getActiveBattle({ database: db, }, chatId,);
    expect(battle,).not.toBeNull();
    const alice = battle!.combatants.find((c,) => c.id === ALICE_ACTOR_ID)!;
    const orc = battle!.combatants.find((c,) => c.id === ORC_ACTOR_ID)!;
    expect(alice.isNpc,).toBe(false,);
    expect(orc.isNpc,).toBe(true,);
  });

  it("reports usage for an unknown subcommand", async () => {
    const res = await dispatch(db, chatId, "/battle frobnicate",);
    expect(await sysMsg(res,),).toContain("Usage:",);
  });

  it("reports no active encounter when ending an idle chat", async () => {
    const idleChat = uid();
    await insertChats(db, "Idle Chat", CALLER_ACTOR_ID, { id: idleChat, } as never,);
    await insertChatParticipants(db, idleChat, CALLER_ACTOR_ID, { role_in_chat: "owner", } as never,);

    const res = await dispatch(db, idleChat, "/battle end",);
    expect(await sysMsg(res,),).toContain("no active encounter",);
  });

  it("refuses to start with an empty roster", async () => {
    const emptyChat = uid();
    await insertChats(db, "Empty Roster Chat", CALLER_ACTOR_ID, { id: emptyChat, } as never,);
    await insertChatParticipants(db, emptyChat, CALLER_ACTOR_ID, { role_in_chat: "owner", } as never,);

    const res = await dispatch(db, emptyChat, "/battle start",);
    expect(await sysMsg(res,),).toContain("no combatants found",);
  });

  it("delegates use and social to the battle-actions handlers", async () => {
    const idleChat = uid();
    await insertChats(db, "Delegate Chat", CALLER_ACTOR_ID, { id: idleChat, } as never,);
    await insertChatParticipants(db, idleChat, CALLER_ACTOR_ID, { role_in_chat: "owner", } as never,);

    const useRes = await dispatch(db, idleChat, "/battle use potion",);
    expect((await sysMsg(useRes,)).length,).toBeGreaterThan(0,);

    const socialRes = await dispatch(db, idleChat, "/battle social taunt Orc",);
    expect((await sysMsg(socialRes,)).length,).toBeGreaterThan(0,);
  });

  it("reports align usage and unknown align targets", async () => {
    const badSide = await dispatch(db, chatId, "/battle align Orc sideways",);
    expect(await sysMsg(badSide,),).toContain("Usage:",);

    const noTarget = await dispatch(db, chatId, "/battle align ghost enemy",);
    expect(await sysMsg(noTarget,),).toContain("not found among combatants",);
  });
});
