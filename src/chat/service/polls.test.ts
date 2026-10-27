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

  it("turns a concurrent create into a conflict Result instead of a raw error", async () => {
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

    // Both calls pass the pre-check before either insert lands, so the loser
    // hits the UNIQUE index on message_polls.message_id.
    const results = await Promise.all([createPoll(base,), createPoll(base,),],);

    expect(results.map((r,) => (r.ok ? "ok" : r.error.code)).sort(),).toEqual(["conflict", "ok",],);
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

  it("returns every poll of a chat in a bounded number of queries", async () => {
    const { chatId, messageId, } = await seedWorld();
    const messageIds = [messageId,];
    for (const id of ["msg-2", "msg-3",]) {
      await insertMessages(database, chatId, OWNER, "user", `Poll on ${id}`, { id, } as never,);
      messageIds.push(id,);
    }

    const pollIds: string[] = [];
    for (const [index, id,] of messageIds.entries()) {
      const created = await createPoll({
        database,
        messageId: id,
        userId: OWNER,
        userRole: null,
        question: `Question ${index}`,
        options: [`${index}-a`, `${index}-b`,],
        multi: false,
      },);

      expect(created.ok,).toBe(true,);
      if (!created.ok) { return; }
      pollIds.push(created.poll.id,);
    }

    const [firstId, secondId, thirdId,] = pollIds;
    if (!firstId || !secondId || !thirdId) { throw new Error("expected three polls",); }

    await database
      .insertInto("poll_votes",)
      .values([
        { id: "v-1", poll_id: firstId, user_id: VOTER, option_idx: 0, },
        { id: "v-2", poll_id: firstId, user_id: OTHER, option_idx: 0, },
        { id: "v-3", poll_id: firstId, user_id: OWNER, option_idx: 1, },
        { id: "v-4", poll_id: secondId, user_id: VOTER, option_idx: 1, },
      ],)
      .execute();

    let queryCount = 0;
    const countingDb = database.withPlugin({
      transformQuery: (args,) => {
        queryCount++;
        return args.node;
      },
      transformResult: (args,) => args.result,
    },);

    const result = await listChatPolls({ database: countingDb, chatId, userId: VOTER, userRole: null, },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.polls,).toHaveLength(3,);
    expect(result.polls[0]?.options,).toEqual(["0-a", "0-b",],);
    expect(result.polls[0]?.tallies,).toEqual([{ optionIdx: 0, count: 2, }, { optionIdx: 1, count: 1, },],);
    expect(result.polls[0]?.viewerOptionIdxs,).toEqual([0,],);
    expect(result.polls[1]?.tallies,).toEqual([{ optionIdx: 1, count: 1, },],);
    expect(result.polls[1]?.viewerOptionIdxs,).toEqual([1,],);
    expect(result.polls[2]?.tallies,).toEqual([],);
    expect(queryCount,).toBeLessThanOrEqual(5,);

    // The query count must not grow with the number of polls: the per-poll
    // hydrate loop issued two queries per poll.
    const threePollQueries = queryCount;
    queryCount = 0;
    await database.deleteFrom("poll_votes",).where("poll_id", "in", [secondId, thirdId,],).execute();
    await database.deleteFrom("message_polls",).where("id", "in", [secondId, thirdId,],).execute();

    const single = await listChatPolls({ database: countingDb, chatId, userId: VOTER, userRole: null, },);
    expect(single.ok,).toBe(true,);
    expect(queryCount,).toBe(threePollQueries,);
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
