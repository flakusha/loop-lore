// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * End-to-end binding proof: a chat with `chats.output_style_preset` set (via
 * the same column the PUT settings route writes) yields an assembled
 * `<output_style>` system message; a chat with `null` yields none — existing
 * prompts stay unchanged.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { PromptAssembler, } from "../../prompt-assembler";

describe("output style binds to context construction", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    actorId = uid();
    chatId = uid();
    await insertUsers(db, "style-tester", "Tester", { id: userId, } as never,);
    await insertActors(db, "Alice", { id: actorId, user_id: userId, } as never,);
    await insertChats(db, "Style chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  const collect = async (): Promise<string | undefined> => {
    const assembler = new PromptAssembler(db,);
    const assembled = await assembler.assemble({ actorId, chatId, modelId: "mock", userId, },);
    return assembled.messages
      .filter((m,) => typeof m.content === "string")
      .map((m,) => String(m.content,))
      .find((c,) => c.includes("<output_style>",));
  };

  test("null output_style_preset → no <output_style> message (existing prompts unchanged)", async () => {
    await db.updateTable("chats",).set({ output_style_preset: null, },).where("id", "=", chatId,).execute();
    expect(await collect(),).toBeUndefined();
  });

  test("noir preset → XML-wrapped system message with noir directive", async () => {
    await db.updateTable("chats",).set({ output_style_preset: "noir", },).where("id", "=", chatId,).execute();
    const content = await collect();
    expect(content,).toContain("<output_style>",);
    expect(content,).toContain("</output_style>",);
    expect(content,).toContain("hard-boiled cynicism",);
  });
});
