import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { storeEmbedding, } from "../../memory/embeddings";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActorMemories, insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { createMemoryProviders, } from "./memories";

let db: Kysely<DB>;
let sqlite: Database;
let actorId: string;
let dragonId: string;
let ledgerId: string;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  const userId = uid();
  actorId = uid();
  dragonId = uid();
  ledgerId = uid();
  await insertUsers(db, "mem-user", "User", { id: userId, } as never,);
  await insertActors(db, "Sage", { id: actorId, user_id: userId, } as never,);
  await insertActorMemories(db, actorId, "the dragon hoard lies under the mountain", {
    id: dragonId,
  } as never,);
  await insertActorMemories(db, actorId, "tavern ledger shows unpaid tabs", {
    id: ledgerId,
  } as never,);
  await storeEmbedding(db, dragonId, new Float32Array([1, 0, 0,],),);
  await storeEmbedding(db, ledgerId, new Float32Array([0, 1, 0,],),);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

const scope = { kind: "memories", actorId: "placeholder", } as const;

describe("search/providers/memories (keyword)", () => {
  test("FTS matches memory content for the scoped actor", async () => {
    const { keyword, } = createMemoryProviders(db,);
    const hits = await keyword({ q: "dragon hoard", mode: "keyword", }, { ...scope, actorId, },);
    expect(hits.map((h,) => h.id),).toContain(dragonId,);
    expect(hits.map((h,) => h.id),).not.toContain(ledgerId,);
  });
  test("other actors see nothing", () => {
    const { keyword, } = createMemoryProviders(db,);
    expect(
      keyword({ q: "dragon", mode: "keyword", }, { ...scope, actorId: uid(), },),
    ).resolves.toEqual([],);
  });
});

describe("search/providers/memories (vector)", () => {
  test("cosine ranks the closest stored vector first", async () => {
    const { vector, } = createMemoryProviders(db, {
      embedQuery: async () => new Float32Array([1, 0, 0,],),
    },);
    const hits = await vector({ q: "anything", mode: "vector", minScore: 0, }, { ...scope, actorId, },);
    expect(hits[0]?.id,).toBe(dragonId,);
    expect(hits[0]?.score,).toBeCloseTo(1,);
    expect(hits[0]?.source,).toBe("vector",);
    expect(hits[0]?.payload.content,).toContain("dragon hoard",);
  });
});
