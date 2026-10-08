// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for merge-llm-call (FEA-2026-047).
 *
 * Coverage: no provider configured, provider resolves but empty content,
 * provider resolves with content, callWithFailover throws.
 *
 * mock.module is gated to --isolate (process-global; leaks across files).
 */
import { beforeAll, describe, expect, mock, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createLogger, } from "../../../logger";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import { ISOLATED, } from "../../../test-utils/isolate-only";

const OWNER_ID = randomUUID();
const CHAT_ID = randomUUID();

let tdb: TestDb;
let actorId: string;
let chatId: string;

// Mock targets
let resolveModelRoleMock: ReturnType<typeof mock>;
let resolveProviderMock: ReturnType<typeof mock>;
let buildFailoverListMock: ReturnType<typeof mock>;
let callWithFailoverMock: ReturnType<typeof mock>;

if (ISOLATED) {
  const realModelRoles = await import("../../../admin/model-roles");
  const realRegistry = await import("../../../generation/providers/registry");
  const realFailover = await import("../../../generation/providers/call-with-failover");

  resolveModelRoleMock = mock(() => Promise.resolve({ provider: "openai", model: "gpt-4", },));
  resolveProviderMock = mock(() =>
    Promise.resolve({
      resolvedProviderName: "openai",
      resolvedModel: "gpt-4",
      resolvedApiKey: "sk-test",
    },)
  );

  buildFailoverListMock = mock(() => []);
  callWithFailoverMock = mock(() => Promise.resolve({ content: "merged output", },));

  mock.module("../../../admin/model-roles", () => ({
    ...realModelRoles,
    resolveModelRole: resolveModelRoleMock,
  }),);

  mock.module("../../../generation/providers/registry", () => ({
    ...realRegistry,
    resolveProvider: resolveProviderMock,
    buildFailoverList: buildFailoverListMock,
  }),);

  mock.module("../../../generation/providers/call-with-failover", () => ({
    ...realFailover,
    callWithFailover: callWithFailoverMock,
  }),);
}

const { callMergeLlm, } = await import("./merge-llm-call");

beforeAll(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;
  actorId = OWNER_ID;
  chatId = CHAT_ID;
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertChats(db, "Merge LLM Call", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
},);

describe("merge-llm-call", () => {
  test("returns llm_unavailable when no provider configured", async () => {
    if (!ISOLATED) { return; }
    resolveModelRoleMock.mockClear();
    resolveModelRoleMock.mockResolvedValueOnce({ provider: null, model: null, },);

    const result = await callMergeLlm(tdb.db, {} as never, chatId, actorId, [
      { role: "user", content: "test", },
    ],);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("llm_unavailable",); }
  });

  test("returns llm_unavailable when LLM returns empty content", async () => {
    if (!ISOLATED) { return; }
    callWithFailoverMock.mockClear();
    callWithFailoverMock.mockResolvedValueOnce({ content: "", },);

    const result = await callMergeLlm(tdb.db, {} as never, chatId, actorId, [
      { role: "user", content: "test", },
    ],);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("llm_unavailable",); }
  });

  test("returns content on successful LLM call", async () => {
    if (!ISOLATED) { return; }
    callWithFailoverMock.mockClear();
    callWithFailoverMock.mockResolvedValueOnce({ content: "merged narrative", },);

    const result = await callMergeLlm(tdb.db, {} as never, chatId, actorId, [
      { role: "user", content: "test", },
    ],);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.content,).toBe("merged narrative",);
  });

  test("returns llm_unavailable when callWithFailover throws", async () => {
    if (!ISOLATED) { return; }
    callWithFailoverMock.mockClear();
    callWithFailoverMock.mockRejectedValueOnce(new Error("provider timeout",),);

    const result = await callMergeLlm(tdb.db, {} as never, chatId, actorId, [
      { role: "user", content: "test", },
    ],);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("llm_unavailable",); }
  });
});
