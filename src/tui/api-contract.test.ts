// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Live /api/v1 contract smoke suite for the TUI client surface.
 *
 * Every other TUI test injects a fake fetch (`setFetch` in `chat/api.ts` and
 * `harness/api.ts`), which proves the TUI parses what it was *told* — not what
 * the server *sends*. A rename in `src/routes/` therefore stays invisible until
 * a human runs the TUI. This suite closes that gap: it boots the REAL app
 * (same harness as `src/routes/v1/v1-enforcement.test.ts` — `createTestDb` +
 * `createApp` + `app.handle`, no `Bun.serve`, no `mock.module`) and drives the
 * five endpoints `src/tui/` consumes, asserting field by field the exact fields
 * the TUI modules READ:
 *
 * | Endpoint                                 | TUI reader                    |
 * | ---------------------------------------- | ----------------------------- |
 * | `POST /api/v1/chats/:id/messages`        | `chat/api.ts` handleSend      |
 * | `GET  /api/v1/chats/:id/messages`        | `chat/api.ts` loadMessages    |
 * | `GET  /api/v1/assets`                    | `asset-view.ts` loadAssets    |
 * | `GET  /api/v1/harness/runs`              | `harness/api.ts` loadRuns     |
 * | `GET  /api/v1/harness/runs/:runId`       | `harness/api.ts` loadRunDetail|
 *
 * The field lists below are transcribed from those modules; the comment on each
 * assertion names the line that reads it. Renaming any of those fields fails
 * here instead of failing silently in a terminal.
 *
 * Resource contract (parallel-safe): the database is an in-memory SQLite owned
 * by this file, destroyed in `afterAll` — no shared path, port or tmp dir, so it
 * runs beside the rest of `bun test src/` untouched. The harness endpoints are
 * file-backed, not DB-backed, so each harness test mkdtemps its own log under
 * `.tmp/` and points the reader at it via `setExecLogPath`, resetting the
 * process-wide pointer in `afterEach`. Cron is disabled so no scheduler
 * survives the suite.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

import type { AsyncStore, } from "../async/store";
import { loadConfig, } from "../config/load";
import { AssetLinkEntity, AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { setExecLogPath, } from "../harness/exec-log";
import { buildRunRecord, } from "../harness/exec-recorder";
import { serializeRun, } from "../harness/types";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";

// Type-only imports: erased at runtime, so this suite never pulls `blessed`
// into the process (see `src/tui/import-purity.test.ts`).
import type { LinkedAsset, } from "./asset-view";
import type { ChatMessage, } from "./chat/types";
import type { HarnessRunDetail, HarnessRunSummary, } from "./harness/types";

/** Shared parent for the harness fixtures; each test owns its own child dir. */
const TMP_ROOT = ".tmp/tui-api-contract";

/** Test seam — matches the AsyncStore surface consumed by route plugins. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },

    destroy() {},
  };
}

let db: Kysely<DB>;
let app: Elysia;
let chatId: string;
let userId: string;

/** Hit the real app in-process. No socket, no fetch stub. */
function call(path: string, init?: RequestInit,): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init,),);
}

