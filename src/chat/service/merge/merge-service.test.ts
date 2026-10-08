/**
 * Tests for merge orchestration — initiate (FEA-2026-047).
 *
 * Coverage: draft creation with graph resolution, idempotency replay,
 * fewer-than-two-tips rejection, cross-chat tip rejection (IDOR),
 * overlay preview stored in metadata for deterministic modes.
 */
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { MessageRole, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
import { MergeMode, } from "./merge-criteria";
import { initiateMerge, } from "./merge-service";
import { listSources, loadMerge, } from "./merge-store";

describe("merge-service initiate", () => {
  let tdb: TestDb;
  let chatId: string;
  let actorId: string;
  let rootId: string;
  let midId: string;
  let tipA: string;
  let tipB: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;
    actorId = randomUUID();
    chatId = randomUUID();
    await insertUsers(db, `actor-${actorId}`, "Actor", { id: actorId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: actorId, owner_id: actorId, } as never,);
    await insertChats(db, "Merge Service", actorId, { id: chatId, type: "direct", mode: "direct", } as never,);
    rootId = await insertMessages(db, chatId, actorId, MessageRole.User, "root",);
    midId = await insertMessages(db, chatId, actorId, MessageRole.Assistant, "mid", { parent_id: rootId, } as never,);
    tipA = await insertMessages(db, chatId, actorId, MessageRole.Assistant, "tipA", { parent_id: midId, } as never,);
    tipB = await insertMessages(db, chatId, actorId, MessageRole.Assistant, "tipB", { parent_id: midId, } as never,);
  },);

  test("creates a draft merge with resolved sources", async () => {
    const result = await initiateMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        actorId,
        userRole: null,
        mode: MergeMode.Combined,
        sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },],
      },
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    expect(result.replayed,).toBe(false,);
    expect(result.baseMessageId,).toBe(midId,);
    expect(result.sources,).toHaveLength(2,);
    expect(result.sources[0]!.ordinal,).toBe(0,);
    expect(result.sources[1]!.ordinal,).toBe(1,);
    expect(result.sources[0]!.tailLength,).toBe(1,);

    const merge = await loadMerge(tdb.db, result.mergeId,);
    expect(merge!.status,).toBe("draft",);
    expect(await listSources(tdb.db, result.mergeId,),).toHaveLength(2,);
  });

  test("replays on a duplicate idempotency key", async () => {
    const key = `dup-${randomUUID()}`;
    const first = await initiateMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        actorId,
        userRole: null,
        mode: MergeMode.Combined,
        sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },],
        idempotencyKey: key,
      },
    },);

    const second = await initiateMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        actorId,
        userRole: null,
        mode: MergeMode.Combined,
        sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },],
        idempotencyKey: key,
      },
    },);

    expect("ok" in first && first.ok,).toBe(true,);
    expect("ok" in second && second.ok,).toBe(true,);
    if (!("ok" in first) || !("ok" in second)) { return; }
    expect(second.mergeId,).toBe(first.mergeId,);
    expect(second.replayed,).toBe(true,);
  });

  test("rejects fewer than two source tips", async () => {
    const result = await initiateMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        actorId,
        userRole: null,
        mode: MergeMode.Combined,
        sourceTips: [{ tipMessageId: tipA, },],
      },
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("bad_request",); }
  });

  test("rejects a tip that is not in the chat (IDOR)", async () => {
    const result = await initiateMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        actorId,
        userRole: null,
        mode: MergeMode.Combined,
        sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: "nonexistent", },],
      },
    },);

    expect("ok" in result,).toBe(false,);
    if (!("ok" in result)) { expect(result.code,).toBe("not_found",); }
  });

  test("stores an overlay preview for deterministic modes", async () => {
    const result = await initiateMerge({
      database: tdb.db,
      config: {} as never,
      params: {
        chatId,
        actorId,
        userRole: null,
        mode: MergeMode.SecondOverFirst,
        sourceTips: [{ tipMessageId: tipA, }, { tipMessageId: tipB, },],
      },
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) { return; }
    const merge = await loadMerge(tdb.db, result.mergeId,);
    expect(merge!.metadata,).not.toBeNull();
    const parsed = JSON.parse(merge!.metadata!,) as { preview: { kind: string; hunks: unknown[] } };
    expect(parsed.preview.kind,).toBe("overlay",);
    expect(Array.isArray(parsed.preview.hunks,),).toBe(true,);
  });
});
