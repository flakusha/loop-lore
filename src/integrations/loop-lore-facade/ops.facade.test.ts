// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops.facade.test.ts — facade ops over the
// REAL chat/generation services on a :memory: database.
//
// Covers the slice's acceptance surfaces end-to-end through runFacadeOp:
//  - chat.send rejects whitespace-only content with 400 BEFORE any side
//    effect and still writes the per-call audit row;
//  - chat.history resolves a real chat (200) and an unknown one (404), and
//    ignores principal-shaped body fields (trust boundary on a REAL op);
//  - generation ops delegate to the handle* seams (active with a user, no
//    config, no AI actors) and surface typed rejections.
//
// Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, no ports, no env, no sleeps; the audit assertions read rows
// back from log_entries (the same table /api/admin/audit serves).

import { afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createRequestContext, } from "../../middleware/types";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { registerChatOps, } from "./ops/chat";
import { registerGenerationOps, } from "./ops/generation";
import { createFacadeRegistry, runFacadeOp, } from "./registry";
import { facadeContextFromRequestContext, } from "./types";

const USER = "facade-user";
const CHAT = "facade-chat-1";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  config = {} as Config;

  await insertUsers(db, USER, "Facade User", { id: USER, },);
  await insertChats(db, "facade-chat", USER, { id: CHAT, },);
},);

afterEach(async () => {
  // Audit rows are asserted per test; clear between tests for isolation.
  await db.deleteFrom("log_entries",).where("event_type", "=", "facade.op",).execute();
},);

function buildRegistry(): ReturnType<typeof createFacadeRegistry> {
  const registry = createFacadeRegistry();
  registerChatOps(registry, { database: db, config, },);
  registerGenerationOps(registry, { database: db, config, },);
  return registry;
}

function ctxFor(userId: string | null,): ReturnType<typeof facadeContextFromRequestContext> {
  const rc = createRequestContext({
    userId,
    userRole: userId === null ? null : "user",
    sessionId: null,
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-facade-1", }, db, config,);
}

async function countAuditRows(): Promise<number> {
  const rows = await db
    .selectFrom("log_entries",)
    .selectAll()
    .where("event_type", "=", "facade.op",)
    .execute();

  return rows.length;
}

describe("facade ops over the real services", () => {
  test("chat.send rejects whitespace-only content with 400 and still audits the call", async () => {
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor(USER,), "chat.send", {
      chatId: CHAT,
      content: "   \n\t  ",
    },);

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(400,);

    // The audit row exists even for the rejected call, attributed to the
    // context principal — one row per facade call (epic requirement).
    expect(await countAuditRows(),).toBe(1,);
    const row = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "facade.op",)
      .executeTakeFirst();

    expect(row?.action,).toBe("chat.send",);
    expect(row?.user_id,).toBe(USER,);
    expect(row?.module,).toBe("loop-lore-facade",);
    expect(row?.meta ?? "",).toContain("chat-write",);
  });

  test("chat.send with a malformed body fails schema validation with 400", async () => {
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor(USER,), "chat.send", {
      chatId: CHAT,
      // content missing -> MessageCreateBody rejects
      parentId: null,
    },);

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(400,);
  });

  test("chat.history lists a real chat and ignores a principal-shaped body field", async () => {
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor(USER,), "chat.history", {
      chatId: CHAT,
      // Adversarial: must be ignored — identity comes from the context only.
      userId: "attacker",
    },);

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
    // jsonPaginated envelope: { data, pagination: { total, ... }, meta }.
    const json = result.json as { data: unknown[]; pagination: { total: number } };
    expect(Array.isArray(json.data,),).toBe(true,);
    expect(json.pagination.total,).toBe(0,);
  });

  test("chat.history on an unknown chat is a 404 through the shared access seam", async () => {
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor(USER,), "chat.history", {
      chatId: "no-such-chat",
    },);

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
  });

  test("anonymous facade calls fail closed at the facade, before any service", async () => {
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor(null,), "chat.history", { chatId: CHAT, },);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(401,);
    expect(await countAuditRows(),).toBe(0,);
  });

  test("generation.active is admin-only — the facade inherits the route guard, no bypass", async () => {
    // handleListActiveGenerations is a global control-plane listing guarded by
    // can(userRole, "admin.system") (BUG-generation-control-plane-routes-lack
    // -authorization). A facade caller with the plain user role must hit the
    // SAME 403 — proof the facade never skips route-level authz.
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor(USER,), "generation.active", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
  });

  test("generation.status requires a chatId in the body (the route's URL param)", async () => {
    const registry = buildRegistry();
    const missing = await runFacadeOp(registry, ctxFor(USER,), "generation.status", {},);
    expect(missing.ok,).toBe(false,);
    expect(missing.status,).toBe(400,);

    const present = await runFacadeOp(registry, ctxFor(USER,), "generation.status", { chatId: CHAT, },);
    expect(present.status,).not.toBe(400,);
  });

  test("every registered op exposes a manifest descriptor with a scope", () => {
    const manifest = buildRegistry().manifest();
    const names = manifest.map((m,) => m.name);
    expect(names,).toContain("chat.send",);
    expect(names,).toContain("chat.history",);
    expect(names,).toContain("generation.generate",);
    expect(names,).toContain("generation.active",);
    for (const entry of manifest) {
      expect(["read", "chat-write",],).toContain(entry.scope,);
    }
  });
});
