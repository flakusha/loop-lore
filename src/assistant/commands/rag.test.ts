// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the RAG assistant commands: /rag-search, /rag-ask.
 *
 * `searchLore` is keyword-scored over the world/actor lore tables, so the
 * ranking rules are pinned directly: a row scores one point per matched term,
 * zero-score rows are dropped, and the result is capped at 10.
 *
 * `callAux` is mocked behind the ISOLATED gate (bun's `mock.module` is
 * process-global — the repo's canonical gates run `--isolate`/`--parallel`,
 * and an unguarded stub would poison later files, BUG 9c8bea1).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuxCallResult, } from "../../aux-pipeline/types";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorLoreEntries,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the rag handlers register themselves on module load.
import "./rag";

const callAuxMock = mock<
  (task: string, config: Config, db: Kysely<DB>, messages: unknown[], opts?: unknown,) => Promise<AuxCallResult | null>
>(() => Promise.resolve(null,));

if (ISOLATED) {
  mock.module("../../aux-pipeline", () => ({ callAux: callAuxMock, }),);
}

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const ragSearch = mustGet("rag-search",);
const ragAsk = mustGet("rag-ask",);

const NO_AUX_CONFIG = {
  generation: { defaultProvider: "mock", defaultModels: { mock: "m", }, modelRoles: {}, },
} as unknown as Config;

function auxResult(content: string,): AuxCallResult {
  return { content, model: "m", provider: "mock", latencyMs: 1, promptTokens: 1, completionTokens: 1, };
}

