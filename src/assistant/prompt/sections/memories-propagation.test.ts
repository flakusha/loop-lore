// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory propagation isolation tests (epic-memory-propagation).
 *
 * DB-level guarantees behind the injection path:
 * - `fetchActorMemories` keeps timeline-agnostic (NULL) rows and rows bound
 *   to the consuming chat's timeline, and drops rows from other timelines —
 *   memories don't leak across timelines.
 * - `resolveChatScopeContext` walks the party lineage (chat + ancestors via
 *   `chats.parent_chat_id`), so party-split branches inherit the party's
 *   memories while unrelated chats never see them.
 * - `provisionMemories` enforces `party` scope with that lineage.
 * - `storeMemories` binds freshly extracted memories to the source chat's
 *   timeline.
 *
 * Follows the patterns of `memories.test.ts` (createTestDb + insert helpers).
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";

import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { storeMemories, } from "../../../memory/extraction-store";
import { provisionMemories, } from "../../../memory/provision";
import type { ProvisionContext, } from "../../../memory/provision";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { fetchActorMemories, resolveChatScopeContext, } from "./memories-helpers";

describe("memory propagation — timeline + party isolation", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let actorId: string;
  let rootId: string;
  let branchId: string;
  let otherId: string;

  beforeEach(async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const env = await createTestDb();
    db = env.db;
    sqlite = env.sqlite;

    await insertUsers(db, "prop-user", "Prop User", { id: "user-prop", } as never,);
    await insertActors(db, "Prop Actor", { id: "actor-prop", } as never,);
    actorId = (await db.selectFrom("actors",).select("id",).limit(1,).executeTakeFirstOrThrow()).id;

    await insertChats(db, "Root", "user-prop", { id: "chat-root", } as never,);
    // Party-split branch: child of the root chat, same (default 'prime') timeline.
    await insertChats(db, "Branch", "user-prop", {
      id: "chat-branch",
      parent_chat_id: "chat-root",
    } as never,);

    // A party of a different lineage: own timeline 'alt'.
    await insertChats(db, "Other", "user-prop", {
      id: "chat-other",
      timeline_id: "alt",
    } as never,);

    rootId = "chat-root";
    branchId = "chat-branch";
    otherId = "chat-other";
  },);

  afterEach(() => {
    sqlite.close();
  },);

  test("fetchActorMemories keeps agnostic and same-timeline rows, drops other timelines", async () => {
    await insertActorMemories(db, actorId, "agnostic memory", {},);
    await insertActorMemories(db, actorId, "prime memory", { timeline_id: "prime", },);
    await insertActorMemories(db, actorId, "alt memory", { timeline_id: "alt", },);

    const prime = await fetchActorMemories(db, { actorId, timelineId: "prime", },);
    expect(prime.map((m,) => m.content).sort(),).toEqual(["agnostic memory", "prime memory",],);

    const alt = await fetchActorMemories(db, { actorId, timelineId: "alt", },);
    expect(alt.map((m,) => m.content).sort(),).toEqual(["agnostic memory", "alt memory",],);

    // No timeline filter = legacy behavior: everything visible.
    const all = await fetchActorMemories(db, { actorId, },);
    expect(all,).toHaveLength(3,);
  });

  test("resolveChatScopeContext walks the ancestor chain and defaults the timeline", async () => {
    const root = await resolveChatScopeContext(db, rootId,);
    expect(root,).toEqual({ timelineId: "prime", partyChatIds: [rootId,], },);

    const branch = await resolveChatScopeContext(db, branchId,);
    expect(branch,).toEqual({ timelineId: "prime", partyChatIds: [branchId, rootId,], },);

    const other = await resolveChatScopeContext(db, otherId,);
    expect(other.timelineId,).toBe("alt",);
    expect(other.partyChatIds,).toEqual([otherId,],);
  });

  test("party-scoped memories reach split branches but never unrelated chats", async () => {
    await insertActorMemories(db, actorId, "party secret", {
      scope: "party",
      source_chat_id: rootId,
    },);

    const mem = (await fetchActorMemories(db, { actorId, },))[0]!;

    const branchCtx = await resolveChatScopeContext(db, branchId,);
    const baseCtx: ProvisionContext = {
      viewerId: actorId,
      ownerId: actorId,
      chatId: branchId,
      worldId: null,
      participantIds: [actorId,],
      timelineId: branchCtx.timelineId,
      partyChatIds: branchCtx.partyChatIds,
    };

    const inBranch = provisionMemories([mem,], baseCtx,);
    expect(inBranch.accepted,).toHaveLength(1,);

    const otherCtx = await resolveChatScopeContext(db, otherId,);
    const inOther = provisionMemories([mem,], {
      ...baseCtx,
      chatId: otherId,
      timelineId: otherCtx.timelineId,
      partyChatIds: otherCtx.partyChatIds,
    },);

    expect(inOther.accepted,).toHaveLength(0,);
    expect(inOther.rejected[0]!.reason,).toBe("scope:party_mismatch",);
  });

  test("storeMemories binds extracted memories to the source chat's timeline", async () => {
    const storedPrime = await storeMemories(db, actorId, rootId, [
      { content: "Bound to prime timeline", memoryType: "episodic", confidence: 0.9, importance: 0.5, keywords: [], },
    ],);

    expect(storedPrime,).toBe(1,);

    const storedAlt = await storeMemories(db, actorId, otherId, [
      { content: "Bound to alt timeline", memoryType: "episodic", confidence: 0.9, importance: 0.5, keywords: [], },
    ],);

    expect(storedAlt,).toBe(1,);

    const rows = await db
      .selectFrom("actor_memories",)
      .select(["content", "timeline_id",],)
      .execute();

    const byContent = new Map(rows.map((r,) => [r.content, r.timeline_id,]),);
    expect(byContent.get("Bound to prime timeline",),).toBe("prime",);
    expect(byContent.get("Bound to alt timeline",),).toBe("alt",);
  });
});
