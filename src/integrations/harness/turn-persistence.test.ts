// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Harness turn persistence tests: the rows one harness turn writes and the
 * contract the existing message readers impose on them.
 *
 * Resource contract: ONE in-memory migrated DB per test, seeded with its own
 * user/actor/chat; released in afterEach. No child process, no ports, no
 * global test-database override, no cross-test state.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { MessageStatus, } from "../../db/enums";
import { parseToolCalls, parseToolResultMeta, } from "../../routes/messages/helpers";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { type HarnessTurnResult, } from "./adapter-types";
import { persistHarnessTurn, } from "./turn-persistence";
import { type HarnessTurnTranscript, } from "./turn-transcript";

const userId = "user-harness-turn";
const actorId = "actor-harness-turn";
const chatId = "chat-harness-turn";

let fixture: TestDb;

/** A transcript with one finished tool call and one unfinished one. */
function transcript(): HarnessTurnTranscript {
  return {
    text: "the answer",
    thinking: ["first thought",],
    toolCalls: [
      { id: "tc-1", name: "grep", kind: "read", arguments: '{"q":1}', },
      { id: "tc-2", name: "write", kind: "edit", arguments: "{}", },
    ],
    toolResults: [
      { toolCallId: "tc-1", name: "grep", status: "completed", content: "one match", error: false, },
      { toolCallId: "tc-2", name: "write", status: "in_progress", content: "working", error: false, },
    ],
  };
}

/** The turn the transcript belongs to. */
function turn(overrides?: Partial<HarnessTurnResult>,): HarnessTurnResult {
  return {
    text: "the answer",
    stopReason: "end_turn",
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7, },
    acpSessionId: "sess-1",
    transcript: transcript(),
    ...overrides,
  };
}

beforeEach(async () => {
  fixture = await createTestDb();
  await fixture.db.insertInto("users",).values({
    id: userId,
    username: "harness-turn",
    display_name: "Harness Turn",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "Alice", {
    id: actorId,
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await fixture.db.insertInto("chats",).values({
    id: chatId,
    name: "Harness Turn",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

describe("persistHarnessTurn", () => {
  it("writes the assistant row with text, tool calls and reasoning", async () => {
    const persisted = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn(),
      turnKey: "turn-1",
    },);

    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("id", "=", persisted.assistantMessageId,).executeTakeFirstOrThrow();

    expect(row.content,).toBe("the answer",);
    expect(row.role,).toBe("assistant",);
    expect(row.content_type,).toBe("text",);
    expect(row.status,).toBe("confirmed",);
    expect(row.visibility,).toBe("visible",);
    expect(row.token_count_total,).toBe(7,);
    expect(row.metadata,).toContain('"harness":"acp"',);
    expect(row.metadata,).toContain('"profile":"omp"',);
  });

  it("writes the tool_calls column in the shape the message readers parse", async () => {
    const persisted = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn(),
      turnKey: "turn-2",
    },);

    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("id", "=", persisted.assistantMessageId,).executeTakeFirstOrThrow();

    const calls = parseToolCalls(row.tool_calls,);
    expect(calls,).not.toBeNull();
    expect(calls![0]!.id,).toBe("tc-1",);
    expect(calls![0]!.function.name,).toBe("grep",);
    expect(calls![0]!.function.arguments,).toBe('{"q":1}',);
  });

  it("writes one tool_result row per FINISHED call, linked to the assistant row", async () => {
    const persisted = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn(),
      turnKey: "turn-3",
    },);

    expect(persisted.toolResultIds,).toHaveLength(1,);
    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("id", "=", persisted.toolResultIds[0]!,).executeTakeFirstOrThrow();

    expect(row.content_type,).toBe("tool_result",);
    expect(row.parent_id,).toBe(persisted.assistantMessageId,);
    expect(row.content,).toBe("one match",);
    const meta = parseToolResultMeta(row.metadata,);
    expect(meta.toolName,).toBe("grep",);
    expect(meta.toolError,).toBe(false,);
  });

  it("marks a failed tool result as an error for the readers", async () => {
    const failed: HarnessTurnTranscript = {
      ...transcript(),
      toolResults: [{ toolCallId: "tc-1", name: "grep", status: "failed", content: "boom", error: true, },],
    };

    await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: failed,
      turn: turn({ transcript: failed, },),
      turnKey: "turn-4",
    },);

    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("content_type", "=", "tool_result",).executeTakeFirstOrThrow();

    expect(parseToolResultMeta(row.metadata,).toolError,).toBe(true,);
  });

  it("writes a partial row for a cancelled turn", async () => {
    const persisted = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn({ stopReason: "cancelled", },),
      turnKey: "turn-5",
      status: MessageStatus.Partial,
    },);

    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("id", "=", persisted.assistantMessageId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("partial",);
  });

  it("writes nothing when the same turn key is replayed", async () => {
    const first = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn(),
      turnKey: "turn-6",
    },);

    const second = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn(),
      turnKey: "turn-6",
    },);

    expect(second.assistantMessageId,).toBe(first.assistantMessageId,);
    const rows = await fixture.db.selectFrom("messages",).selectAll().execute();
    expect(rows,).toHaveLength(2,);
  });
});
