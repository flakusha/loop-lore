// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Harness turn persistence tests: the rows one harness turn writes and the
 * contract the existing message readers impose on them.
 *
 * Resource contract: ONE in-memory migrated DB per test, seeded with its own
 * user/actor/chat; released in afterEach. Every test also owns UNIQUE row ids
 * (a per-test tag), so no two tests can address the same rows even if they
 * ever shared a database. No ports, no global test-database override, no
 * cross-test state; the one test that drives a real turn owns its own fixture
 * subprocess (unique mkdtemp dir) and reaps it in a finally block.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type KyselyPlugin, SelectQueryNode, sql, } from "kysely";
import { randomUUID, } from "node:crypto";
import { initSmk, } from "../../crypto/smk";
import { MessageStatus, } from "../../db/enums";
import { parseToolCalls, parseToolResultMeta, } from "../../routes/messages/helpers";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { type HarnessTurnResult, } from "./adapter-types";
import { startFakeAcp, } from "./fake-acp-server";
import { OmpAcpAdapter, } from "./omp";
import { persistHarnessTurn, } from "./turn-persistence";
import { type HarnessTurnTranscript, } from "./turn-transcript";

// Each test owns its own user/actor/chat ids: the rows live in a per-test
// in-memory DB, but unique ids keep one test's rows out of another's reach
// even if the DB handling ever changes.
let userId: string;
let actorId: string;
let chatId: string;
let tag = "";
let idCounter = 0;

let fixture: TestDb;

/** A transcript with one finished tool call and one unfinished one. */
function transcript(): HarnessTurnTranscript {
  return {
    text: "the answer",
    thinking: ["first thought",],
    modes: [],
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
    costUsd: null,
    acpSessionId: "sess-1",
    transcript: transcript(),
    ...overrides,
  };
}

