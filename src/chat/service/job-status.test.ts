// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Job-status journal writer tests (TASK-harness-inflight-job-handles).
 *
 * Covers the five slice ACs: best-effort writes (a failed insert never
 * throws), the initial pending row keyed by the request id, ordered
 * append-only transitions, the turnId stamp on the completion row, and
 * exactly-once rows under a double progress callback (per-process dedupe
 * keyed by jobId+state+step).
 */
import { describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import { MessageContentType, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { jsonParseOr, } from "../../utils";
import { appendJobStatus, type JobState, jobStatusLine, postInitialJobStatus, } from "./job-status";

/** Metadata payload carried on every job_status row. */
interface JobStatusMeta {
  jobId: string;
  requestId: string;
  op: string;
  state: JobState;
  step?: string;
  turnId?: string;
}

describe("appendJobStatus", () => {
  let db: Kysely<DB>;
  const USER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  const seed = async (): Promise<void> => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "owner", { id: USER_ID, } as never,);
    await insertActors(db, "owner", { id: USER_ID, user_id: USER_ID, owner_id: USER_ID, } as never,);
    await insertChats(db, "Job Status Chat", USER_ID, { id: CHAT_ID, } as never,);
  };

  /** Oldest-first job_status rows for the chat, with parsed metadata. */
  const jobRows = async (): Promise<
    Array<{ content: string; content_type: string; role: string; meta: JobStatusMeta | null }>
  > => {
    const rows = await db
      .selectFrom("messages",)
      .select(["content", "content_type", "role", "metadata",],)
      .where("chat_id", "=", CHAT_ID,)
      .orderBy(sql`rowid`, "asc",)
      .execute();

    return rows.map((row,) => ({
      content: row.content,
      content_type: row.content_type,
      role: row.role,
      meta: jsonParseOr(row.metadata ?? "", null,) as JobStatusMeta | null,
    }));
  };

  /** Assert-only job_status rows exist (no user-message bleed). */
  const expectOnlyJobRows = async (): Promise<
    Array<{ content: string; content_type: string; role: string; meta: JobStatusMeta | null }>
  > => {
    const rows = await jobRows();
    for (const row of rows) {
      expect(row.content_type,).toBe(MessageContentType.JobStatus,);
      expect(row.role,).toBe(MessageRole.System,);
    }

    return rows;
  };

  test("posts the initial pending row keyed by the request id", async () => {
    await seed();
    try {
      const jobId = crypto.randomUUID();
      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "pending",
        actorId: USER_ID,
      },);

      const [row,] = await expectOnlyJobRows();
      expect(row,).toBeDefined();
      expect(row!.content,).toBe("auto-gen pending",);
      expect(row!.meta,).not.toBeNull();
      expect(row!.meta!.jobId,).toBe(jobId,);
      expect(row!.meta!.requestId,).toBe(jobId,);
      expect(row!.meta!.op,).toBe("auto-gen",);
      expect(row!.meta!.state,).toBe("pending",);
    } finally {
      await db.destroy();
    }
  });

  test("state transitions append rows in order", async () => {
    await seed();
    try {
      const jobId = crypto.randomUUID();
      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "pending",
        actorId: USER_ID,
      },);

      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "in_progress",
        step: "preparing",
        actorId: USER_ID,
      },);

      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "in_progress",
        step: "generating",
        actorId: USER_ID,
      },);

      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "complete",
        actorId: USER_ID,
      },);

      const rows = await expectOnlyJobRows();
      expect(rows.map((r,) => r.meta!.state),).toEqual(["pending", "in_progress", "in_progress", "complete",],);
      expect(rows.map((r,) => r.meta!.step ?? null),).toEqual([null, "preparing", "generating", null,],);
      expect(rows[3]!.content,).toBe("auto-gen complete",);
    } finally {
      await db.destroy();
    }
  });

  test("completion row carries the harness turnId", async () => {
    await seed();
    try {
      const jobId = crypto.randomUUID();
      const turnId = crypto.randomUUID();
      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "complete",
        actorId: USER_ID,
        turnId,
      },);

      const [row,] = await expectOnlyJobRows();
      expect(row!.meta!.turnId,).toBe(turnId,);
    } finally {
      await db.destroy();
    }
  });

  test("a double progress callback writes the row once", async () => {
    await seed();
    try {
      const jobId = crypto.randomUUID();
      const event = {
        database: db,
        chatId: CHAT_ID,
        jobId,
        op: "auto-gen",
        state: "in_progress" as const,
        step: "generating",
        actorId: USER_ID,
      };

      await appendJobStatus(event,);
      await appendJobStatus(event,);

      const rows = await expectOnlyJobRows();
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.content,).toBe(jobStatusLine("auto-gen", "in_progress", "generating",),);
    } finally {
      await db.destroy();
    }
  });

  test("a failed insert does not throw and writes no row", async () => {
    await seed();
    try {
      // Ghost actor violates messages.actor_id → actors.id; the writer must
      // swallow the failure (structured-logged) instead of throwing.
      await appendJobStatus({
        database: db,
        chatId: CHAT_ID,
        jobId: crypto.randomUUID(),
        op: "auto-gen",
        state: "pending",
        actorId: "ghost-actor-no-row",
      },);

      expect((await jobRows()).length,).toBe(0,);
    } finally {
      await db.destroy();
    }
  });

  test("postInitialJobStatus posts pending when wired, no-ops otherwise", async () => {
    await seed();
    try {
      const requestId = crypto.randomUUID();

      // Unwired (no asyncStore / no requestId): silent no-op, no row.
      await postInitialJobStatus({
        database: db,
        chatId: CHAT_ID,
        actorId: USER_ID,
        requestId: undefined,
        asyncStore: undefined,
        op: "auto-gen",
      },);

      await postInitialJobStatus({
        database: db,
        chatId: CHAT_ID,
        actorId: USER_ID,
        requestId,
        asyncStore: undefined,
        op: "auto-gen",
      },);

      expect((await jobRows()).length,).toBe(0,);

      // Wired: exactly one pending row keyed by the request id.
      await postInitialJobStatus({
        database: db,
        chatId: CHAT_ID,
        actorId: USER_ID,
        requestId,
        asyncStore: { track() {}, } as unknown as AsyncStore,
        op: "auto-gen",
      },);

      const rows = await jobRows();
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.meta!.state,).toBe("pending",);
      expect(rows[0]!.meta!.requestId,).toBe(requestId,);
    } finally {
      await db.destroy();
    }
  });
});
