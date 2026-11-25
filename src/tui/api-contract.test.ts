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
 * The "TUI endpoint inventory" section at the end pins all 31 method+path
 * pairs the TUI calls; the five above remain the field-by-field contracts.
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
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";

// Read-only view modules stay type-only; the group/moderation dispatchers
// are static imports below so their commands and request shapes pin here
// (both stay inert at import time — see `src/tui/import-purity.test.ts`).
import type { LinkedAsset, } from "./asset-view";
import {
  dispatchGroupCommand,
  GROUP_COMMANDS,
  listParticipants,
  loadTurnOrder,
  setImpersonation,
} from "./chat/group-commands";
import {
  deleteMessage,
  dispatchModerationCommand,
  hideMessage,
  loadModerationQueue,
  MODERATION_COMMANDS,
} from "./chat/moderation-commands";
import type { ChatHost, ChatMessage, } from "./chat/types";
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

// ── GET /api/v1/chats/:id/messages — attachments ───────────────────────────
// `chat/types.ts` declares `attachments?: ReadonlyArray<{ assetId: string }>`
// and `chat/display.ts` renders a chip off it (`attachments.length`,
// `attachments[0].assetId`). The server serializer
// (`src/routes/messages/helpers.ts` → `enrichAttachments`) resolves the stored
// `messages.attachments` JSON into enriched descriptors, or `null` when the row
// carries none — the field is always present on the row, never absent and
// never `[]`. Both cases are pinned here so a dropped/renamed field or a
// serializer that starts emitting `[]`/`undefined` fails loudly.
describe("GET /api/v1/chats/:id/messages — the attachments field the ChatMessage type reads", () => {
  let withAttachmentId: string;
  let withoutAttachmentId: string;
  let assetId: string;

  beforeAll(async () => {
    assetId = await insertAssets(
      db,
      userId,
      "contract-attachment.png",
      "image/png",
      AssetType.Image,
      512,
      ".tmp/tui-api-contract/contract-attachment.png",
    );

    withAttachmentId = await insertMessages(db, chatId, userId, "user", "contract: turn with attachment", {
      attachments: JSON.stringify([{ assetId, order: 0, caption: "", label: "message-attachment", },],),
    },);

    await insertAssetLinks(db, assetId, AssetLinkEntity.Message, withAttachmentId,);

    withoutAttachmentId = await insertMessages(db, chatId, userId, "user", "contract: turn without attachment",);
  },);

  test("a message with a linked attachment carries the attachments array the chip renders", async () => {
    const res = await call(`/api/v1/chats/${chatId}/messages?page=1&pageSize=200`,);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { data: ChatMessage[] };
    const row = body.data.find((m,) => m.id === withAttachmentId);
    expect(row,).toBeDefined();

    const attachments = row!.attachments;
    expect(Array.isArray(attachments,),).toBe(true,);
    expect(attachments,).toHaveLength(1,);
    // The chip reads `assetId` off the first descriptor.
    expect(typeof attachments![0]!.assetId,).toBe("string",);
    expect(attachments![0]!.assetId,).toBe(assetId,);
  });

  test("a message without an attachment still carries the field, as null — not absent, not []", async () => {
    const res = await call(`/api/v1/chats/${chatId}/messages?page=1&pageSize=200`,);
    const body = (await res.json()) as { data: { id: string; attachments?: unknown }[] };
    const row = body.data.find((m,) => m.id === withoutAttachmentId);
    expect(row,).toBeDefined();

    // The KEY is always present (the serializer writes it unconditionally) —
    // its value is null when the row has no attachment. `chat/types.ts` types
    // it as optional (undefined); both are falsy, so the TUI's
    // `message.attachments?.length` guard reads them the same way.
    expect("attachments" in row!,).toBe(true,);
    expect(row!.attachments,).toBeNull();
    expect(Array.isArray(row!.attachments,),).toBe(false,);
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

// ── Full TUI endpoint inventory ───────────────────────────────────────────────
// The five field-by-field contracts above stay authoritative for the payloads
// they cover. This table pins the whole URL inventory: every `fetch` URL under
// `src/tui/**` that maps to a shipped route must still exist on a real
// `createApp()`. A rename or a dropped route fails here, even when the TUI
// unit suites inject a fake fetch and stay green.
interface TuiEndpoint {
  method: string;
  path: string;
  caller: string;
}

const TUI_ENDPOINTS: TuiEndpoint[] = [
  { method: "POST", path: "/api/v1/chats/:id/messages", caller: "chat/api.ts handleSend", },
  { method: "GET", path: "/api/v1/chats/:id/messages", caller: "chat/api.ts loadMessages", },
  { method: "GET", path: "/api/v1/commands", caller: "chat/api.ts loadCommands", },
  { method: "POST", path: "/api/v1/generation/image", caller: "chat/api.ts generateImage", },
  { method: "POST", path: "/api/v1/assets", caller: "chat/api.ts uploadAsset", },
  { method: "GET", path: "/api/v1/chats", caller: "chat-picker.ts loadChats", },
  { method: "GET", path: "/api/v1/chat-setup-templates", caller: "chat-picker.ts loadTemplates", },
  { method: "POST", path: "/api/v1/chats", caller: "chat-create-api.ts createChat", },
  { method: "GET", path: "/api/v1/assets", caller: "asset-view.ts loadAssets", },
  { method: "POST", path: "/api/v1/assets/:id/links", caller: "asset-view.ts attachAsset", },
  { method: "GET", path: "/api/v1/harness/runs", caller: "harness/api.ts loadRuns", },
  { method: "GET", path: "/api/v1/harness/runs/:runId", caller: "harness/api.ts loadRunDetail", },
  { method: "GET", path: "/api/v1/harness/stats", caller: "harness/api.ts loadStats", },
  { method: "GET", path: "/api/v1/harness/permissions", caller: "harness/api.ts loadPermissions", },
  { method: "POST", path: "/api/v1/harness/permissions/:id/approve", caller: "harness/api.ts decide approve", },
  { method: "POST", path: "/api/v1/harness/permissions/:id/deny", caller: "harness/api.ts decide deny", },
  { method: "GET", path: "/api/v1/admin/model-roles", caller: "models-api.ts loadRoles", },
  { method: "GET", path: "/api/v1/admin/providers", caller: "models-api.ts loadProviders", },
  { method: "GET", path: "/api/v1/admin/providers/:name/models", caller: "models-api.ts loadProviderModels", },
  { method: "PUT", path: "/api/v1/admin/model-roles/:role", caller: "models-api.ts assignRole", },
  { method: "DELETE", path: "/api/v1/admin/model-roles/:role", caller: "models-api.ts clearRole", },
  { method: "POST", path: "/api/v1/admin/providers/rescan", caller: "models-api.ts rescanProviders", },
  { method: "GET", path: "/api/v1/providers", caller: "models-api.ts loadPublicProviders", },
  { method: "POST", path: "/api/v1/generation/test-connection", caller: "models-api.ts testProviderConnection", },
  { method: "GET", path: "/api/v1/generation/stream/:chatId", caller: "chat/stream.ts openChatStream", },
  { method: "GET", path: "/api/v1/chats/:id/branches", caller: "chat/branch-api.ts listBranches", },
  { method: "POST", path: "/api/v1/chats/:id/branches", caller: "chat/branch-api.ts createBranch", },
  { method: "POST", path: "/api/v1/chats/:id/branches/:branchId/merge", caller: "chat/branch-api.ts mergeBranch", },
  { method: "POST", path: "/api/v1/chats/:id/split", caller: "chat/branch-api.ts splitChat", },
  { method: "POST", path: "/api/v1/chats/:id/reunite", caller: "chat/branch-api.ts reuniteChats", },
  { method: "GET", path: "/api/v1/actors", caller: "chat/characters-api.ts listCharacters", },
  { method: "GET", path: "/api/v1/chats/:id/participants", caller: "chat/group-commands.ts listParticipants", },
  { method: "GET", path: "/api/v1/chats/:id/turn-order", caller: "chat/group-commands.ts loadTurnOrder", },
  { method: "PUT", path: "/api/v1/chats/:id/impersonate", caller: "chat/group-commands.ts setImpersonation", },
  { method: "PUT", path: "/api/v1/messages/:id/visibility", caller: "chat/moderation-commands.ts hideMessage", },
  { method: "DELETE", path: "/api/v1/messages/:id", caller: "chat/moderation-commands.ts deleteMessage", },
  { method: "GET", path: "/api/v1/nsfw/moderation/flags", caller: "chat/moderation-commands.ts loadModerationQueue", },
];

describe("TUI endpoint inventory — real createApp() route registry", () => {
  test("every TUI-called URL resolves to a shipped route", () => {
    const registered = new Set(app.routes.map((route,) => `${route.method} ${route.path}`),);
    const missing = TUI_ENDPOINTS.filter((endpoint,) => !registered.has(`${endpoint.method} ${endpoint.path}`,)).map((
      endpoint,
    ) => `${endpoint.method} ${endpoint.path} (${endpoint.caller})`);

    expect(missing,).toEqual([],);
  });

  test("the pin list is the full inventory, not a five-endpoint sample", () => {
    expect(TUI_ENDPOINTS.length,).toBe(37,);
  });
});

// ── New live contracts ────────────────────────────────────────────────────────
describe("new TUI endpoints — payload fields the callers read", () => {
  test("GET /api/v1/actors?type=character returns the rows the character command lists", async () => {
    const res = await call("/api/v1/actors?type=character&page=1&pageSize=20",);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { data?: unknown };
    expect(Array.isArray(body.data,),).toBe(true,);
    for (const actor of body.data as { id?: unknown; display_name?: unknown }[]) {
      expect(typeof actor.id,).toBe("string",);
      expect(typeof actor.display_name,).toBe("string",);
    }
  });

  test("GET /api/v1/chats/:id/branches answers the branches envelope", async () => {
    // The branch service re-checks chat access; the in-process derive resolves
    // a solo caller that is not this fixture creator, so pin the shared chat
    // as public for this last describe instead of seeding a second identity.
    await db.updateTable("chats",).set({ visibility: "public", },).where("id", "=", chatId,).execute();

    const res = await call(`/api/v1/chats/${chatId}/branches?limit=10`,);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { data?: { branches?: unknown; nextCursor?: unknown } };
    expect(Array.isArray(body.data?.branches,),).toBe(true,);
    expect(body.data?.nextCursor === null || typeof body.data?.nextCursor === "string",).toBe(true,);
  });
});

// ── Group-chat + moderation TUI commands ──────────────────────────────────────
// The dispatchers are thin HTTP callers: stub `fetch` here (the live contracts
// above hit `app.handle` directly and never touch it). The same exported
// descriptor lists feed the widget's slash-command completion/help strip.
describe("group-chat and moderation TUI commands", () => {
  const realFetch = globalThis.fetch;
  let calls: Array<{ url: string; method: string | undefined; body: unknown }>;
  let replies: unknown[];

  beforeEach(() => {
    calls = [];
    replies = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit,) => {
      calls.push({
        url: String(input,),
        method: init?.method,
        body: typeof init?.body === "string" ? JSON.parse(init.body,) : init?.body,
      },);

      const payload = replies.shift() ?? { data: {}, };
      return new Response(JSON.stringify(payload,), {
        status: 200,
        headers: { "Content-Type": "application/json", },
      },);
    }) as typeof fetch;
  },);

  afterEach(() => {
    globalThis.fetch = realFetch;
  },);

  /** Bare ChatHost surface the dispatchers touch, with assertion sinks. */
  function commandHost(chatId: string | null = "chat-1",) {
    const state = { errors: [] as string[], messages: [] as { content: string }[], };
    const host = {
      chatId,
      sessionToken: "tok" as string | undefined,
      showError(message: string,) {
        state.errors.push(message,);
      },
      addMessage(message: { content: string },) {
        state.messages.push(message,);
      },
    } as unknown as ChatHost;

    return { host, state, };
  }

  const roster = [
    { actor_id: "a-1", display_name: "Alice", role_in_chat: "owner", },
    { actor_id: "a-2", display_name: "Bob", role_in_chat: "member", },
  ];

  test("new commands are advertised in the completion/help descriptor lists", () => {
    expect(GROUP_COMMANDS.map((c,) => c.name),).toEqual([
      "group",
      "participants",
      "impersonate",
      "mention",
    ],);

    expect(MODERATION_COMMANDS.map((c,) => c.name),).toEqual(["hide", "delete", "queue",],);
  });

  test("group view reads turn order and renders the current/next speaker", async () => {
    const { host, state, } = commandHost();
    replies = [
      { data: roster, },
      {
        data: {
          turnOrder: {
            strategy: "round_robin",
            currentActorId: "a-1",
            nextActorId: "a-2",
            order: [
              { actor_id: "a-1", display_name: "Alice", isCurrent: true, isNext: false, },
              { actor_id: "a-2", display_name: "Bob", isCurrent: false, isNext: true, },
            ],
          },
        },
      },
    ];

    expect(await dispatchGroupCommand(host, "/group",),).toBe(true,);
    expect(calls.map((c,) => c.url),).toEqual([
      "http://localhost:3000/api/v1/chats/chat-1/participants",
      "http://localhost:3000/api/v1/chats/chat-1/turn-order",
    ],);

    expect(state.messages[0]?.content,).toContain("now: Alice",);
    expect(state.messages[0]?.content,).toContain("next: Bob",);
    expect(state.errors,).toEqual([],);
  });

  test("participants lists mentionable names and mention resolves via the shipped parser", async () => {
    const { host, state, } = commandHost();
    replies = [{ data: roster, }, { data: roster, },];

    expect(await dispatchGroupCommand(host, "/participants",),).toBe(true,);
    expect(state.messages[0]?.content,).toContain("1. Alice (a-1)",);
    expect(state.messages[0]?.content,).toContain("@name to mention",);

    expect(await dispatchGroupCommand(host, "/mention Bob",),).toBe(true,);
    expect(state.messages[1]?.content,).toContain("@Bob → a-2",);
    expect(state.errors,).toEqual([],);
  });

  test("impersonate switches by roster index and clears with off", async () => {
    const { host, state, } = commandHost();
    replies = [{ data: roster, }, { data: { ok: true, }, }, { data: { ok: true, }, },];

    expect(await dispatchGroupCommand(host, "/impersonate 2",),).toBe(true,);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/chats/chat-1/participants",);
    expect(calls[1],).toEqual({
      url: "http://localhost:3000/api/v1/chats/chat-1/impersonate",
      method: "PUT",
      body: { impersonateActorId: "a-2", },
    },);

    expect(await dispatchGroupCommand(host, "/impersonate off",),).toBe(true,);
    expect(calls[2]?.body,).toEqual({ impersonateActorId: null, },);
    expect(state.messages.map((m,) => m.content),).toContain("Impersonation cleared.",);
  });

  test("hide and delete hit the shipped message routes with the right bodies", async () => {
    const { host, state, } = commandHost();
    replies = [{ data: { ok: true, }, }, { data: "", },];

    expect(await dispatchModerationCommand(host, "/hide msg-1 spam",),).toBe(true,);
    expect(calls[0],).toEqual({
      url: "http://localhost:3000/api/v1/messages/msg-1/visibility",
      method: "PUT",
      body: { visibility: "hidden_by_moderator", reason: "spam", },
    },);

    expect(await dispatchModerationCommand(host, "/delete msg-2",),).toBe(true,);
    expect(calls[1]?.url,).toBe("http://localhost:3000/api/v1/messages/msg-2",);
    expect(calls[1]?.method,).toBe("DELETE",);
    expect(state.messages.length,).toBe(2,);
    expect(state.errors,).toEqual([],);
  });

  test("queue reads the moderation flag queue and leaves usage errors inline", async () => {
    const { host, state, } = commandHost();
    replies = [{
      data: {
        total: 1,
        flags: [
          { id: "f-1", contentType: "message", flagReason: "nsfw", status: "pending", createdAt: "2026-01-01", },
        ],
      },
    },];

    expect(await dispatchModerationCommand(host, "/queue pending",),).toBe(true,);
    expect(calls[0]?.url,).toBe("http://localhost:3000/api/v1/nsfw/moderation/flags?status=pending&limit=20",);
    expect(state.messages[0]?.content,).toContain("f-1",);

    expect(await dispatchModerationCommand(host, "/delete",),).toBe(true,);
    expect(state.errors,).toEqual(["Usage: /delete <messageId> — delete a message.",],);
  });

  test("unrelated commands are left to the other dispatchers / send path", async () => {
    const { host, state, } = commandHost();

    expect(await dispatchGroupCommand(host, "/help",),).toBe(false,);
    expect(await dispatchModerationCommand(host, "/help",),).toBe(false,);
    expect(calls,).toEqual([],);
    expect(state.errors,).toEqual([],);
  });

  test("caller helpers unwrap bare payloads and pin request shapes", async () => {
    replies = [
      roster,
      { turnOrder: null, },
      { ok: true, },
      { data: { ok: true, }, },
      { data: {}, },
      { data: { flags: [], total: 0, }, },
    ];

    const people = await listParticipants("chat-1", "tok",);
    const order = await loadTurnOrder("chat-1", "tok",);
    const impersonation = await setImpersonation("chat-1", "a-2", "tok",);
    const hidden = await hideMessage("m-1", "spam", "tok",);
    const deleted = await deleteMessage("m-1", "tok",);
    const queue = await loadModerationQueue("pending", "tok",);

    for (const result of [people, order, impersonation, hidden, queue,]) {
      expect(result.ok,).toBe(true,);
    }

    if (!people.ok || !order.ok || !impersonation.ok || !hidden.ok || !queue.ok) { return; }

    expect(people.data,).toEqual(roster,);
    expect(order.data.turnOrder,).toBeNull();
    expect(impersonation.data,).toEqual({ ok: true, },);
    expect(hidden.data,).toEqual({ ok: true, },);
    expect(deleted.ok,).toBe(true,);
    expect(queue.data.flags,).toEqual([],);

    expect(calls.map((c,) => c.url),).toEqual([
      "http://localhost:3000/api/v1/chats/chat-1/participants",
      "http://localhost:3000/api/v1/chats/chat-1/turn-order",
      "http://localhost:3000/api/v1/chats/chat-1/impersonate",
      "http://localhost:3000/api/v1/messages/m-1/visibility",
      "http://localhost:3000/api/v1/messages/m-1",
      "http://localhost:3000/api/v1/nsfw/moderation/flags?status=pending&limit=20",
    ],);
  });
});

// Live pins for the two group surfaces the TUI now calls.
describe("group-chat routes the TUI calls", () => {
  test("participants and turn-order answer the shapes the group command reads", async () => {
    const people = await call(`/api/v1/chats/${chatId}/participants`,);
    expect(people.status,).toBe(200,);
    const peopleBody: unknown = await people.json();
    expect(Array.isArray(peopleBody,),).toBe(true,);
    for (const row of peopleBody as { actor_id?: unknown; display_name?: unknown }[]) {
      expect(typeof row.actor_id,).toBe("string",);
      expect(typeof row.display_name,).toBe("string",);
    }

    const order = await call(`/api/v1/chats/${chatId}/turn-order`,);
    expect(order.status,).toBe(200,);
    const orderBody = (await order.json()) as { turnOrder?: unknown };
    expect("turnOrder" in orderBody,).toBe(true,);
  });

  test("the moderation queue answers the redacted flag envelope", async () => {
    const res = await call("/api/v1/nsfw/moderation/flags?status=pending&limit=20",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data?: { flags?: unknown; total?: unknown } };
    expect(Array.isArray(body.data?.flags,),).toBe(true,);
    expect(typeof body.data?.total,).toBe("number",);
  });
});
