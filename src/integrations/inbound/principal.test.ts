// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * principal.test.ts — the inbound stdio principal seam (§3.3).
 *
 * Pins the fail-closed ladder: unseeded store → refusal, disabled server →
 * refusal, empty principal → refusal; a configured transport yields the
 * external-agent principal with the configured tier, and the FACADE's own
 * tier ladder enforces it (a `read` principal is refused `chat.send` with
 * the 403-class body, a `chat-write` principal gets through).
 *
 * Resource contract (parallel-safe): one :memory: SQLite per file, registry
 * reset per build, no ports/env.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { getFacadeRegistry, resetFacadeRegistry, } from "../loop-lore-facade/instance";
import { runFacadeOp, } from "../loop-lore-facade/registry";
import {
  buildInboundFacadeContext,
  effectiveInboundSettings,
  INBOUND_TRANSPORTS,
} from "./principal";
import { initInboundSettings, resetInboundSettings, } from "./settings";

const USER = "inbound-principal-user";
const CHAT = "inbound-principal-chat";

let testDb: TestDb;
let db: Kysely<DB>;
let baseConfig: Config;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  baseConfig = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, USER, "Inbound Operator", { id: USER, },);
  await insertActors(db, "Inbound Operator", { id: USER, user_id: USER, owner_id: USER, },);
  await insertChats(db, "inbound-principal", USER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, USER, { role_in_chat: "owner", },);
},);

afterAll(async () => {
  resetFacadeRegistry();
  resetInboundSettings();
  await destroyTestDb(testDb,);
},);

describe("inbound principal gate", () => {
  test("unseeded store refuses both transports", () => {
    expect(effectiveInboundSettings("mcp-stdio",),).toBeNull();
    expect(effectiveInboundSettings("acp-stdio",),).toBeNull();
    expect(
      buildInboundFacadeContext(db, baseConfig, "mcp-stdio", "req-1",),
    ).toBeNull();
  });

  test("disabled server refuses; enabled server with empty principal refuses", () => {
    initInboundSettings({ mcpEnabled: false, acpEnabled: false, principalUserId: "", principalScope: "read", },);
    expect(effectiveInboundSettings("mcp-stdio",),).toBeNull();

    initInboundSettings({ mcpEnabled: true, acpEnabled: false, principalUserId: "", principalScope: "read", },);
    expect(effectiveInboundSettings("mcp-stdio",),).toBeNull();
    expect(
      buildInboundFacadeContext(db, baseConfig, "mcp-stdio", "req-2",),
    ).toBeNull();
  });

  test("enabled + named principal yields the external-agent context with the configured tier", () => {
    initInboundSettings({ mcpEnabled: true, acpEnabled: false, principalUserId: USER, principalScope: "read", },);

    const ctx = buildInboundFacadeContext(db, baseConfig, "mcp-stdio", "req-3",);
    expect(ctx,).not.toBeNull();
    expect(ctx?.principal.kind,).toBe("external-agent",);
    expect(ctx?.principal.userId,).toBe(USER,);
    expect(ctx?.principal.credentialScope,).toBe("read",);
    expect(ctx?.principal.credentialName,).toBe("inbound-mcp-stdio",);
    expect(ctx?.requestId,).toBe("req-3",);
    expect(effectiveInboundSettings("acp-stdio",),).toBeNull();
  });

  test("the facade tier ladder enforces the configured tier (read refused chat.write)", async () => {
    initInboundSettings({ mcpEnabled: true, acpEnabled: false, principalUserId: USER, principalScope: "read", },);
    resetFacadeRegistry();
    const registry = getFacadeRegistry({ database: db, config: baseConfig, },);
    const ctx = buildInboundFacadeContext(db, baseConfig, "mcp-stdio", "req-4",)!;

    const refused = await runFacadeOp(registry, ctx, "chat.send", { chatId: CHAT, content: "denied", },);
    expect(refused.ok,).toBe(false,);
    expect(refused.status,).toBe(403,);

    const allowed = await runFacadeOp(registry, ctx, "chat.history", { chatId: CHAT, },);
    expect(allowed.ok,).toBe(true,);
  });

  test("chat-write tier admits the write op (the cumulative ladder)", async () => {
    initInboundSettings({ mcpEnabled: true, acpEnabled: false, principalUserId: USER, principalScope: "chat-write", },);
    resetFacadeRegistry();
    const registry = getFacadeRegistry({ database: db, config: baseConfig, },);
    const ctx = buildInboundFacadeContext(db, baseConfig, "mcp-stdio", "req-5",)!;

    const sent = await runFacadeOp(registry, ctx, "chat.send", { chatId: CHAT, content: "hello from stdio", },);
    expect(sent.ok,).toBe(true,);
  });

  test("INBOUND_TRANSPORTS enumerates the §3.3 surface", () => {
    expect(INBOUND_TRANSPORTS,).toEqual(["mcp-stdio", "acp-stdio",],);
  });
});
