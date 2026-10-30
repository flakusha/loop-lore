// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auto-gen job-status bridge tests (TASK-harness-inflight-job-handles).
 *
 * postJobStatus is the generation-side seam: it journals a job_status row
 * when a requestId is in scope, no-ops without one, and pushes a live
 * `job-status` event into the chat's EXISTING SSE stream buffer without
 * ever creating one.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { getOrCreateBuffer, removeBuffer, } from "../stream-buffer";
import { postJobStatus, } from "./job-status-bridge";

const USER_ID = crypto.randomUUID();
const CHAT_ID = crypto.randomUUID();

/** Fresh db with the user-actor mirror + chat the message FKs require. */
async function seed(): Promise<Kysely<DB>> {
  createLogger({ level: "error", },);
  const { db, } = await createTestDb();
  await insertUsers(db, "owner", "owner", { id: USER_ID, } as never,);
  await insertActors(db, "owner", { id: USER_ID, user_id: USER_ID, owner_id: USER_ID, } as never,);
  await insertChats(db, "Bridge Chat", USER_ID, { id: CHAT_ID, } as never,);
  return db;
}

describe("postJobStatus", () => {
  afterEach(() => {
    removeBuffer(CHAT_ID,);
  },);

  test("no requestId — no row, no throw", async () => {
    const db = await seed();
    try {
      await postJobStatus({
        database: db,
        chatId: CHAT_ID,
        userId: USER_ID,
        requestId: undefined,
        state: "in_progress",
        step: "generating",
      },);

      const rows = await db.selectFrom("messages",).select("id",).execute();
      expect(rows,).toHaveLength(0,);
    } finally {
      await db.destroy();
    }
  });

  test("journals the row and pushes a live job-status event when a buffer exists", async () => {
    const db = await seed();
    try {
      // Pre-existing buffer: a stream subscriber is already connected.
      const buffer = getOrCreateBuffer(CHAT_ID,);
      const requestId = crypto.randomUUID();

      await postJobStatus({
        database: db,
        chatId: CHAT_ID,
        userId: USER_ID,
        requestId,
        state: "in_progress",
        step: "generating",
      },);

      const row = await db.selectFrom("messages",).selectAll().executeTakeFirst();
      expect(row,).toBeDefined();
      expect(row!.content,).toBe("auto-gen in_progress — generating",);
      expect(row!.actor_id,).toBe(USER_ID,);

      const events = buffer.replay(0,);
      expect(events,).toHaveLength(1,);
      expect(events[0]!.type,).toBe("job-status",);
      expect(events[0]!.html,).toBe("auto-gen in_progress — generating",);
    } finally {
      await db.destroy();
    }
  });

  test("no buffer — journals the row, skips the live push, never throws", async () => {
    const db = await seed();
    try {
      const requestId = crypto.randomUUID();
      await postJobStatus({
        database: db,
        chatId: CHAT_ID,
        userId: USER_ID,
        requestId,
        state: "complete",
        turnId: "turn-1",
      },);

      const row = await db.selectFrom("messages",).selectAll().executeTakeFirst();
      expect(row,).toBeDefined();
      expect(row!.content,).toBe("auto-gen complete",);
    } finally {
      await db.destroy();
    }
  });
});
