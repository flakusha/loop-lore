// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for merge-continue (FEA-2026-047).
 *
 * Coverage: access denial, merge not found, not confirmed, no result message,
 * prompt path (insertUserMessageRow + maybeAutoReply), no-prompt path
 * (isLlmGenerationConfigured guard + triggerAutoGeneration).
 *
 * mock.module is gated to --isolate (process-global; leaks across files).
 */
import { beforeAll, describe, expect, mock, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { MessageRole, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatBranches,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { ISOLATED, } from "../../../test-utils/isolate-only";

const OWNER_ID = randomUUID();
const STRANGER_ID = randomUUID();
const CHAT_ID = randomUUID();

let tdb: TestDb;
let actorId: string;
let chatId: string;
let rootId: string;
let midId: string;
let tipA: string;
let tipB: string;

// Mock targets (registered before dynamic import of SUT)
let insertUserMessageRowMock: ReturnType<typeof mock>;
let maybeAutoReplyMock: ReturnType<typeof mock>;
let triggerAutoGenerationMock: ReturnType<typeof mock>;
let isLlmGenerationConfiguredMock: ReturnType<typeof mock>;

if (ISOLATED) {
  const realInsert = await import("../../../routes/messages/insert-message");
  const realReply = await import("../../../routes/messages/reply");
  const realAutoGen = await import("../../../generation/auto-gen");
  const realLlmConfig = await import("../../../generation/auto-gen/llm-config");

  insertUserMessageRowMock = mock(() => Promise.resolve({ ok: true, },));
  maybeAutoReplyMock = mock(() => Promise.resolve({ replied: true, },));
  triggerAutoGenerationMock = mock(() => Promise.resolve());
  isLlmGenerationConfiguredMock = mock(() => true);

  mock.module("../../../routes/messages/insert-message", () => ({
    ...realInsert,
    insertUserMessageRow: insertUserMessageRowMock,
  }),);

  mock.module("../../../routes/messages/reply", () => ({
    ...realReply,
    maybeAutoReply: maybeAutoReplyMock,
  }),);

  mock.module("../../../generation/auto-gen", () => ({
    ...realAutoGen,
    triggerAutoGeneration: triggerAutoGenerationMock,
  }),);

  mock.module("../../../generation/auto-gen/llm-config", () => ({
    ...realLlmConfig,
    isLlmGenerationConfigured: isLlmGenerationConfiguredMock,
  }),);
}

const { continueFromMerge, } = await import("./merge-continue");
const { finalizeMergeRow, guardDraftToConfirmed, insertMergeRow, insertSourceRows, } = await import("./merge-store");

beforeAll(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;
  actorId = OWNER_ID;
  chatId = CHAT_ID;
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertChats(db, "Merge Continue", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
  rootId = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
  midId = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "mid", { parent_id: rootId, } as never,);
  tipA = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "tipA", { parent_id: midId, } as never,);
  tipB = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "tipB", { parent_id: midId, } as never,);
},);

async function seedConfirmedMerge(): Promise<string> {
  const mergeId = await insertMergeRow(tdb.db, {
    chatId,
    baseMessageId: midId,
    mode: "combined",
    createdBy: actorId,
    idempotencyKey: null,
  },);

  await insertSourceRows(tdb.db, {
    mergeId,
    sources: [
      { ordinal: 0, branchId: null, tipMessageId: tipA, },
      { ordinal: 1, branchId: null, tipMessageId: tipB, },
    ],
  },);

  await guardDraftToConfirmed(tdb.db, { mergeId, confirmedAt: new Date().toISOString(), },);
  const resultMsgId = await insertMessages(
    tdb.db,
    chatId,
    actorId,
    MessageRole.Assistant,
    "merged result",
    { parent_id: midId, } as never,
  );

  const branchId = await insertChatBranches(tdb.db, chatId, resultMsgId, `merged-${randomUUID()}`,);
  await finalizeMergeRow(tdb.db, {
    mergeId,
    resultMessageId: resultMsgId,
    mergedBranchId: branchId,
    confirmedAt: new Date().toISOString(),
  },);

  return mergeId;
}

describe("merge-continue", () => {
  test("rejects access for a non-owner", async () => {
    const mergeId = await seedConfirmedMerge();
    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId,
        actorId: STRANGER_ID,
        userRole: null,
        prompt: undefined,
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("not_found",); }
  });

  test("returns not_found for an unknown merge id", async () => {
    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId: randomUUID(),
        actorId,
        userRole: null,
        prompt: undefined,
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("not_found",); }
  });

  test("returns bad_request when merge is not confirmed", async () => {
    const mergeId = await insertMergeRow(tdb.db, {
      chatId,
      baseMessageId: midId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        prompt: undefined,
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("bad_request",); }
  });

  test("returns not_found when confirmed merge has no result message", async () => {
    const mergeId = await insertMergeRow(tdb.db, {
      chatId,
      baseMessageId: midId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    await guardDraftToConfirmed(tdb.db, { mergeId, confirmedAt: new Date().toISOString(), },);
    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        prompt: undefined,
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("not_found",); }
  });

  test("with prompt: inserts user message and triggers auto-reply", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedConfirmedMerge();
    insertUserMessageRowMock.mockClear();
    maybeAutoReplyMock.mockClear();

    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        prompt: "continue the story",
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.context.mergeId,).toBe(mergeId,);
    expect(result.context.replied,).toBe(true,);
    expect(insertUserMessageRowMock,).toHaveBeenCalledTimes(1,);
    expect(maybeAutoReplyMock,).toHaveBeenCalledTimes(1,);
  });

  test("without prompt: triggers direct auto-generation when LLM configured", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedConfirmedMerge();
    triggerAutoGenerationMock.mockClear();
    isLlmGenerationConfiguredMock.mockClear();
    isLlmGenerationConfiguredMock.mockReturnValue(true,);

    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        prompt: undefined,
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.context.replied,).toBe(false,);
    expect(triggerAutoGenerationMock,).toHaveBeenCalledTimes(1,);
  });

  test("without prompt: returns bad_request when no LLM configured", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedConfirmedMerge();
    isLlmGenerationConfiguredMock.mockClear();
    isLlmGenerationConfiguredMock.mockReturnValue(false,);

    const result = await continueFromMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        prompt: undefined,
        responderId: undefined,
      },
      request: new Request("http://localhost",),
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("bad_request",); }
  });
});
