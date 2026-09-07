import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { FantasyCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import { attemptDiscovery, } from "./discovery";

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

beforeEach(async () => {
  resetTestDb(sqlite,);
},);

describe("attemptDiscovery", () => {
  test("reports already-known when the context names an existing fantasy", async () => {
    await insertActors(db, "Hero", { id: "actor-hero", },);
    const first = await attemptDiscovery(
      db,
      "actor-hero",
      "mystical moonlit bondage ritual tonight",
      1,
    );
    expect(first.discovered,).toBeTrue();
    expect(await attemptDiscovery(db, "actor-hero", "mystical moonlit bondage ritual tonight", 1,),)
      .toEqual({ discovered: false, reason: "Already known", },);
  });

  test("reports no discovery when the roll fails", async () => {
    await insertActors(db, "Hero", { id: "actor-hero", },);
    expect(await attemptDiscovery(db, "actor-hero", "a thrilling new scene unfolds", 0,),).toEqual(
      { discovered: false, reason: "No discovery this time", },
    );
  });

  test("infers the fantasy name from the context words", async () => {
    await insertActors(db, "Hero", { id: "actor-hero", },);
    const result = await attemptDiscovery(
      db,
      "actor-hero",
      "mystical moonlit bondage ritual tonight",
      1,
    );
    expect(result.discovered,).toBeTrue();
    expect(result.fantasy?.name,).toBe("Mystical moonlit bondage",);
    expect(result.fantasy?.intensity,).toBe("mild",);
    expect(result.fantasy?.initialReaction,).toBe("neutral",);
    expect(result.fantasy?.discoveredThrough,).toBe("mystical moonlit bondage ritual tonight",);
    expect(result.reason,).toBeUndefined();
  });

  test.each([
    ["bondage ropes restrain willing partner", "bondage",],
    ["public exposure fantasy under moonlight", "exhibitionism",],
    ["watching lovers through quiet window", "voyeurism",],
    ["roleplaying costume adventure in castle", "roleplay",],
    ["dominant control dynamics explored together", "power_exchange",],
    ["secret sub obedience training tonight", "power_exchange",],
    ["gentle sensation touch with silk", "sensation",],
    ["group gathering with multiple partners", "group",],
    ["playful pet puppy training games", "pet_play",],
    ["sweet praise compliments whispered softly", "praise",],
    ["mystical moonlit castle adventure", "roleplay",],
  ] as Array<[string, FantasyCategory,]>,)(
    "infers %s as %s",
    async (context, category,) => {
      const actorId = `actor-${category}-${context.length}`;
      await insertActors(db, "Hero", { id: actorId, },);
      const result = await attemptDiscovery(db, actorId, context, 1,);
      expect(result.discovered,).toBeTrue();
      expect(result.fantasy?.category,).toBe(category,);
    },
  );
});