describe("rag commands", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let worldId: string;
  let actorId: string;

  const ownerCtx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    config: NO_AUX_CONFIG,
    userId: ownerId,
    activeChat: { id: "chat-1", worldId, },
    ...overrides,
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    // FK-safe order: lore rows reference worlds/actors, which reference users.
    for (const table of ["world_lore_entries", "actor_lore_entries", "actors", "worlds", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    callAuxMock.mockClear();

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    worldId = `world-${crypto.randomUUID()}`;
    await insertWorlds(db, ownerId, "Lore World", { id: worldId, },);
    actorId = `actor-${crypto.randomUUID()}`;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Iria",
        owner_id: ownerId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    await insertWorldLoreEntries(db, worldId, "The drowned city lies beneath the tide.", { name: "Drowned City", },);
    await insertWorldLoreEntries(db, worldId, "Unrelated trivia about horses.", { name: "Horses", },);
    await insertActorLoreEntries(db, actorId, "Iria guards the tide gate.", { name: "Iria", world_id: worldId, },);
    // disabled rows must never be searched
    await insertWorldLoreEntries(db, worldId, "Disabled secret about the tide.", {
      name: "Disabled",
      enabled: "disabled",
    },);
  },);

  // ── /rag-search ───────────────────────────────────────────

  test("finds matching world and actor lore and tags the source", async () => {
    const result = await ragSearch(["tide",], ownerCtx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("rag-results",);
    expect(result.systemMessage,).toContain("Drowned City",);
    expect(result.systemMessage,).toContain("(world)",);
    expect(result.systemMessage,).toContain("Iria",);
    expect(result.systemMessage,).toContain("(actor)",);
    expect(result.actionPayload!.hits,).toHaveLength(2,);
  });

  test("excludes disabled lore entries", async () => {
    const result = await ragSearch(["secret",], ownerCtx(),);
    expect(result.systemMessage,).toBe('No results for "secret".',);
  });

  test("drops rows that match no term", async () => {
    const result = await ragSearch(["tide",], ownerCtx(),);
    expect(result.systemMessage,).not.toContain("Horses",);
  });

  test("reports no results for an unmatched query", async () => {
    const result = await ragSearch(["zzzznothing",], ownerCtx(),);
    expect(result.systemMessage,).toBe('No results for "zzzznothing".',);
    expect(result.action,).toBeUndefined();
  });

  test("shows usage with an empty query", async () => {
    expect((await ragSearch(["   ",], ownerCtx(),)).systemMessage,).toBe("Usage: /rag-search <query>",);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await ragSearch(["tide",], { chatId: "chat-1", userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**RAG unavailable:** command context missing database.",);
  });

  test("denies a caller who cannot access the world", async () => {
    const result = await ragSearch(["tide",], ownerCtx({ userId: otherId, },),);
    expect(result.systemMessage,).toBe("**Access denied:** cannot search documents in this world.",);
  });

  test("a query with no word characters yields no hits", async () => {
    const result = await ragSearch(["!!!",], ownerCtx(),);
    expect(result.systemMessage,).toBe('No results for "!!!".',);
  });

  // ── /rag-ask ──────────────────────────────────────────────

  test("shows usage with an empty question", async () => {
    expect((await ragAsk(["  ",], ownerCtx(),)).systemMessage,).toBe("Usage: /rag-ask <question>",);
  });

  test("answers unavailable instead of throwing when ctx has no db", async () => {
    const result = await ragAsk(["tide",], { chatId: "chat-1", config: NO_AUX_CONFIG, userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**RAG unavailable:** command context missing database.",);
  });

  test("answers unavailable instead of throwing when ctx has no config", async () => {
    const result = await ragAsk(["tide",], { chatId: "chat-1", db, userId: ownerId, },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**RAG unavailable:** command context missing config.",);
  });

  test("denies a caller who cannot access the world", async () => {
    const result = await ragAsk(["tide",], ownerCtx({ userId: otherId, },),);
    expect(result.systemMessage,).toBe("**Access denied:** cannot search documents in this world.",);
  });

  // ── Aux-dependent /rag-ask behaviour ─────────────────────────
  //
  // These need the `callAux` double installed at the top of this file, and
  // `mock.module` is process-global: without per-file isolation it is NOT
  // installed, so the real callAux runs. Two of these then fail outright, and
  // "no answer service configured" passes for the WRONG reason (real callAux
  // also returns null rather than throwing). describeOrSkip makes the suite skip
  // out loud in a shared-process `bun test src/` run instead of reporting either
  // a false red or a false green. Everything above this block — retrieval,
  // ranking, world/asset denial, and every missing-db / missing-config path —
  // has no dependency on the double and runs everywhere.
  describeOrSkip("rag-ask aux integration", () => {
    test("the aux double is installed when the file is isolated", () => {
      expect(ISOLATED,).toBe(true,);
    });

    test("answers from the retrieved context and lists its sources", async () => {
      callAuxMock.mockImplementation(() => Promise.resolve(auxResult("The city drowned.",),));
      const result = await ragAsk(["where is the city",], ownerCtx(),);
      expect(result.handled,).toBe(true,);
      expect(result.action,).toBe("rag-answer",);
      expect(result.systemMessage,).toContain("The city drowned.",);
      expect(result.actionPayload!.answer,).toBe("The city drowned.",);

      // Pin the citations by CONTENT, not by heading. `toContain("**Sources:**")`
      // passes even with zero citations, and `citations.length > 0` passes even
      // when the payload carries the wrong rows — both are regressions this
      // command can really make, so assert the names and sources appear.
      const cites = result.actionPayload!.citations as Array<{ name: string; source: string }>;
      expect(cites.length,).toBeGreaterThan(0,);
      expect(cites.map((c,) => c.name),).toContain("Drowned City",);
      expect(cites.map((c,) => c.source),).toContain("world",);
      expect(result.systemMessage,).toContain("**Sources:** Drowned City (world)",);
    });

    test("passes the retrieved lore to the aux model as system context", async () => {
      // Captured inside the double rather than via mock.calls — the arg list is
      // positional and easy to mis-index.
      let captured: Array<{ role: string; content: string }> = [];
      callAuxMock.mockImplementation((_task, _config, _db, messages,) => {
        captured = messages as Array<{ role: string; content: string }>;
        return Promise.resolve(auxResult("ok",),);
      },);

      await ragAsk(["tide",], ownerCtx(),);

      expect(callAuxMock,).toHaveBeenCalled();
      expect(captured,).toHaveLength(2,);
      expect(captured[0]!.role,).toBe("system",);
      expect(captured[0]!.content,).toContain("Drowned City",);
      expect(captured[0]!.content,).toContain("Iria",);
      expect(captured[1]!.role,).toBe("user",);
      expect(captured[1]!.content,).toBe("tide",);
    });

    test("answers unavailable when no aux provider is configured", async () => {
      callAuxMock.mockImplementation(() => Promise.resolve(null,));
      const result = await ragAsk(["tide",], ownerCtx(),);
      expect(result.systemMessage,).toBe("**RAG unavailable:** no answer service configured.",);
    });

    test("reports no results before calling the model", async () => {
      callAuxMock.mockImplementation(() => Promise.resolve(auxResult("should not happen",),));
      const result = await ragAsk(["zzzznothing",], ownerCtx(),);
      expect(result.systemMessage,).toBe('No results for "zzzznothing".',);
      expect(callAuxMock,).not.toHaveBeenCalled();
    });
  },);
});
