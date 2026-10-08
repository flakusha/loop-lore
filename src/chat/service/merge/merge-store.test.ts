/**
 * Tests for merge persistence (FEA-2026-047).
 *
 * Coverage: insert/load round-trip, idempotency-key lookup, source rows
 * ordered by ordinal, metadata update, guarded draft->confirmed transition
 * (rowcount 1 then 0 = the 409 replay path), finalize.
 */
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
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
import {
  finalizeMergeRow,
  guardDraftToConfirmed,
  insertMergeRow,
  insertSourceRows,
  listSources,
  loadMerge,
  loadMergeByIdempotencyKey,
  updateMergeMetadata,
} from "./merge-store";

describe("merge-store", () => {
  let tdb: TestDb;
  let chatId: string;
  let actorId: string;
  let baseMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;
    actorId = randomUUID();
    chatId = randomUUID();
    await insertUsers(db, `actor-${actorId}`, "Actor", { id: actorId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: actorId, owner_id: actorId, } as never,);
    await insertChats(db, "Merge Store", actorId, { id: chatId, type: "direct", mode: "direct", } as never,);
    baseMessageId = await insertMessages(db, chatId, actorId, MessageRole.User, "base",);
  },);

  test("inserts a draft merge and loads it back", async () => {
    const { db, } = tdb;
    const mergeId = await insertMergeRow(db, {
      chatId,
      baseMessageId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    const merge = await loadMerge(db, mergeId,);
    expect(merge,).not.toBeNull();
    expect(merge!.id,).toBe(mergeId,);
    expect(merge!.chat_id,).toBe(chatId,);
    expect(merge!.base_message_id,).toBe(baseMessageId,);
    expect(merge!.mode,).toBe("combined",);
    expect(merge!.status,).toBe("draft",);
  });

  test("returns null for an unknown merge id", async () => {
    expect(await loadMerge(tdb.db, "nope",),).toBeNull();
  });

  test("finds a merge by idempotency key and misses an unknown key", async () => {
    const { db, } = tdb;
    const mergeId = await insertMergeRow(db, {
      chatId,
      baseMessageId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: "idem-key-1",
    },);

    const found = await loadMergeByIdempotencyKey(db, { chatId, idempotencyKey: "idem-key-1", },);
    expect(found?.id,).toBe(mergeId,);
    expect(await loadMergeByIdempotencyKey(db, { chatId, idempotencyKey: "missing", },),).toBeNull();
  });

  test("inserts sources and lists them ordered by ordinal", async () => {
    const { db, } = tdb;
    const mergeId = await insertMergeRow(db, {
      chatId,
      baseMessageId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    const tip1 = await insertMessages(
      db,
      chatId,
      actorId,
      MessageRole.Assistant,
      "tip1",
      { parent_id: baseMessageId, } as never,
    );

    const tip2 = await insertMessages(
      db,
      chatId,
      actorId,
      MessageRole.Assistant,
      "tip2",
      { parent_id: baseMessageId, } as never,
    );

    await insertSourceRows(db, {
      mergeId,
      sources: [
        { ordinal: 0, branchId: null, tipMessageId: tip1, },
        { ordinal: 1, branchId: null, tipMessageId: tip2, },
      ],
    },);

    const sources = await listSources(db, mergeId,);
    expect(sources,).toHaveLength(2,);
    expect(sources[0]!.ordinal,).toBe(0,);
    expect(sources[0]!.tip_message_id,).toBe(tip1,);
    expect(sources[1]!.ordinal,).toBe(1,);
    expect(sources[1]!.tip_message_id,).toBe(tip2,);
  });

  test("stores and reloads preview metadata", async () => {
    const { db, } = tdb;
    const mergeId = await insertMergeRow(db, {
      chatId,
      baseMessageId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    await updateMergeMetadata(db, {
      mergeId,
      metadata: {
        preview: {
          kind: "llm",
          draft: [{ role: "assistant", content: "hi", },],
          tokenEstimate: { sharedPrefix: 1, perSource: [2,], },
          truncated: false,
          generatedAt: "2026-01-01T00:00:00.000Z",
          attempts: 1,
        },
      },
    },);

    const merge = await loadMerge(db, mergeId,);
    const parsed = JSON.parse(merge!.metadata!,) as { preview: { kind: string } };
    expect(parsed.preview.kind,).toBe("llm",);
  });

  test("guards the draft->confirmed transition (1 then 0 = 409 replay)", async () => {
    const { db, } = tdb;
    const mergeId = await insertMergeRow(db, {
      chatId,
      baseMessageId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    const first = await guardDraftToConfirmed(db, { mergeId, confirmedAt: "2026-01-01T00:00:00.000Z", },);
    expect(first,).toBe(1,);
    expect((await loadMerge(db, mergeId,))!.status,).toBe("confirmed",);

    const second = await guardDraftToConfirmed(db, { mergeId, confirmedAt: "2026-01-02T00:00:00.000Z", },);
    expect(second,).toBe(0,);
  });

  test("finalizes the result message and merged branch ids", async () => {
    const { db, } = tdb;
    const mergeId = await insertMergeRow(db, {
      chatId,
      baseMessageId,
      mode: "combined",
      createdBy: actorId,
      idempotencyKey: null,
    },);

    const resultId = await insertMessages(
      db,
      chatId,
      actorId,
      MessageRole.Assistant,
      "merged",
      { parent_id: baseMessageId, } as never,
    );

    const branchId = await insertChatBranches(db, chatId, resultId, "Merged 1", { is_active: 0, } as never,);

    await finalizeMergeRow(db, {
      mergeId,
      resultMessageId: resultId,
      mergedBranchId: branchId,
      confirmedAt: "2026-01-01T00:00:00.000Z",
    },);

    const merge = await loadMerge(db, mergeId,);
    expect(merge!.result_message_id,).toBe(resultId,);
    expect(merge!.merged_branch_id,).toBe(branchId,);
  });
});