/** POST a user turn exactly the way `chat/api.ts` `handleSend` does. */
function sendMessage(content: string,): Promise<Response> {
  return call(`/api/v1/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ content, role: "user", },),
  },);
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());

  // One admin user. Solo mode resolves the caller from the single row, and the
  // harness endpoints guard on `admin.system` — the chat endpoints have no role
  // requirement, so one seeded admin serves both halves of the surface.
  userId = uid();
  await insertUsers(db, `contract-${userId}`, "TUI Contract", { id: userId, role: "admin", },);
  await insertActors(
    db,
    "TUI Contract",
    { id: userId, actor_type: "user", user_id: userId, owner_id: userId, },
  );

  chatId = await insertChats(db, "Contract Chat", userId,);
  await insertChatParticipants(db, chatId, userId,);

  const config = loadConfig();
  config.auth.required = false;
  config.cron.enabled = false;
  config.assets.uploadDir = ".tmp/";
  app = createApp({ database: db, config, asyncStore: stubAsyncStore(), } as never,) as unknown as Elysia;
},);

afterAll(async () => {
  await db.destroy();
},);

// ── POST /api/v1/chats/:id/messages ────────────────────────────────────────
// `chat/api.ts` handleSend reads exactly three paths off the body: `data.id`,
// and — only when the key is present — `data.assistantMessage.id` and
// `data.assistantMessage.content`.
describe("POST /api/v1/chats/:id/messages — chat/api.ts handleSend reads", () => {
  test("returns the id of the persisted user message as a non-empty string", async () => {
    const res = await sendMessage("contract: what is the weather?",);
    expect(res.status,).toBe(201,);

    const body = (await res.json()) as { id?: unknown };
    expect(typeof body.id,).toBe("string",);
    expect((body.id as string).length,).toBeGreaterThan(0,);
  });

  test("omits assistantMessage entirely when no auto-reply ran, so the TUI adds no phantom assistant turn", async () => {
    const res = await sendMessage("contract: no generation configured",);
    expect(res.status,).toBe(201,);

    const body = (await res.json()) as { assistantMessage?: unknown };
    // `if (data.assistantMessage)` is the TUI's only branch on it. A body that
    // omitted the key entirely is what the TUI was written against — pin it.
    expect(body,).not.toHaveProperty("assistantMessage",);
  });

  test("persisted the turn under the returned id, so the id is not a uuid the caller cannot re-read", async () => {
    const res = await sendMessage("contract: durable turn",);
    const { id, } = (await res.json()) as { id: string };

    const row = await db
      .selectFrom("messages",)
      .select(["id", "content",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    expect(row?.id,).toBe(id,);
    expect(row?.content,).toBe("contract: durable turn",);
  });
});

// ── GET /api/v1/chats/:id/messages ─────────────────────────────────────────
// `chat/api.ts` loadMessages requests `page`/`pageSize` and reads the rows under
// `data`, whose elements it treats as `ChatMessage`: `id`, `role`, `content`,
// `actorName` — the last drives the display prefix in `chat/display.ts`
// formatMessageLine. Page metadata is read off `pagination.totalPages`, which is
// where `jsonPaginated` puts it (src/routes/http-utils/responses.ts).
describe("GET /api/v1/chats/:id/messages — chat/api.ts loadMessages reads", () => {
  test("every message row carries the ChatMessage fields as the right types", async () => {
    const res = await call(`/api/v1/chats/${chatId}/messages?page=1&pageSize=200`,);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { data?: unknown };
    expect(Array.isArray(body.data,),).toBe(true,);
    const rows = body.data as ChatMessage[];
    expect(rows.length,).toBeGreaterThan(0,);

    for (const row of rows) {
      expect(typeof row.id,).toBe("string",);
      expect(typeof row.role,).toBe("string",);
      expect(typeof row.content,).toBe("string",);
      // `actorName` is optional in the TUI type: absent means the list renders
      // the bare `role` prefix. What must not happen is a present-but-non-string
      // value, which would render "[object Object]" as the speaker name.
      if ("actorName" in row) {
        expect(typeof row.actorName,).toBe("string",);
      }
    }
  });

  test("returns the posted turn's content verbatim under role 'user'", async () => {
    const res = await call(`/api/v1/chats/${chatId}/messages?page=1&pageSize=200`,);
    const body = (await res.json()) as { data: ChatMessage[] };

    const turn = body.data.find((m,) => m.content === "contract: durable turn");
    expect(turn,).toBeDefined();
    expect(turn!.role,).toBe("user",);
  });

  // The contract the TUI codes against: the envelope carries `pagination`
  // (total/page/pageSize/totalPages) and no `cursor` at all. loadMessages reads
  // `totalPages` to reach the LAST page — page 1 is the oldest page — so a
  // cursor-shaped key silently collapsing to undefined would pin the client to
  // the opening turns of every chat.
  test("pages by page/pageSize under a pagination envelope, with no cursor", async () => {
    const res = await call(`/api/v1/chats/${chatId}/messages?page=1&pageSize=200`,);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.cursor,).toBeUndefined();

    const pagination = body.pagination as
      | { total: number; page: number; pageSize: number; totalPages: number }
      | undefined;

    expect(pagination,).toBeDefined();
    expect(pagination!.page,).toBe(1,);
    expect(pagination!.pageSize,).toBe(200,);
    expect(typeof pagination!.total,).toBe("number",);
    expect(typeof pagination!.totalPages,).toBe("number",);
  });

  test("honours an explicit page number, so the last page is reachable", async () => {
    const res = await call(`/api/v1/chats/${chatId}/messages?page=1&pageSize=1`,);
    const body = (await res.json()) as {
      data: ChatMessage[];
      pagination: { totalPages: number; pageSize: number };
    };

    expect(body.data,).toHaveLength(1,);
    expect(body.pagination.pageSize,).toBe(1,);
    expect(body.pagination.totalPages,).toBeGreaterThan(1,);
  });
});

// ── GET /api/v1/assets ─────────────────────────────────────────────────────
// `asset-view.ts` loadAssets reads `result.data.data` and, per asset, renders
// filename / asset_type / mime_type / size_bytes / created_at / alt_text.
describe("GET /api/v1/assets?entity_type=chat&entity_id=… — asset-view.ts loadAssets reads", () => {
  let assetId: string;

  beforeAll(async () => {
    assetId = await insertAssets(
      db,
      userId,
      "contract.png",
      "image/png",
      AssetType.Image,
      2048,
      ".tmp/tui-api-contract/contract.png",
      { alt_text: "a contract fixture", },
    );

    await insertAssetLinks(db, assetId, AssetLinkEntity.Chat, chatId,);
  },);

  test("returns the chat-linked asset with every LinkedAsset field the view renders", async () => {
    const res = await call(`/api/v1/assets?entity_type=chat&entity_id=${chatId}&pageSize=100`,);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { data?: unknown };
    expect(Array.isArray(body.data,),).toBe(true,);
    const rows = body.data as LinkedAsset[];
    expect(rows,).toHaveLength(1,);

    const asset = rows[0]!;
    expect(typeof asset.id,).toBe("string",);
    expect(asset.id,).toBe(assetId,);
    expect(asset.filename,).toBe("contract.png",);
    expect(asset.mime_type,).toBe("image/png",);
    expect(asset.asset_type,).toBe("image",);
    expect(typeof asset.size_bytes,).toBe("number",);
    expect(asset.size_bytes,).toBe(2048,);
    expect(typeof asset.created_at,).toBe("string",);
    // `asset.alt_text ? … : ""` — nullable is fine, non-string is not.
    if (asset.alt_text !== null) {
      expect(typeof asset.alt_text,).toBe("string",);
    }
  });

  test("created_at is sliceable to a YYYY-MM-DD date, the way asset-view renders it", async () => {
    const res = await call(`/api/v1/assets?entity_type=chat&entity_id=${chatId}&pageSize=100`,);
    const body = (await res.json()) as { data: LinkedAsset[] };
    const day = body.data[0]!.created_at.slice(0, 10,);
    expect(day,).toMatch(/^\d{4}-\d{2}-\d{2}$/,);
  });
});

// ── GET /api/v1/harness/runs ───────────────────────────────────────────────
// `harness/api.ts` loadRuns reads `items`, and `harness/display.ts`
// formatRunLine reads runId, durationMs, task, model, result, tokensIn,
// tokensOut, costUsd off each row.
describe("GET /api/v1/harness/runs — harness/api.ts loadRuns reads", () => {
  let dir: string;
  let runId: string;

  beforeEach(() => {
    mkdirSync(TMP_ROOT, { recursive: true, },);
    dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
    // Built by the real recorder and written by the real serializer, so the
    // log line is indistinguishable from one the running server produces.
    const record = buildRunRecord({
      taskType: "chat",
      model: "gpt-contract",
      runMs: 4321,
      result: "ok",
      task: "contract smoke run",
      tools: ["read",],
      pattern: "agent.edit",
      patternDetail: "one edit",
    },);

    runId = record.runId;
    writeFileSync(
      join(dir, "executions.jsonl",),
      `${JSON.stringify(serializeRun(record,),)}\n`,
      "utf8",
    );

    setExecLogPath(join(dir, "executions.jsonl",),);
  },);

  afterEach(() => {
    setExecLogPath(null,);
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("returns { items } with every summary field formatRunLine renders", async () => {
    const res = await call(`/api/v1/harness/runs?limit=50`,);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { items?: unknown };
    expect(Array.isArray(body.items,),).toBe(true,);
    const items = body.items as HarnessRunSummary[];
    expect(items,).toHaveLength(1,);

    const row = items[0]!;
    expect(row.runId,).toBe(runId,);
    expect(typeof row.ts,).toBe("string",);
    expect(row.durationMs,).toBe(4321,);
    expect(typeof row.durationMs,).toBe("number",);
    expect(row.task,).toBe("contract smoke run",);
    expect(row.taskType,).toBe("chat",);
    expect(row.model,).toBe("gpt-contract",);
    expect(row.result,).toBe("ok",);
    expect(row.tokensIn,).toBe(0,);
    expect(row.tokensOut,).toBe(0,);
    // `summary.costUsd < 0.001` and `.toFixed()` both need a number; the
    // record was built with no price, so the stored value is null.
    expect(typeof row.costUsd,).toBe("number",);
    expect(row.costUsd,).toBe(0,);
  });

  test("never leaks the persisted runMs key the TUI does not read", async () => {
    const res = await call(`/api/v1/harness/runs?limit=50`,);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(body.items[0],).not.toHaveProperty("runMs",);
  });
});

// ── GET /api/v1/harness/runs/:runId ────────────────────────────────────────
// `harness/api.ts` loadRunDetail hands the row to `harness/display.ts`
// formatRunDetail, which reads every one of these fields.
describe("GET /api/v1/harness/runs/:runId — harness/api.ts loadRunDetail reads", () => {
  let dir: string;
  let runId: string;

  beforeEach(() => {
    mkdirSync(TMP_ROOT, { recursive: true, },);
    dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
    const record = buildRunRecord({
      taskType: "chat",
      model: "gpt-contract",
      runMs: 4321,
      result: "error",
      task: "contract detail run",
      tools: ["read", "write",],
      pattern: "agent.edit",
      patternDetail: "two edits",
      // Both render behind an `if (...)` in formatRunDetail, so a null fixture
      // would leave those two branches unexercised.
      error: "contract boom",
      toolingGap: "no-edit-tool",
    },);

    runId = record.runId;
    writeFileSync(
      join(dir, "executions.jsonl",),
      `${JSON.stringify(serializeRun(record,),)}\n`,
      "utf8",
    );

    setExecLogPath(join(dir, "executions.jsonl",),);
  },);

  afterEach(() => {
    setExecLogPath(null,);
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("serves every field formatRunDetail renders, including the detail-only ones", async () => {
    const res = await call(`/api/v1/harness/runs/${runId}`,);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as HarnessRunDetail;
    expect(body.runId,).toBe(runId,);
    expect(typeof body.ts,).toBe("string",);
    expect(body.durationMs,).toBe(4321,);
    expect(body.task,).toBe("contract detail run",);
    expect(body.taskType,).toBe("chat",);
    expect(body.model,).toBe("gpt-contract",);
    expect(body.result,).toBe("error",);
    expect(body.error,).toBe("contract boom",);
    expect(typeof body.tokensIn,).toBe("number",);
    expect(typeof body.tokensOut,).toBe("number",);
    expect(typeof body.costUsd,).toBe("number",);
    expect(body.toolCount,).toBe(2,);
    // `detail.tools.join(", ")` — an absent tools would throw at render time.
    expect(body.tools,).toEqual(["read", "write",],);
    expect(body.pattern,).toBe("agent.edit",);
    expect(body.patternDetail,).toBe("two edits",);
    // The view branches on these rather than rendering them blindly.
    expect(body.toolingGap,).toBe("no-edit-tool",);
    expect(body,).toHaveProperty("msg",);
    expect(body,).toHaveProperty("branch",);
    // `detail.gitSha ? detail.gitSha.slice(0, 7) : "—"` — the fixture ran
    // outside a checkout, so null is the real value; a present value must slice.
    if (body.gitSha !== null) {
      expect(typeof body.gitSha.slice(0, 7,),).toBe("string",);
    }

    expect(body,).toHaveProperty("pid",);
    expect(body,).toHaveProperty("turnId",);
  });

  test("agrees with the list endpoint on the shared summary fields", async () => {
    const detailRes = await call(`/api/v1/harness/runs/${runId}`,);
    const detail = (await detailRes.json()) as HarnessRunDetail;
    const listRes = await call(`/api/v1/harness/runs?limit=50`,);
    const list = (await listRes.json()) as { items: HarnessRunSummary[] };

    const row = list.items[0]!;
    expect(row.runId,).toBe(detail.runId,);
    expect(row.durationMs,).toBe(detail.durationMs,);
    expect(row.ts,).toBe(detail.ts,);
    expect(row.taskType,).toBe(detail.taskType,);
    expect(row.model,).toBe(detail.model,);
    expect(row.result,).toBe(detail.result,);
    expect(row.costUsd,).toBe(detail.costUsd,);
    expect(detail,).not.toHaveProperty("runMs",);
  });
});