beforeEach(async () => {
  tag = `t${++idCounter}`;
  userId = `user-harness-turn-${tag}`;
  actorId = `actor-harness-turn-${tag}`;
  chatId = `chat-harness-turn-${tag}`;
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

  it("stores the cost the harness reported next to the token counts", async () => {
    const persisted = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn({
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7, },
        costUsd: 0.012,
      },),
      turnKey: "turn-cost",
    },);

    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("id", "=", persisted.assistantMessageId,).executeTakeFirstOrThrow();

    expect(row.token_cost,).toBe(0.012,);
  });

  it("persists the cost a usage_update reported when the response carried no usage", async () => {
    // The stable ACP v1 PromptResponse has no `usage` property, so a
    // conformant harness reports its cost ONLY through the usage_update.
    const server = startFakeAcp({
      FAKE_MODELS: "m",
      FAKE_NO_USAGE: "1",
      FAKE_EVENTS: JSON.stringify([
        { sessionUpdate: "usage_update", used: 120, size: 1000, cost: { amount: 0.5, currency: "USD", }, },
      ],),
    },);

    const adapter = new OmpAcpAdapter({ command: server.argv, requestTimeoutMs: 4000, },);

    try {
      const turn = await adapter.prompt("hi",);
      expect(turn.usage,).toBeNull();

      const persisted = await persistHarnessTurn({
        database: fixture.db,
        chatId,
        actorId,
        profile: "omp",
        transcript: turn.transcript,
        turn,
        turnKey: "turn-usage-cost",
      },);

      const row = await fixture.db.selectFrom("messages",).selectAll()
        .where("id", "=", persisted.assistantMessageId,).executeTakeFirstOrThrow();

      expect(row.token_cost,).toBe(0.5,);
      expect(row.token_count_total,).toBeNull();
    } finally {
      adapter.close();
      server.stop();
    }
  });

  it("persists the cost a usage_update reported after the prompt response", async () => {
    // The cost rides a session notification: it may arrive after the response,
    // and the row must still carry it.
    const server = startFakeAcp({
      FAKE_MODELS: "m",
      FAKE_NO_USAGE: "1",
      FAKE_LATE_USAGE: JSON.stringify({
        sessionUpdate: "usage_update",
        used: 120,
        size: 1000,
        cost: { amount: 0.25, currency: "USD", },
      },),
    },);

    const adapter = new OmpAcpAdapter({ command: server.argv, requestTimeoutMs: 4000, },);

    try {
      const turn = await adapter.prompt("hi",);

      const persisted = await persistHarnessTurn({
        database: fixture.db,
        chatId,
        actorId,
        profile: "omp",
        transcript: turn.transcript,
        turn,
        turnKey: "turn-late-usage-cost",
      },);

      const row = await fixture.db.selectFrom("messages",).selectAll()
        .where("id", "=", persisted.assistantMessageId,).executeTakeFirstOrThrow();

      expect(row.token_cost,).toBe(0.25,);
    } finally {
      adapter.close();
      server.stop();
    }
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

  it("scrubs unsafe markup from a tool result before it reaches storage", async () => {
    const dirty = `<script>alert(1)</script><img src=x onerror="steal()">keep me`;
    const hostile: HarnessTurnTranscript = {
      ...transcript(),
      toolResults: [{ toolCallId: "tc-1", name: "grep", status: "completed", content: dirty, error: false, },],
    };

    await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: hostile,
      turn: turn({ transcript: hostile, },),
      turnKey: "turn-sanitize",
    },);

    const row = await fixture.db.selectFrom("messages",).selectAll()
      .where("content_type", "=", "tool_result",).executeTakeFirstOrThrow();

    expect(row.content,).not.toContain("<script",);
    expect(row.content,).not.toContain("onerror",);
    expect(row.content,).toContain("keep me",);
    expect(row.content_plaintext,).toContain("keep me",);
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

  it("replays the winner's row when a concurrent writer claimed the turn key", async () => {
    // The pre-read must not see the winner's row (that is the race window),
    // so the winner is inserted right after that read returns; the insert is
    // then the first thing that hits the enforced unique index.
    const winnerId = `winner-${tag}`;
    let armed = false;
    let fired = false;
    const racingDb = (fixture.db as unknown as { withPlugin: (plugin: KyselyPlugin,) => unknown })
      .withPlugin({
        transformQuery: (args,) => {
          if (!fired && SelectQueryNode.is(args.node,)) { armed = true; }
          return args.node;
        },
        transformResult: async (args,) => {
          if (armed) {
            armed = false;
            fired = true;
            await fixture.db.insertInto("messages",).values({
              id: winnerId,
              chat_id: chatId,
              actor_id: actorId,
              parent_id: null,
              role: "assistant",
              content: "the winner's answer",
              content_format: "markdown",
              content_type: "text",
              content_encoding: "identity",
              status: "confirmed",
              visibility: "visible",
              idempotency_key: "harness:omp:turn-race",
            },).execute();
          }

          return args.result;
        },
      },) as typeof fixture.db;

    const persisted = await persistHarnessTurn({
      database: racingDb,
      chatId,
      actorId,
      profile: "omp",
      transcript: transcript(),
      turn: turn(),
      turnKey: "turn-race",
    },);

    expect(persisted.assistantMessageId,).toBe(winnerId,);
    const rows = await fixture.db.selectFrom("messages",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
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

describe("CG-18 residual — harness turn rows are FTS-searchable", () => {
  /** Transcript with unique watchwords for both the assistant and tool rows. */
  function ftsTranscript(assistantWord: string, toolWord: string,): HarnessTurnTranscript {
    return {
      text: `assistant watchword ${assistantWord} end`,
      thinking: [],
      modes: [],
      toolCalls: [
        { id: `tc-${toolWord}`, name: "grep", kind: "read", arguments: "{}", },
      ],
      toolResults: [
        {
          toolCallId: `tc-${toolWord}`,
          name: "grep",
          status: "completed",
          content: `tool watchword ${toolWord} end`,
          error: false,
        },
      ],
    };
  }

  it("encryption off: assistant and tool rows carry mirrors and FTS MATCH finds both", async () => {
    const assistantWord = `cg18harness${randomUUID().replaceAll("-", "",)}`;
    const toolWord = `cg18toolrow${randomUUID().replaceAll("-", "",)}`;
    const persisted = await persistHarnessTurn({
      database: fixture.db,
      chatId,
      actorId,
      profile: "omp",
      transcript: ftsTranscript(assistantWord, toolWord,),
      turn: turn(),
      turnKey: `cg18-${assistantWord}`,
    },);

    const assistant = await fixture.db
      .selectFrom("messages",)
      .select(["id", "content_plaintext",],)
      .where("id", "=", persisted.assistantMessageId,)
      .executeTakeFirstOrThrow();

    const toolRow = await fixture.db
      .selectFrom("messages",)
      .select(["id", "content_plaintext",],)
      .where("id", "=", persisted.toolResultIds[0]!,)
      .executeTakeFirstOrThrow();

    expect(assistant.content_plaintext,).toBe(`assistant watchword ${assistantWord} end`,);
    expect(toolRow.content_plaintext,).toBe(`tool watchword ${toolWord} end`,);

    for (const [word, id,] of [[assistantWord, assistant.id,], [toolWord, toolRow.id,],] as const) {
      const match = await sql<
        { message_id: string }
      >`SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${word}`.execute(fixture.db,);

      expect(match.rows.map((r,) => r.message_id),).toContain(id,);
    }
  });

  it("encryption on: both rows stay FTS-searchable without blind tokens", async () => {
    const assistantWord = `cg18encasst${randomUUID().replaceAll("-", "",)}`;
    const toolWord = `cg18enctool${randomUUID().replaceAll("-", "",)}`;
    await initSmk({
      serverEncryptionKey: "c".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);

    process.env.ENABLE_TOKEN_INDEXING = "1";
    try {
      await fixture.db.updateTable("users",).set({ encryption_secret: "d".repeat(64,), },)
        .where("id", "=", userId,).execute();

      await fixture.db.updateTable("chats",).set({ encryption_level: "standard", },)
        .where("id", "=", chatId,).execute();

      const persisted = await persistHarnessTurn({
        database: fixture.db,
        chatId,
        actorId,
        profile: "omp",
        transcript: ftsTranscript(assistantWord, toolWord,),
        turn: turn(),
        turnKey: `cg18enc-${assistantWord}`,
      },);

      for (
        const [id, expected,] of [
          [persisted.assistantMessageId, `assistant watchword ${assistantWord} end`,],
          [persisted.toolResultIds[0]!, `tool watchword ${toolWord} end`,],
        ] as const
      ) {
        const row = await fixture.db
          .selectFrom("messages",)
          .select(["content", "content_plaintext",],)
          .where("id", "=", id,)
          .executeTakeFirstOrThrow();

        expect(row.content,).not.toBe(expected,);
        expect(row.content_plaintext,).toBe(expected,);
      }

      for (const word of [assistantWord, toolWord,]) {
        const match = await sql<
          { message_id: string }
        >`SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${word}`.execute(fixture.db,);

        expect(match.rows.map((r,) => r.message_id),).toContain(
          word === assistantWord ? persisted.assistantMessageId : persisted.toolResultIds[0]!,
        );
      }

      const blind = await fixture.db
        .selectFrom("message_search_tokens",)
        .select("term",)
        .where("message_id", "in", [persisted.assistantMessageId, ...persisted.toolResultIds,],)
        .execute();

      expect(blind,).toHaveLength(0,);
    } finally {
      delete process.env.ENABLE_TOKEN_INDEXING;
      await initSmk({
        required: false,
        compressThreshold: 1024,
        compressAlgorithm: "gzip",
      },);
    }
  });
});
