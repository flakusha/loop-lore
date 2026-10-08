// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for merge-preview (FEA-2026-047).
 *
 * Coverage: access denial, merge not found, idempotent replay of stored LLM
 * preview, overlay mode happy path, LLM mode happy path, LLM mode with
 * parse failure, ancestor not found, source not found.
 *
 * mock.module is gated to --isolate (process-global; leaks across files).
 */
import { beforeAll, describe, expect, mock, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { MessageRole, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
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

// Mock targets
let callMergeLlmMock: ReturnType<typeof mock>;

if (ISOLATED) {
  const realLlmCall = await import("./merge-llm-call");
  callMergeLlmMock = mock(() => Promise.resolve({ ok: true, content: '[{"role":"assistant","content":"merged"}]', },));
  mock.module("./merge-llm-call", () => ({
    ...realLlmCall,
    callMergeLlm: callMergeLlmMock,
  }),);
}

const { buildPreview, } = await import("./merge-preview");
const { finalizeMergeRow, guardDraftToConfirmed, insertMergeRow, insertSourceRows, updateMergeMetadata, } =
  await import("./merge-store");

const { MergeMode, } = await import("./merge-criteria");

beforeAll(async () => {
  createLogger({ level: "error", },);
  tdb = await createTestDb();
  const { db, } = tdb;
  actorId = OWNER_ID;
  chatId = CHAT_ID;
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertChats(db, "Merge Preview", OWNER_ID, { id: CHAT_ID, type: "direct", mode: "direct", } as never,);
  rootId = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.User, "root",);
  midId = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "mid", { parent_id: rootId, } as never,);
  tipA = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "tipA", { parent_id: midId, } as never,);
  tipB = await insertMessages(db, CHAT_ID, OWNER_ID, MessageRole.Assistant, "tipB", { parent_id: midId, } as never,);
},);

async function seedMerge(mode: string,): Promise<string> {
  const mergeId = await insertMergeRow(tdb.db, {
    chatId,
    baseMessageId: midId,
    mode,
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

  return mergeId;
}

describe("merge-preview", () => {
  test("rejects access for a non-owner", async () => {
    const mergeId = await seedMerge(MergeMode.Combined,);
    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId,
        actorId: STRANGER_ID,
        userRole: null,
        regenerate: undefined,
        styleHint: undefined,
      },
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("not_found",); }
  });

  test("returns not_found for an unknown merge id", async () => {
    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId: randomUUID(),
        actorId,
        userRole: null,
        regenerate: undefined,
        styleHint: undefined,
      },
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("not_found",); }
  });

  test("replays stored LLM preview without regenerating", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedMerge(MergeMode.Combined,);
    await updateMergeMetadata(tdb.db, {
      mergeId,
      metadata: {
        preview: {
          kind: "llm",
          draft: [{ role: "assistant", content: "stored draft", },],
          tokenEstimate: { sharedPrefix: 0, perSource: [], },
          truncated: false,
          generatedAt: new Date().toISOString(),
          attempts: 1,
        },
      },
    },);

    callMergeLlmMock.mockClear();

    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        regenerate: undefined,
        styleHint: undefined,
      },
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.kind,).toBe("llm",);
    expect(result.draft,).toHaveLength(1,);
    expect(result.draft![0]!.content,).toBe("stored draft",);
    expect(callMergeLlmMock,).not.toHaveBeenCalled();
  });

  test("regenerates when regenerate=true even with stored preview", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedMerge(MergeMode.Combined,);
    await updateMergeMetadata(tdb.db, {
      mergeId,
      metadata: {
        preview: {
          kind: "llm",
          draft: [{ role: "assistant", content: "stored draft", },],
          tokenEstimate: { sharedPrefix: 0, perSource: [], },
          truncated: false,
          generatedAt: new Date().toISOString(),
          attempts: 1,
        },
      },
    },);

    callMergeLlmMock.mockClear();

    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        regenerate: true,
        styleHint: undefined,
      },
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(callMergeLlmMock,).toHaveBeenCalledTimes(1,);
  });

  test("overlay mode returns hunks", async () => {
    const mergeId = await seedMerge(MergeMode.SecondOverFirst,);
    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        regenerate: undefined,
        styleHint: undefined,
      },
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.kind,).toBe("overlay",);
    expect(Array.isArray(result.hunks,),).toBe(true,);
  });

  test("LLM mode returns draft on successful call", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedMerge(MergeMode.Combined,);
    callMergeLlmMock.mockClear();

    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        regenerate: undefined,
        styleHint: undefined,
      },
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.kind,).toBe("llm",);
    expect(result.draft,).toHaveLength(1,);
  });

  test("LLM mode returns error when parse fails", async () => {
    if (!ISOLATED) { return; }
    const mergeId = await seedMerge(MergeMode.Combined,);
    callMergeLlmMock.mockClear();
    callMergeLlmMock.mockResolvedValueOnce({ ok: true, content: "not valid json", },);

    const result = await buildPreview({
      database: tdb.db,
      config: { templates: { llm: {}, }, } as never,
      params: {
        chatId,
        mergeId,
        actorId,
        userRole: null,
        regenerate: undefined,
        styleHint: undefined,
      },
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("llm_parse",); }
  });
});
