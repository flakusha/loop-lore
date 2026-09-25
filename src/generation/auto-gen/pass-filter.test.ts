// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cascade opt-out filter tests: [PASS] suffix detection and first-class
 * turn_skip event promotion (TASK-turn-skip-event-and-persistence).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { decryptAtRest, getChatEncryptionLevel, } from "../../crypto";
import { MessageContentType, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { filterPassedActors, } from "./pass-filter";

function makeDeps() {
  return { getChatEncryptionLevel, decryptAtRest, };
}

describe("filterPassedActors turn_skip promotion", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const AI_A = crypto.randomUUID();
  const AI_B = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_ID, } as never,);
    await insertChats(db, "Cascade Chat", OWNER_ID, { id: CHAT_ID, } as never,);
    for (const id of [AI_A, AI_B,]) {
      await insertActors(db, id, { id, actor_type: "character", agent_type: "ai", owner_id: OWNER_ID, } as never,);
      await insertChatParticipants(db, CHAT_ID, id, { role_in_chat: "member", },);
    }
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  const participants = [
    { actor_id: AI_A, actor_type: "character", agent_type: "ai", display_name: "A", },
    { actor_id: AI_B, actor_type: "character", agent_type: "ai", display_name: "B", },
  ];

  test("latest message ending with [PASS] opts the actor out", async () => {
    await insertMessages(db, CHAT_ID, AI_A, MessageRole.Character, "I have nothing to add [PASS]", {
      content_plaintext: "I have nothing to add [PASS]",
    },);
    await insertMessages(db, CHAT_ID, AI_B, MessageRole.Character, "I am here!",);
    const res = await filterPassedActors({
      database: db,
      chatId: CHAT_ID,
      aiParticipantsRaw: participants,
      deps: makeDeps(),
      log: createLogger({ level: "error", },).child({ module: "pass-filter-test", },),
    },);
    expect(res.filtered,).toBe(1,);
    expect(res.eligible.map((p,) => p.actor_id),).toEqual([AI_B,],);
  });

  test("latest message with content_type=turn_skip opts the actor out without decryption", async () => {
    await insertMessages(db, CHAT_ID, AI_A, MessageRole.System, "skips this beat (hold)", {
      content_type: MessageContentType.TurnSkip,
      content_plaintext: "skips this beat (hold)",
    },);
    await insertMessages(db, CHAT_ID, AI_B, MessageRole.Character, "I am here!",);
    const res = await filterPassedActors({
      database: db,
      chatId: CHAT_ID,
      aiParticipantsRaw: participants,
      deps: makeDeps(),
      log: createLogger({ level: "error", },).child({ module: "pass-filter-test", },),
    },);
    expect(res.filtered,).toBe(1,);
    expect(res.eligible.map((p,) => p.actor_id),).toEqual([AI_B,],);
  });

  test("a newer real message after the turn_skip restores eligibility", async () => {
    await insertMessages(db, CHAT_ID, AI_A, MessageRole.System, "skips this beat (hold)", {
      content_type: MessageContentType.TurnSkip,
      content_plaintext: "skips this beat (hold)",
    },);
    await insertMessages(db, CHAT_ID, AI_A, MessageRole.Character, "Actually, I am back.",);
    const res = await filterPassedActors({
      database: db,
      chatId: CHAT_ID,
      aiParticipantsRaw: participants,
      deps: makeDeps(),
      log: createLogger({ level: "error", },).child({ module: "pass-filter-test", },),
    },);
    expect(res.filtered,).toBe(0,);
    expect(res.eligible,).toHaveLength(2,);
  });
});
