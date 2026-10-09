// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN decision gate: a chat with an unresolved choice or question blocks
 * free-sending with a 409 until the player resolves or skips it.
 *
 * The decision table is the load-bearing part: an opted-out chat must pass
 * through, `dismissed` rows must not block (otherwise a skipped decision
 * wedges the chat forever), and the answer must survive a skip.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { VnChoiceStatus, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { enforceVnDecisionGate, } from "./guards";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let db: Kysely<DB>;
let ownerId: string;
let optedIn: string;
let optedOut: string;
let choiceId: string;
let questionId: string;

/** Create a chat whose gm_config toggles the per-chat VN opt-in. */
async function makeChat(name: string, enabled: boolean,): Promise<string> {
  const id = uid();
  await insertChats(
    db,
    name,
    ownerId,
    { id, gm_config: JSON.stringify({ vnChoicesEnabled: enabled, },), } as never,
  );

  return id;
}

const NOW = new Date().toISOString();

/** Seed one `available` choice and one `available` question. */
async function seedPending(): Promise<void> {
  choiceId = uid();
  questionId = uid();

  await db
    .insertInto("vn_choices",)
    .values({
      id: choiceId,
      chat_id: optedIn,
      scene_index: 0,
      label: "Left or right?",
      status: "available",
      created_at: NOW,
    },)
    .execute();

  await db
    .insertInto("vn_questions",)
    .values({
      id: questionId,
      chat_id: optedIn,
      scene_index: 0,
      question_text: "Why did you come?",
      status: "available",
      created_at: NOW,
    },)
    .execute();
}

/** Insert a single pending choice into an arbitrary chat. */
async function seedChoice(chat: string, label: string,): Promise<void> {
  await db
    .insertInto("vn_choices",)
    .values({
      id: uid(),
      chat_id: chat,
      scene_index: 0,
      label,
      status: "available",
      created_at: NOW,
    },)
    .execute();
}

/** @param chat */
async function clearPending(chat: string,): Promise<void> {
  await db.deleteFrom("vn_choices",).where("chat_id", "=", chat,).execute();
  await db.deleteFrom("vn_questions",).where("chat_id", "=", chat,).execute();
}

/** Resolve every pending row in one chat across both tables. */
async function resolveAll(chat: string, status: VnChoiceStatus,): Promise<void> {
  await db
    .updateTable("vn_choices",)
    .set({ status, },)
    .where("chat_id", "=", chat,)
    .execute();

  await db
    .updateTable("vn_questions",)
    .set({ status, },)
    .where("chat_id", "=", chat,)
    .execute();
}

describe("enforceVnDecisionGate", () => {
  beforeAll(async () => {
    createLogger({ level: "error", },);
    const created: TestDb = await createTestDb();
    db = created.db;

    ownerId = uid();
    await insertUsers(db, "gm", "GM", { id: ownerId, } as never,);

    optedIn = await makeChat("Opted In", true,);
    optedOut = await makeChat("Opted Out", false,);
  },);

  beforeEach(async () => {
    await clearPending(optedIn,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("passes when the chat never opted in", async () => {
    await seedChoice(optedOut, "stale",);

    expect(await enforceVnDecisionGate(db, optedOut, ownerId,),).toBeNull();
  });

  test("passes with no pending decision", async () => {
    expect(await enforceVnDecisionGate(db, optedIn, ownerId,),).toBeNull();
  });

  test("409s while a choice is pending", async () => {
    await seedPending();

    const res = await enforceVnDecisionGate(db, optedIn, ownerId,);
    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(409,);
  });

  // A timestamp-based skip would leave status='available' and wedge the chat;
  // the status value is what actually reopens sending.
  test("dismissed rows stop blocking", async () => {
    await seedPending();
    await resolveAll(optedIn, "dismissed",);

    expect(await enforceVnDecisionGate(db, optedIn, ownerId,),).toBeNull();
  });

  test("one resolved table is not enough while the other still has a pending row", async () => {
    await seedPending();
    await db
      .updateTable("vn_choices",)
      .set({ status: "selected", },)
      .where("chat_id", "=", optedIn,)
      .execute();

    expect(await enforceVnDecisionGate(db, optedIn, ownerId,),).not.toBeNull();
  });

  test("names the blocking kind in the message", async () => {
    await seedPending();
    await db
      .updateTable("vn_questions",)
      .set({ status: "answered", },)
      .where("chat_id", "=", optedIn,)
      .execute();

    const res = await enforceVnDecisionGate(db, optedIn, ownerId,);
    expect(await res!.text(),).toContain("choice",);
  });

  test("a decision in another chat does not block", async () => {
    const other = await makeChat("Other", true,);
    await seedChoice(other, "theirs",);

    expect(await enforceVnDecisionGate(db, optedIn, ownerId,),).toBeNull();
  });

  test("passes for a chat that does not exist", async () => {
    expect(await enforceVnDecisionGate(db, uid(), ownerId,),).toBeNull();
  });
});
