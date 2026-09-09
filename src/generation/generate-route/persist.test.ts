// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for storeToolResultRows.
 *
 * BUG-tool-call-result-no-frontend-rendering: tool outputs previously lived
 * only in the in-flight LLM conversation and were never persisted, so the
 * structured tool_calls column was dead data and tool errors were invisible
 * in chat history. These tests pin the persisted row contract:
 * content_type=tool_result, metadata.tool_call_id link, parent linkage.
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import type { GenerationMessage, } from "../types";
import { storeToolResultRows, } from "./tool-result-persist";

let db: Kysely<DB>;
let sqlite: Database;
const userId = "user-persist-tool-result";

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;

  await db.insertInto("users",).values({
    id: userId,
    username: "persisttoolresult",
    display_name: "Persist Tool Result",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();
  await insertActors(db, "Alice", {
    id: "actor-ai-persist",
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);
  await db.insertInto("chats",).values({
    id: "chat-persist-tool-result",
    name: "Persist Tool Result",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
  await db.insertInto("chat_participants",).values({
    chat_id: "chat-persist-tool-result",
    actor_id: "actor-ai-persist",
    role_in_chat: "member",
    talkativity: 5,
  } as never,).execute();
  await db.insertInto("messages",).values({
    id: "assistant-msg-1",
    chat_id: "chat-persist-tool-result",
    actor_id: "actor-ai-persist",
    role: "assistant",
    content: "assistant turn",
    content_type: "text",
    content_format: "markdown",
    content_encoding: "identity",
    status: "confirmed",
    visibility: "visible",
  },).execute();
},);

afterEach(() => {
  sqlite.close();
},);

async function storedToolResults(): Promise<
  { content: string; content_type: string; parent_id: string | null; metadata: string | null; role: string }[]
> {
  return await db
    .selectFrom("messages",)
    .select(["content", "content_type", "parent_id", "metadata", "role",],)
    .where("content_type", "=", "tool_result",)
    .orderBy("created_at", "asc",)
    .execute();
}

test("storeToolResultRows persists one tool_result row per result linked by tool_call_id", async () => {
  const toolResults: GenerationMessage[] = [
    { role: "tool", content: '{"ok":true}', tool_call_id: "call-1", },
    { role: "tool", content: '{"error":"boom"}', tool_call_id: "call-2", },
  ];

  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    toolResults,
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(2,);
  expect(rows[0]!.content,).toBe('{"ok":true}',);
  expect(rows[0]!.parent_id,).toBe("assistant-msg-1",);
  expect(rows[0]!.role,).toBe("assistant",);
  expect(JSON.parse(rows[0]!.metadata!,),).toEqual({ tool_call_id: "call-1", },);
  expect(JSON.parse(rows[1]!.metadata!,),).toEqual({ tool_call_id: "call-2", },);
  // Failed-tool output persists verbatim (sanitization happens upstream).
  expect(rows[1]!.content,).toBe('{"error":"boom"}',);
});

test("storeToolResultRows writes nothing for an empty result list", async () => {
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(0,);
});

test("storeToolResultRows persists a row with null tool_call_id when the field is missing", async () => {
  // Provider adapters that strip tool_call_id (or hand-build a GenerationMessage
  // without it) must still produce a persistable row. The link is lost in
  // metadata but the row itself is chat-visible — better than silently dropping.
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "tool", content: '{"ok":true}', },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(JSON.parse(rows[0]!.metadata!,),).toEqual({ tool_call_id: null, },);
});

test("storeToolResultRows preserves an empty-string tool_call_id verbatim", async () => {
  // Empty string is distinct from missing: the caller chose to provide the field.
  // Don't coerce to null — that would hide provider bugs.
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "tool", content: "ok", tool_call_id: "", },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(JSON.parse(rows[0]!.metadata!,),).toEqual({ tool_call_id: "", },);
});

test("storeToolResultRows persists verbatim when content is an empty string", async () => {
  // Some tools return "" on success. Don't substitute a placeholder.
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "tool", content: "", tool_call_id: "call-empty", },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(rows[0]!.content,).toBe("",);
});

test("storeToolResultRows survives a 1 MB tool payload without truncation", async () => {
  // Sanity check: the persist layer must not silently truncate large outputs.
  // A real regression here would mean downstream chat history misses the tail
  // of long tool results. The compression gate is the only allowed transformer.
  const big = "x".repeat(1_000_000,);
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "tool", content: big, tool_call_id: "call-big", },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(rows[0]!.content.length,).toBe(1_000_000,);
});

test("storeToolResultRows preserves embedded NUL bytes and control chars verbatim", async () => {
  // Tool outputs may include arbitrary bytes (binary-ish tools, JSON with
  // escaped control chars). The persist layer must not strip or transform.
  const evil = "beforeNUL\x01\x1fafter";
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "tool", content: evil, tool_call_id: "call-evil", },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(rows[0]!.content,).toBe(evil,);
});

test("storeToolResultRows allows duplicate tool_call_ids across results", async () => {
  // Some providers (Anthropic on streaming retries) can emit the same tool_call_id
  // twice in one batch. The store layer must not silently dedupe — the caller
  // owns ordering and may need every row for forensic replay.
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [
      { role: "tool", content: "first", tool_call_id: "dup", },
      { role: "tool", content: "second", tool_call_id: "dup", },
    ],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(2,);
  expect(rows.map((r,) => r.content),).toEqual(["first", "second",],);
  expect(rows.map((r,) => JSON.parse(r.metadata!,).tool_call_id),).toEqual(["dup", "dup",],);
});

test("storeToolResultRows throws on unknown parentMessageId (FK constraint)", async () => {
  // The messages table has parent_id REFERENCES messages.id (migration 006).
  // An unknown parent MUST fail loudly — silently dropping or orphaning tool
  // results would hide a real bug (assistant row never persisted, race with
  // a concurrent delete, etc). Pin the existing strict contract.
  expect(() =>
    storeToolResultRows(
      db,
      { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
      "ghost-parent-that-does-not-exist",
      [{ role: "tool", content: "orphan", tool_call_id: "call-orphan", },],
    )
  ).toThrow(/FOREIGN KEY/,);

  // Nothing was persisted: the loop aborts at the first FK violation.
  const rows = await storedToolResults();
  expect(rows.length,).toBe(0,);
});

test("storeToolResultRows tolerates a very long tool_call_id", async () => {
  // Provider-issued IDs are typically short, but plugin-generated ones can be
  // namespaced strings (e.g. my-plugin::tool::call-2026-09-09T22-...). Pin the
  // behavior that we don't truncate or hash them.
  const longId = "x".repeat(512,);
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "tool", content: "ok", tool_call_id: longId, },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(JSON.parse(rows[0]!.metadata!,).tool_call_id,).toBe(longId,);
});

test("storeToolResultRows treats every element as a tool result regardless of role", async () => {
  // The function does not filter by result.role. The caller hands it a
  // curated list of tool results; any stray non-tool entry is persisted as a
  // tool_result row. Pin that contract — if the policy changes, this test
  // will catch it.
  await storeToolResultRows(
    db,
    { chatId: "chat-persist-tool-result", actorId: "actor-ai-persist", },
    "assistant-msg-1",
    [{ role: "user", content: "should not happen", tool_call_id: "stray", },],
  );

  const rows = await storedToolResults();
  expect(rows.length,).toBe(1,);
  expect(rows[0]!.content,).toBe("should not happen",);
  // Row is still marked as a tool_result for downstream readers.
  expect(rows[0]!.content_type,).toBe("tool_result",);
});
