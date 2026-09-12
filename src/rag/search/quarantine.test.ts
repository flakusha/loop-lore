// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the search-quarantine helpers
 * (TASK-chat-feature-archive-deletion-search).
 *
 * The provider-circuit-breaker surface (`searchBreaker`, `quarantineOnCaptcha`,
 * `quarantineOnRateLimit`, `trackSearchError`) is exercised by
 * `orchestrator.test.ts`. This file covers the RAG-recall archive-exclusion
 * helper added alongside them.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { PinnedState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { excludeArchivedChats, } from "./quarantine";

describe("excludeArchivedChats", () => {
  let db: Kysely<DB>;
  let userId: string;
  let liveId: string;
  let archivedId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `u-${userId}`, "Test", { id: userId, } as never,);
    liveId = crypto.randomUUID();
    archivedId = crypto.randomUUID();
    await insertChats(db, "Live", userId, { id: liveId, is_pinned: "unpinned", } as never,);
    await insertChats(db, "Archived", userId, { id: archivedId, is_pinned: "archived", } as never,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("filters archived chat ids out of the candidate set by default", async () => {
    const filtered = await excludeArchivedChats(db, [liveId, archivedId,],);
    expect(filtered,).toEqual([liveId,],);
  });

  test("includeArchived = true returns the original set unchanged", async () => {
    const filtered = await excludeArchivedChats(db, [liveId, archivedId,], true,);
    expect(filtered,).toEqual([liveId, archivedId,],);
  });

  test("empty input short-circuits to an empty result", async () => {
    expect(await excludeArchivedChats(db, [],),).toEqual([],);
  });

  test("missing chat ids fall through unchanged (no spurious filter)", async () => {
    const filtered = await excludeArchivedChats(db, [liveId, "missing-id",],);
    expect(filtered,).toEqual([liveId, "missing-id",],);
  });

  test("all-archived input collapses to empty", async () => {
    const filtered = await excludeArchivedChats(db, [archivedId,],);
    expect(filtered,).toEqual([],);
  });

  test("chat archived after the snapshot is filtered out", async () => {
    // Caller archives mid-flight — the next call must reflect the live state,
    // not the caller's stale set. This mirrors RAG recall running a periodic
    // candidate scan where chats flip in/out of archived.
    const candidate = crypto.randomUUID();
    await insertChats(db, "Late", userId, { id: candidate, is_pinned: "unpinned", } as never,);
    const firstPass = await excludeArchivedChats(db, [candidate,],);
    expect(firstPass,).toEqual([candidate,],);

    await db
      .updateTable("chats",)
      .set({ is_pinned: PinnedState.Archived, },)
      .where("id", "=", candidate,)
      .execute();

    const secondPass = await excludeArchivedChats(db, [candidate,],);
    expect(secondPass,).toEqual([],);
  });
});
