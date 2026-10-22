// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @file Tests for the message poll service (TASK-message-polls-votes):
 * create (one per message, input limits), single/multi vote round-trips,
 * double-vote dedup, close permissions, and closed-poll 409 rejection.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { closePoll, createPoll, getMessagePoll, listChatPolls, votePoll, } from "./polls";

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

const OWNER = "u-owner";
const VOTER = "u-voter";
const OTHER = "u-other";

beforeEach(async () => {
  await database.deleteFrom("poll_votes",).execute();
  await database.deleteFrom("message_polls",).execute();
  await database.deleteFrom("messages",).execute();
  await database.deleteFrom("chat_participants",).execute();
  await database.deleteFrom("chats",).execute();
  await database.deleteFrom("actors",).execute();
  await database.deleteFrom("users",).execute();
},);

async function seedWorld(): Promise<{ chatId: string; messageId: string }> {
  for (const id of [OWNER, VOTER, OTHER,]) {
    await insertUsers(database, id, "User", { id, } as never,);
    await insertActors(database, id, {
      id,
      user_id: id,
      owner_id: id,
    } as never,);
  }

  const chatId = "chat-1";
  await insertChats(database, "Poll Chat", OWNER, {
    id: chatId,
    type: "group",
    mode: "group",
  } as never,);

  await insertChatParticipants(database, chatId, OWNER, { role_in_chat: "owner", } as never,);
  await insertChatParticipants(database, chatId, VOTER, { role_in_chat: "member", } as never,);
  const messageId = await insertMessages(
    database,
    chatId,
    OWNER,
    "user",
    "Should we push forward?",
    { id: "msg-1", } as never,
  );

  return { chatId, messageId, };
}

describe("createPoll", () => {
  it("creates a poll and hydrates tallies", async () => {
    const { messageId, } = await seedWorld();
    const result = await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Push forward?",
      options: ["Yes", "No",],
      multi: false,
    },);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.poll.question,).toBe("Push forward?",);
    expect(result.poll.options,).toEqual(["Yes", "No",],);
    expect(result.poll.multi,).toBe(false,);
    expect(result.poll.closed,).toBe(false,);
  });

  it("rejects a second poll on the same message with conflict", async () => {
    const { messageId, } = await seedWorld();
    const base = {
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Push forward?",
      options: ["Yes", "No",],
      multi: false,
    };

    await createPoll(base,);
    const again = await createPoll(base,);
    expect(again.ok,).toBe(false,);
    if (again.ok) { return; }
    expect(again.error.code,).toBe("conflict",);
  });

  it("rejects invalid input with bad_request", async () => {
    const { messageId, } = await seedWorld();
    const result = await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "?",
      options: ["only-one",],
      multi: false,
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("bad_request",);
  });

  it("hides the message from users without chat access", async () => {
    const { messageId, } = await seedWorld();
    const result = await createPoll({
      database,
      messageId,
      userId: OTHER,
      userRole: null,
      question: "?",
      options: ["a", "b",],
      multi: false,
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("not_found",);
  });
});

