/**
 * Behavior tests — keyphrase-triggered journal recall (TASK-KEYPHRASE-RECALL).
 *
 * Pins the three contracts the ticket lives on:
 *   1. match → the entry is forced into the prompt (audit marks keyphrase)
 *   2. repeat within the cooldown → no second forced injection
 *   3. no match → no keyphrase injection
 * plus the config flag and per-message limit overrides.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { MessageRole, MessageStatus, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { clearKeyphraseRecallCooldowns, recordKeyphraseRecall, } from "../../../memory/keyphrase-recall";
import type { MemoryEntry, } from "../../../memory/types";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { memorySection, } from "./memories";
import { applyKeyphraseRecalls, collectKeyphraseHits, type KeyphraseRecallCtx, } from "./memories-keyphrase";

const KEY_PHRASE = "moonstone relic";
const MARKER = "KEYPHRASE_JOURNAL_MARKER: the relic hums.";

/** Minimal MemoryEntry for direct hook tests. */
function makeEntry(id: string, keywords: string[],): MemoryEntry {
  return {
    id,
    actorId: "actor-1",
    content: `entry ${id}`,
    memoryType: "fact",
    confidence: 1,
    importance: 5,
    keywords,
    pinned: false,
    scope: "character",
    privacy: "public",
    shareability: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  } as unknown as MemoryEntry;
}

interface Fixture {
  ctx: KeyphraseRecallCtx;
  assembleCtx: AssembleContext;
  memoryId: string;
  sqlite: { close: () => void };
}

/**
 * @param opts
 * @param opts.withMatchMessage
 * @param opts.keywords - stored `keywords` column value. An array is stored
 *   as JSON; a bare string is written verbatim, so a test can plant a payload
 *   that is valid JSON but NOT an array.
 */
