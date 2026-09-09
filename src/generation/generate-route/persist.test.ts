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
