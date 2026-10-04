// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shadow notes vs shared recall (TASK-chat-feature-notes-shadow-carriage
 * AC6): the shared-recall loader feeding provisionMemories reads only
 * committed `actor_memories` rows — shadow-note content is structurally
 * excluded and can never surface through shareability-gated recall.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { fetchActorMemories, } from "../assistant/prompt/sections/memories-helpers";
import { ShadowNoteStatus, ShadowNoteType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";

const SHADOW_MARKER = "SHADOW-MARKER-lich-is-the-king";

let db: Kysely<DB>;
let actorId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, "shadow-recall", "Shadow Recall", { id: userId, } as never,);
  actorId = uid();
  await insertActors(db, "Recall Actor", { id: actorId, owner_id: userId, } as never,);

  // A committed memory this actor should see in shared recall.
  await insertActorMemories(db, actorId, "The captain carried a silver compass.", {
    id: uid(),
    importance: 0.9,
    review_status: "committed",
  } as never,);

  // Shadow notes for the same actor/chat context — never recall material.
  const chatId = uid();
  await insertChats(db, "Shadow Chat", userId, { id: chatId, } as never,);
  await db
    .insertInto("shadow_notes",)
    .values({
      id: uid(),
      chat_id: chatId,
      type: ShadowNoteType.HiddenFact,
      content: SHADOW_MARKER,
      status: ShadowNoteStatus.Hidden,
      created_at: new Date().toISOString(),
    },)
    .execute();
},);

afterAll(async () => {
  await db.destroy();
},);

describe("shared recall excludes shadow notes (AC6)", () => {
  test("fetchActorMemories returns committed memories and never shadow rows", async () => {
    const entries = await fetchActorMemories(db, actorId,);
    expect(entries.length,).toBeGreaterThan(0,);
    expect(
      entries.some((entry,) => entry.content.includes("silver compass",)),
    ).toBe(true,);

    expect(
      entries.some((entry,) => entry.content.includes(SHADOW_MARKER,)),
    ).toBe(false,);
  });
});