async function setup(opts: { withMatchMessage: boolean; keywords?: string[] | string },): Promise<Fixture> {
  const { db, sqlite, } = await createTestDb();
  await insertUsers(db, "human", "Human",);
  await insertActors(db, "Character",);
  const users = await db.selectFrom("users",).select(["id", "username",],).execute();
  const actors = await db.selectFrom("actors",).select(["id", "display_name",],).execute();
  const userId = users.find((u,) => u.username === "human")!.id;
  const charId = actors.find((a,) => a.display_name === "Character")!.id;
  await insertChats(db, "Keyphrase chat", userId, { mode: "story", },);
  const chat = await db.selectFrom("chats",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  await insertChatParticipants(db, chat.id, charId,);
  if (opts.withMatchMessage) {
    // status confirmed — the prompt-side recent-message query filters on it.
    await insertMessages(db, chat.id, charId, MessageRole.User, `Have you seen the ${KEY_PHRASE}?`, {
      status: MessageStatus.Confirmed,
    } as never,);
  }

  const memoryId = await insertActorMemories(db, charId, MARKER, {
    scope: "character",
    privacy: "public",
    pinned: "unpinned",
    keywords: JSON.stringify(opts.keywords ?? [KEY_PHRASE,],),
  } as never,);

  const ctx: KeyphraseRecallCtx = {
    db,
    chat: { id: chat.id, },
    actor: { id: charId, },
    params: { userId, },
  };

  const assembleCtx: AssembleContext = {
    db,
    actor: {
      id: charId,
      display_name: "Character",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: chat.id, mode: "story", world_id: null, current_location_id: null, },
    params: { actorId: charId, chatId: chat.id, modelId: "test-model", },
    isStory: false,
    tokenBudget: 4000,
    // Deterministic injection filter: 0.999 keeps `decide.ts` from selecting
    // the journal entry on its own, so only a keyphrase hit can inject it.
    randomFn: () => 0.999,
  };

  return { ctx, assembleCtx, memoryId, sqlite, };
}

async function keyphraseAuditCount(ctx: KeyphraseRecallCtx,): Promise<number> {
  const rows = await ctx.db
    .selectFrom("memory_audit_log",)
    .select(["details",],)
    .where("action", "=", "inject",)
    .execute();

  return rows.filter((row,) => row.details.includes("keyphrase",)).length;
}

beforeEach(() => {
  try {
    createLogger({ level: "error", },);
  } catch {
    // Already initialized — ignore.
  }

  clearKeyphraseRecallCooldowns();
},);

afterEach(() => {
  clearKeyphraseRecallCooldowns();
},);

describe("collectKeyphraseHits", () => {
  test("match → hit; no match → no hit", async () => {
    const hit = await setup({ withMatchMessage: true, },);
    try {
      const entries = [makeEntry("e1", [KEY_PHRASE,],),];
      expect(await collectKeyphraseHits(hit.ctx, entries,),).toHaveLength(1,);
    } finally {
      hit.sqlite.close();
    }

    const miss = await setup({ withMatchMessage: true, },);
    try {
      expect(await collectKeyphraseHits(miss.ctx, [makeEntry("e2", ["unrelated phrase",],),],),).toEqual([],);
    } finally {
      miss.sqlite.close();
    }

    const noMessage = await setup({ withMatchMessage: false, },);
    try {
      expect(await collectKeyphraseHits(noMessage.ctx, [makeEntry("e3", [KEY_PHRASE,],),],),).toEqual([],);
    } finally {
      noMessage.sqlite.close();
    }
  });

  test("config flag disables recall", async () => {
    const f = await setup({ withMatchMessage: true, },);
    try {
      await f.ctx.db.insertInto("system_config",)
        .values({ key: "memory_keyphrase_recall", value: "false", },)
        .execute();

      expect(await collectKeyphraseHits(f.ctx, [makeEntry("e1", [KEY_PHRASE,],),],),).toEqual([],);
    } finally {
      f.sqlite.close();
    }
  });

  test("config limit caps the hits", async () => {
    const f = await setup({ withMatchMessage: true, },);
    try {
      await f.ctx.db.insertInto("system_config",)
        .values({ key: "memory_keyphrase_recall_limit", value: "1", },)
        .execute();

      const hits = await collectKeyphraseHits(f.ctx, [
        makeEntry("e1", [KEY_PHRASE,],),
        makeEntry("e2", [KEY_PHRASE,],),
      ],);

      expect(hits,).toHaveLength(1,);
    } finally {
      f.sqlite.close();
    }
  });

  test("cooldown suppresses a repeat match for the same chat+memory", async () => {
    const f = await setup({ withMatchMessage: true, },);
    try {
      const entries = [makeEntry("e1", [KEY_PHRASE,],),];
      expect(await collectKeyphraseHits(f.ctx, entries,),).toHaveLength(1,);
      recordKeyphraseRecall({ chatId: f.ctx.chat.id, memoryId: "e1", },);
      expect(await collectKeyphraseHits(f.ctx, entries,),).toEqual([],);
    } finally {
      f.sqlite.close();
    }
  });
});

describe("applyKeyphraseRecalls", () => {
  test("appends forced hits, dedupes, and writes a keyphrase audit row", async () => {
    const f = await setup({ withMatchMessage: false, },);
    try {
      const selected = [makeEntry("e1", [],),];
      const merged = await applyKeyphraseRecalls(f.ctx, selected, [
        makeEntry("e1", [KEY_PHRASE,],),
        makeEntry("e2", [KEY_PHRASE,],),
      ],);

      expect(merged.map((m,) => m.id),).toEqual(["e1", "e2",],);
      expect(await keyphraseAuditCount(f.ctx,),).toBe(1,);
      const plain = await applyKeyphraseRecalls(f.ctx, selected, [],);
      expect(plain,).toEqual(selected,);
      expect(await keyphraseAuditCount(f.ctx,),).toBe(1,);
    } finally {
      f.sqlite.close();
    }
  });

  test("forced hits spanning two actors get one audit row per actor", async () => {
    const f = await setup({ withMatchMessage: false, },);
    try {
      const a1: MemoryEntry = { ...makeEntry("e1", [KEY_PHRASE,],), actorId: "actor-a", };
      const a2: MemoryEntry = { ...makeEntry("e2", [KEY_PHRASE,],), actorId: "actor-b", };
      const merged = await applyKeyphraseRecalls(f.ctx, [], [a1, a2,],);
      expect(merged.map((m,) => m.id),).toEqual(["e1", "e2",],);

      const rows = await f.ctx.db
        .selectFrom("memory_audit_log",)
        .select(["actor_id", "details",],)
        .where("action", "=", "inject",)
        .execute();

      const keyphraseRows = rows.filter((row,) => row.details.includes("keyphrase",));
      // A single row stamped with the FIRST entry's actorId would file
      // actor-b's memory under actor-a — the audit trail would misattribute it.
      expect(keyphraseRows.length,).toBe(2,);
      expect(keyphraseRows.map((row,) => row.actor_id).sort(),).toEqual(["actor-a", "actor-b",],);
    } finally {
      f.sqlite.close();
    }
  });
});

describe("memorySection — keyphrase recall end-to-end", () => {
  // Determinism comes from the REAL seam, not a `Math.random` spy: `setup()`
  // puts `randomFn: () => 0.999` on the AssembleContext, `memories.ts` threads
  // it into `InjectionContext.randomFn`, and `injection/decide.ts` consumes it.
  // Before that seam existed this suite fell through to `Math.random` and
  // measured ~25-35% failures (pre-fix 14/40, post-fix 10/40 — the rate
  // predates the audit fix). Pinning the roll high keeps the probabilistic
  // filter from selecting the journal entry on its own, so the keyphrase match
  // is the ONLY thing that can put it in the prompt — which is what these
  // tests are actually about.

  test("match injects the journal entry into the prompt; cooldown blocks the re-inject", async () => {
    // Pin the prompt-selection coin flip: unstubbed, Math.random sometimes
    // picks the competing importance-5 entry, dedupe then drops the keyphrase
    // audit row, and this test flakes (~2/3).
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    const f = await setup({ withMatchMessage: true, },);
    try {
      const first = await memorySection.build(f.assembleCtx,);
      const output = first.map((m,) => m.content).join("\n",);
      expect(output,).toContain("KEYPHRASE_JOURNAL_MARKER",);
      expect(await keyphraseAuditCount(f.ctx,),).toBe(1,);

      // Second assembly within the cooldown: no further keyphrase injection.
      const second = await memorySection.build(f.assembleCtx,);
      expect(second,).toBeDefined();
      expect(await keyphraseAuditCount(f.ctx,),).toBe(1,);
    } finally {
      Math.random = originalRandom;
      f.sqlite.close();
    }
  });

  test("no keyphrase match → no keyphrase injection", async () => {
    const f = await setup({ withMatchMessage: true, keywords: ["unrelated phrase",], },);
    try {
      const built = await memorySection.build(f.assembleCtx,);
      expect(built,).toBeDefined();
      expect(await keyphraseAuditCount(f.ctx,),).toBe(0,);
    } finally {
      f.sqlite.close();
    }
  });

  // The `keywords` column is a JSON blob, so any writer can put something
  // that PARSES but is not an array in it. `memories-helpers` already defends
  // against unparseable text (`safeJsonParse` → `[]`); it did not defend
  // against valid-JSON-non-array, and `findKeyphraseMatches` calls `.some()` on
  // the value — so one such row used to throw `keywords.some is not a
  // function` out of prompt assembly and take the whole generation with it.
  // An unusable column must degrade to "no triggers", never to a crash.
  test("a keywords column that is valid JSON but not an array degrades, never throws", async () => {
    const f = await setup({ withMatchMessage: true, keywords: JSON.stringify(KEY_PHRASE,), },);
    try {
      const built = await memorySection.build(f.assembleCtx,);
      // No trigger list survived, so nothing is keyphrase-injected.
      expect(await keyphraseAuditCount(f.ctx,),).toBe(0,);
      expect(built,).toBeDefined();
    } finally {
      f.sqlite.close();
    }
  });
});
