/**
 * Tests for nsfw/moderation-service/flags.ts — content flagging
 *
 * Uses a real in-memory DB (migration-based schema) to verify
 * flag creation, duplicate detection, queue pagination, and
 * flag resolution.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { Logger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { flagContent, getFlagQueue, resolveFlag, } from "./flags";
import type { NsfwModerationServiceContext, } from "./types";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

function makeLog(): Logger {
  return {
    trace: mock(() => {},),
    debug: mock(() => {},),
    info: mock(() => {},),
    warn: mock(() => {},),
    error: mock(() => {},),
    fatal: mock(() => {},),
    child: mock(() => makeLog()),
  } as unknown as Logger;
}

function makeCtx(log: Logger = makeLog(),): NsfwModerationServiceContext {
  return { db, log, } as unknown as NsfwModerationServiceContext;
}

const REPORTER = "user-reporter-1";
const OTHER_REPORTER = "user-reporter-2";

async function insertFlagRow(params: {
  id: string;
  reporterId: string;
  status: string;
  createdAt: string;
  contentType?: string;
  contentId?: string;
  reason?: string;
},): Promise<void> {
  await db.insertInto("content_flags",).values({
    id: params.id,
    reporter_id: params.reporterId,
    content_type: params.contentType ?? "message",
    content_id: params.contentId ?? "msg-1",
    chat_id: null,
    world_id: null,
    flag_reason: params.reason ?? "test",
    description: null,
    status: params.status,
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    created_at: params.createdAt,
  },).execute();
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  db.destroy();
},);

describe("flagContent", () => {
  test("creates a pending flag and returns the full shape", async () => {
    const flag = await flagContent({
      thisL: makeCtx(),
      params: {
        reporterId: REPORTER,
        contentType: "message",
        contentId: "msg-new-1",
        chatId: "chat-1",
        flagReason: "harassment",
        description: "threatening",
      },
    },);
    expect(flag.id,).toBeTruthy();
    expect(flag.status,).toBe("pending",);
    expect(flag.reporterId,).toBe(REPORTER,);
    expect(flag.contentType,).toBe("message",);
    expect(flag.contentId,).toBe("msg-new-1",);
    expect(flag.chatId,).toBe("chat-1",);
    expect(flag.flagReason,).toBe("harassment",);
    expect(flag.description,).toBe("threatening",);
    expect(flag.resolution,).toBeNull();
    expect(flag.resolvedBy,).toBeNull();

    const row = await db.selectFrom("content_flags",).selectAll()
      .where("id", "=", flag.id,).executeTakeFirst();
    expect(row?.status,).toBe("pending",);
  });

  test("throws when the same content is already pending", async () => {
    const ctx = makeCtx();
    await flagContent({
      thisL: ctx,
      params: { reporterId: REPORTER, contentType: "message", contentId: "dup-1", flagReason: "a", },
    },);
    await expect(flagContent({
      thisL: ctx,
      params: { reporterId: OTHER_REPORTER, contentType: "message", contentId: "dup-1", flagReason: "b", },
    },),).rejects.toThrow("Content already flagged for review.",);
  });

  test("allows re-flagging after the previous flag is dismissed", async () => {
    const ctx = makeCtx();
    const first = await flagContent({
      thisL: ctx,
      params: { reporterId: REPORTER, contentType: "message", contentId: "ref-1", flagReason: "a", },
    },);
    await resolveFlag({
      thisL: ctx,
      flagId: first.id,
      resolvedBy: "admin-1",
      resolution: "no issue",
      status: "dismissed",
    },);

    const second = await flagContent({
      thisL: ctx,
      params: { reporterId: REPORTER, contentType: "message", contentId: "ref-1", flagReason: "b", },
    },);
    expect(second.id,).not.toBe(first.id,);
    expect(second.status,).toBe("pending",);
  });

  test("warns when reporter has 3+ dismissed flags", async () => {
    const warn = mock(() => {},);
    const log = { ...makeLog(), warn, };
    const ctx = makeCtx(log,);

    for (let i = 0; i < 3; i++) {
      const flag = await flagContent({
        thisL: ctx,
        params: { reporterId: REPORTER, contentType: "message", contentId: `warn-${i}`, flagReason: "a", },
      },);
      await resolveFlag({
        thisL: ctx,
        flagId: flag.id,
        resolvedBy: "admin-1",
        resolution: "no",
        status: "dismissed",
      },);
    }

    warn.mockClear();
    await flagContent({
      thisL: ctx,
      params: { reporterId: REPORTER, contentType: "message", contentId: "warn-4", flagReason: "a", },
    },);
    expect(warn,).toHaveBeenCalledTimes(1,);
  });
});

describe("getFlagQueue", () => {
  test("returns only flags matching the requested status", async () => {
    await insertFlagRow({
      id: "q-pending-1",
      reporterId: REPORTER,
      status: "pending",
      createdAt: "2026-01-03T00:00:00.000Z",
    },);
    await insertFlagRow({
      id: "q-pending-2",
      reporterId: REPORTER,
      status: "pending",
      createdAt: "2026-01-04T00:00:00.000Z",
    },);
    await insertFlagRow({
      id: "q-resolved-1",
      reporterId: REPORTER,
      status: "resolved",
      createdAt: "2026-01-05T00:00:00.000Z",
    },);

    const { flags, total, } = await getFlagQueue({ thisL: makeCtx(), params: { status: "pending", }, },);
    expect(total,).toBe(2,);
    expect(flags.map((f,) => f.id),).toEqual(["q-pending-2", "q-pending-1",],);
  });

  test("honors limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await insertFlagRow({
        id: `q-page-${i}`,
        reporterId: REPORTER,
        status: "under_review",
        createdAt: `2026-02-0${i + 1}T00:00:00.000Z`,
      },);
    }
    const page1 = await getFlagQueue({ thisL: makeCtx(), params: { status: "under_review", limit: 2, offset: 0, }, },);
    expect(page1.flags.map((f,) => f.id),).toEqual(["q-page-4", "q-page-3",],);

    const page2 = await getFlagQueue({ thisL: makeCtx(), params: { status: "under_review", limit: 2, offset: 2, }, },);
    expect(page2.flags.map((f,) => f.id),).toEqual(["q-page-2", "q-page-1",],);
  });

  test("defaults to pending status and limit 50", async () => {
    await flagContent({
      thisL: makeCtx(),
      params: { reporterId: REPORTER, contentType: "message", contentId: "def-pending", flagReason: "a", },
    },);
    const { total, } = await getFlagQueue({ thisL: makeCtx(), },);
    expect(total,).toBe(1,);
  });
});

describe("resolveFlag", () => {
  test("resolves a flag with disposition and resolution note", async () => {
    const ctx = makeCtx();
    const flag = await flagContent({
      thisL: ctx,
      params: { reporterId: REPORTER, contentType: "message", contentId: "res-1", flagReason: "spam", },
    },);
    const resolved = await resolveFlag({
      thisL: ctx,
      flagId: flag.id,
      resolvedBy: "admin-1",
      resolution: "confirmed violation",
      status: "confirmed",
    },);
    expect(resolved.status,).toBe("confirmed",);
    expect(resolved.resolution,).toBe("confirmed violation",);
    expect(resolved.resolvedBy,).toBe("admin-1",);
    expect(resolved.resolvedAt,).toBeTruthy();
  });

  test("throws when the flag does not exist", async () => {
    await expect(resolveFlag({
      thisL: makeCtx(),
      flagId: "missing-flag",
      resolvedBy: "admin-1",
      resolution: "n/a",
      status: "dismissed",
    },),).rejects.toThrow("not found after resolution",);
  });
});
