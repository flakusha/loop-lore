// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the internal-traits prompt section (always on, empty when traitless). */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertCharacterInternalTraits, insertUsers, } from "../../../test-utils/insert-helpers";
import type { AssembleActor, AssembleChat, AssembleContext, } from "../types";
import { internalTraitsSection, } from "./internal-traits";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

function ctxWith(): AssembleContext {
  const actor: AssembleActor = {
    id: "actor-1",
    display_name: "Alice",
    system_prompt: null,
    description: null,
    personality: null,
    scenario: null,
    post_history_instructions: null,
    mes_example: null,
    agent_role: null,
  };
  const chat: AssembleChat = {
    id: "chat-1",
    mode: "story",
    world_id: null,
    current_location_id: null,
  };
  return {
    db,
    actor,
    chat,
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "m", },
    isStory: true,
    tokenBudget: 4000,
  };
}

describe("internalTraitsSection", () => {
  test("always enabled; build defers to stored traits", () => {
    expect(internalTraitsSection.enabled(ctxWith(),),).toBe(true,);
  });

  test("build is empty when the database is unreachable", async () => {
    const ctx = { ...ctxWith(), db: {} as unknown as Kysely<DB>, };
    const out = await internalTraitsSection.build(ctx,);
    expect(Array.isArray(out,) ? out : [],).toEqual([],);
  });

  test("build is empty when the actor has no traits", async () => {
    resetTestDb(sqlite,);
    const out = await internalTraitsSection.build(ctxWith(),);
    expect(Array.isArray(out,) ? out : [],).toEqual([],);
  });

  test("build wraps stored traits as a trailing system message", async () => {
    resetTestDb(sqlite,);
    await insertUsers(db, "user-1", "User", { id: "user-1", },);
    await insertActors(db, "Alice", { id: "actor-1", user_id: "user-1", } as never,);
    await insertCharacterInternalTraits(db, "actor-1", {
      aspirations: JSON.stringify([{
        id: "a1",
        goal: "Find the lost sword",
        priority: "high",
        visibility: "open",
        progress: 0,
        plans: [],
      },],),
      voice_patterns: JSON.stringify({ humor_style: "none", verbal_tics: [], },),
      visibility: JSON.stringify(["*",],),
    },);
    const out = await internalTraitsSection.build(ctxWith(),);
    expect(Array.isArray(out,) ? out.length : 0,).toBe(1,);
    const msg = (out as { role: string; content: string }[])[0]!;
    expect(msg.role,).toBe("system",);
    expect(msg.content,).toContain("<internal_traits>",);
    expect(msg.content,).toContain("Find the lost sword",);
  });
});