describe("votePoll", () => {
  async function seedOpenPoll(multi: boolean,): Promise<string> {
    const { messageId, } = await seedWorld();
    const result = await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi,
    },);

    if (!result.ok) { throw new Error("seed failed",); }
    return messageId;
  }

  it("records a single-choice vote and replaces on re-vote", async () => {
    const messageId = await seedOpenPoll(false,);
    const first = await votePoll({
      database,
      messageId,
      userId: VOTER,
      userRole: null,
      optionIdx: 0,
    },);

    expect(first.ok,).toBe(true,);
    if (!first.ok) { return; }
    expect(first.poll.viewerOptionIdxs,).toEqual([0,],);

    const second = await votePoll({
      database,
      messageId,
      userId: VOTER,
      userRole: null,
      optionIdx: 1,
    },);

    expect(second.ok,).toBe(true,);
    if (!second.ok) { return; }
    expect(second.poll.viewerOptionIdxs,).toEqual([1,],);
    const tallyFor = (idx: number,): number => second.poll.tallies.find((t,) => t.optionIdx === idx)?.count ?? 0;
    expect(tallyFor(0,),).toBe(0,);
    expect(tallyFor(1,),).toBe(1,);
  });

  it("dedups double-votes on the same option (multi)", async () => {
    const messageId = await seedOpenPoll(true,);
    for (let i = 0; i < 2; i++) {
      const result = await votePoll({
        database,
        messageId,
        userId: VOTER,
        userRole: null,
        optionIdx: 1,
      },);

      expect(result.ok,).toBe(true,);
      if (!result.ok) { return; }
    }

    const poll = await getMessagePoll({ database, messageId, userId: VOTER, userRole: null, },);
    expect(poll.ok,).toBe(true,);
    if (!poll.ok) { return; }
    expect(poll.poll.tallies,).toEqual([{ optionIdx: 1, count: 1, },],);
  });

  it("allows distinct options on a multi poll", async () => {
    const messageId = await seedOpenPoll(true,);
    await votePoll({ database, messageId, userId: VOTER, userRole: null, optionIdx: 0, },);
    const second = await votePoll({ database, messageId, userId: VOTER, userRole: null, optionIdx: 1, },);
    expect(second.ok,).toBe(true,);
    if (!second.ok) { return; }
    expect(second.poll.viewerOptionIdxs.sort(),).toEqual([0, 1,],);
  });

  it("rejects an out-of-range option index", async () => {
    const messageId = await seedOpenPoll(false,);
    const result = await votePoll({
      database,
      messageId,
      userId: VOTER,
      userRole: null,
      optionIdx: 5,
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("bad_request",);
  });
});

describe("closePoll", () => {
  it("closes and rejects subsequent votes with conflict", async () => {
    const { messageId, } = await seedWorld();
    await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi: false,
    },);

    const closed = await closePoll({ database, messageId, userId: OWNER, userRole: null, },);
    expect(closed.ok,).toBe(true,);
    if (!closed.ok) { return; }
    expect(closed.poll.closed,).toBe(true,);

    const vote = await votePoll({ database, messageId, userId: VOTER, userRole: null, optionIdx: 0, },);
    expect(vote.ok,).toBe(false,);
    if (vote.ok) { return; }
    expect(vote.error.code,).toBe("conflict",);
  });

  it("is idempotent for an already-closed poll", async () => {
    const { messageId, } = await seedWorld();
    await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi: false,
    },);

    await closePoll({ database, messageId, userId: OWNER, userRole: null, },);
    const again = await closePoll({ database, messageId, userId: OWNER, userRole: null, },);
    expect(again.ok,).toBe(true,);
  });

  it("denies close to a non-creator participant", async () => {
    const { messageId, } = await seedWorld();
    await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi: false,
    },);

    const denied = await closePoll({ database, messageId, userId: VOTER, userRole: null, },);
    expect(denied.ok,).toBe(false,);
    if (denied.ok) { return; }
    expect(denied.error.code,).toBe("forbidden",);
  });

  it("allows the chat owner who is not the poll creator", async () => {
    const { messageId, } = await seedWorld();
    await createPoll({
      database,
      messageId,
      userId: VOTER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi: false,
    },);

    const closed = await closePoll({ database, messageId, userId: OWNER, userRole: null, },);
    expect(closed.ok,).toBe(true,);
  });
});

describe("listChatPolls", () => {
  it("returns chat polls scoped to the viewer", async () => {
    const { chatId, messageId, } = await seedWorld();
    await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi: false,
    },);

    const result = await listChatPolls({ database, chatId, userId: VOTER, userRole: null, },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.polls,).toHaveLength(1,);
    expect(result.polls[0]?.messageId,).toBe(messageId,);
  });

  it("denies non-participants", async () => {
    const { chatId, messageId, } = await seedWorld();
    await createPoll({
      database,
      messageId,
      userId: OWNER,
      userRole: null,
      question: "Pick",
      options: ["A", "B",],
      multi: false,
    },);

    const result = await listChatPolls({ database, chatId, userId: OTHER, userRole: null, },);
    expect(result.ok,).toBe(false,);
  });
});
