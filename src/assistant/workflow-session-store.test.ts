// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for persisted workflow run sessions: write-through, rehydrate,
// stale-run expiry, unknown-workflow pruning, and cancel reporting.

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { clearSessions, startSession, } from "./workflow-session";
import {
  cancelPersistedSession,
  deletePersistedSession,
  loadPersistedSession,
  parseDbTimestamp,
  saveSession,
  WORKFLOW_SESSION_TTL_MS,
} from "./workflow-session-store";

const WORKFLOW: AssistantWorkflowConfig = {
  id: "test-video",
  name: "Test video",
  triggers: ["make a video",],
  steps: [
    { id: "subject", name: "Subject", type: "text", formatTemplate: "Subject: {value}", },
  ],
  dispatch: { backend: "test-backend", target: "POST /test", payloadTemplate: { prompt: "{prompt}", }, },
  approval: { type: "confirm", preview: true, },
};

describe("workflow session store", () => {
  let db: Kysely<DB>;
  let chatId: string;
  const userId = "store-user";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    chatId = uid();
    await insertUsers(db, `user-${userId}`, "Store User", { id: userId, } as never,);
    await insertActors(db, "Store User", {
      id: userId,
      actor_type: "user",
      agent_type: "none",
      user_id: userId,
      owner_id: userId,
    } as never,);
    await insertChats(db, "Store Chat", userId, { id: chatId, } as never,);
    clearSessions();
  },);

  test("save + load round-trips values and confirmation", async () => {
    const session = startSession(chatId, WORKFLOW,);
    session.run.values.subject = "neon alley";
    await saveSession(db, chatId, session,);
    clearSessions();
    const restored = await loadPersistedSession(db, chatId, [WORKFLOW,],);
    expect(restored?.run.values.subject,).toBe("neon alley",);
    expect(restored?.workflow.id,).toBe("test-video",);
  });

  test("stale rows are dropped on load", async () => {
    const session = startSession(chatId, WORKFLOW,);
    await saveSession(db, chatId, session,);
    await db
      .updateTable("workflow_sessions",)
      .set({ updated_at: "2020-01-01 00:00:00", },)
      .where("chat_id", "=", chatId,)
      .execute();
    clearSessions();
    expect(await loadPersistedSession(db, chatId, [WORKFLOW,],),).toBeUndefined();
    const row = await db
      .selectFrom("workflow_sessions",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("rows for unknown workflows are pruned", async () => {
    const session = startSession(chatId, WORKFLOW,);
    await saveSession(db, chatId, session,);
    clearSessions();
    expect(await loadPersistedSession(db, chatId, [],),).toBeUndefined();
  });

  test("cancel reports existence", async () => {
    expect(await cancelPersistedSession(db, chatId,),).toBe(false,);
    const session = startSession(chatId, WORKFLOW,);
    await saveSession(db, chatId, session,);
    expect(await cancelPersistedSession(db, chatId,),).toBe(true,);
    await deletePersistedSession(db, chatId,);
  });

  test("parseDbTimestamp handles ISO, sqlite, and garbage", () => {
    expect(parseDbTimestamp(new Date(1_000,).toISOString(),),).toBe(1_000,);
    expect(parseDbTimestamp("2020-01-01 00:00:00",),).toBe(Date.parse("2020-01-01T00:00:00Z",),);
    expect(parseDbTimestamp("not-a-date",),).toBe(0,);
    expect(WORKFLOW_SESSION_TTL_MS,).toBe(24 * 60 * 60 * 1000,);
  });
});
