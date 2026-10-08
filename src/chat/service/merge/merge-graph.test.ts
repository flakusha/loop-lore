/**
 * Tests for merge graph resolution (FEA-2026-047).
 *
 * Coverage: LCA of two paths, root-only share, no share, empty arrays;
 * resolveMergeGraph happy path, empty-tail rejection, cross-chat tip
 * rejection, disjoint-tree rejection, node ceiling.
 */
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { MessageRole, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
import { lowestCommonAncestor, MAX_MERGE_NODES, resolveMergeGraph, } from "./merge-graph";

describe("merge-graph", () => {
  let tdb: TestDb;
  let chatId: string;
  let actorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;
    actorId = randomUUID();
    chatId = randomUUID();
    await insertUsers(db, `actor-${actorId}`, "Actor", { id: actorId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: actorId, owner_id: actorId, } as never,);
    await insertChats(db, "Merge Graph", actorId, { id: chatId, type: "direct", mode: "direct", } as never,);
  },);

  describe("lowestCommonAncestor", () => {
    test("returns the last common node", () => {
      expect(lowestCommonAncestor(["r", "m1", "m2", "m3",], ["r", "m1", "m2", "m4",],),).toBe("m2",);
    });

    test("returns root when only root is shared", () => {
      expect(lowestCommonAncestor(["r", "m1",], ["r", "m2",],),).toBe("r",);
    });

    test("returns null when no common node", () => {
      expect(lowestCommonAncestor(["r1", "m1",], ["r2", "m2",],),).toBeNull();
    });

    test("handles empty arrays", () => {
      expect(lowestCommonAncestor([], [],),).toBeNull();
    });
  });

  describe("resolveMergeGraph", () => {
    test("resolves LCA and tails for two branches", async () => {
      const { db, } = tdb;
      const root = await insertMessages(db, chatId, actorId, MessageRole.User, "root",);
      const m1 = await insertMessages(db, chatId, actorId, MessageRole.Assistant, "m1", { parent_id: root, } as never,);
      const m2a = await insertMessages(db, chatId, actorId, MessageRole.Assistant, "m2a", { parent_id: m1, } as never,);
      const m2b = await insertMessages(db, chatId, actorId, MessageRole.Assistant, "m2b", { parent_id: m1, } as never,);

      const result = await resolveMergeGraph(db, {
        chatId,
        tips: [{ tipMessageId: m2a, }, { tipMessageId: m2b, },],
      },);

      expect("ok" in result && result.ok,).toBe(true,);
      if ("ok" in result) {
        expect(result.graph.baseMessageId,).toBe(m1,);
        expect(result.graph.sources,).toHaveLength(2,);
        expect(result.graph.sources[0]!.tail,).toEqual([m2a,],);
        expect(result.graph.sources[1]!.tail,).toEqual([m2b,],);
      }
    });

    test("rejects a source whose tip IS the base (no divergent messages)", async () => {
      const { db, } = tdb;
      const root = await insertMessages(db, chatId, actorId, MessageRole.User, "root2",);
      const m1 = await insertMessages(
        db,
        chatId,
        actorId,
        MessageRole.Assistant,
        "m1b",
        { parent_id: root, } as never,
      );

      const result = await resolveMergeGraph(db, {
        chatId,
        tips: [{ tipMessageId: m1, }, { tipMessageId: root, },],
      },);

      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) {
        expect(result.code,).toBe("bad_request",);
        expect(result.message,).toContain("no divergent messages",);
      }
    });

    test("rejects when tip not in chat", async () => {
      const { db, } = tdb;
      const root = await insertMessages(db, chatId, actorId, MessageRole.User, "root3",);
      const m1 = await insertMessages(
        db,
        chatId,
        actorId,
        MessageRole.Assistant,
        "m1c",
        { parent_id: root, } as never,
      );

      const result = await resolveMergeGraph(db, {
        chatId,
        tips: [{ tipMessageId: m1, }, { tipMessageId: "nonexistent", },],
      },);

      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) {
        expect(result.code,).toBe("not_found",);
      }
    });

    test("rejects when sources share no common ancestor", async () => {
      const { db, } = tdb;
      const root1 = await insertMessages(db, chatId, actorId, MessageRole.User, "root4",);
      const root2 = await insertMessages(db, chatId, actorId, MessageRole.User, "root5",);
      const m1 = await insertMessages(
        db,
        chatId,
        actorId,
        MessageRole.Assistant,
        "m1d",
        { parent_id: root1, } as never,
      );

      const m2 = await insertMessages(
        db,
        chatId,
        actorId,
        MessageRole.Assistant,
        "m2d",
        { parent_id: root2, } as never,
      );

      const result = await resolveMergeGraph(db, {
        chatId,
        tips: [{ tipMessageId: m1, }, { tipMessageId: m2, },],
      },);

      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) {
        expect(result.code,).toBe("bad_request",);
        expect(result.message,).toContain("no common ancestor",);
      }
    });

    test("enforces the node ceiling", async () => {
      const { db, } = tdb;
      const chainChatId = randomUUID();
      await insertChats(db, "Deep Chain", actorId, { id: chainChatId, type: "direct", mode: "direct", } as never,);

      let parentId: string | null = null;
      for (let i = 0; i < MAX_MERGE_NODES + 5; i++) {
        parentId = await insertMessages(
          db,
          chainChatId,
          actorId,
          MessageRole.User,
          `msg${i}`,
          { parent_id: parentId, } as never,
        );
      }

      const result = await resolveMergeGraph(db, {
        chatId: chainChatId,
        tips: [{ tipMessageId: parentId!, }, { tipMessageId: parentId!, },],
      },);

      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) {
        expect(result.code,).toBe("bad_request",);
        expect(result.message,).toContain("ceiling",);
      }
    });
  });
});
