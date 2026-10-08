/**
 * What-If Simulator tests (docs/spec/lore.md §5).
 *
 * Covers:
 *   - fork: non-prime world_timelines row, no mutation of the prime timeline
 *   - simulateFork: N deterministic beats referencing the source timeline
 *   - diffBranches: onlyInA / onlyInB / shared classification
 *
 * Resource contract: each test owns a private in-memory SQLite DB from
 * `createTestDb()` (`:memory:` per call — no shared paths, ports, or globals),
 * released via `finally { sqlite.close(); }`. No ordering dependence.
 */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { seedBackstory, } from "./timeline/world-timeline";
import { createWhatIfSimulator, } from "./whatif-simulator";

// ── Helpers ─────────────────────────────────────────────────

/** */
function ensureLogger() {
  try {
    createLogger({ level: "error", },);
  } catch { /* Already initialized. */ }
}

/** */
async function setupWorld() {
  const env = await createTestDb();
  await insertUsers(env.db, "gm", "GM",);
  const user = await env.db.selectFrom("users",).select("id",).limit(1,).executeTakeFirstOrThrow();
  await insertWorlds(env.db, user.id, "Test World",);
  const world = await env.db.selectFrom("worlds",).select("id",).limit(1,).executeTakeFirstOrThrow();
  return { ...env, worldId: world.id, };
}

/** Seed the prime timeline row under a stable id inside the test's private DB. */
async function setupPrime(db: Awaited<ReturnType<typeof setupWorld>>["db"], worldId: string,): Promise<string> {
  await db.insertInto("world_timelines",).values({
    id: "prime",
    world_id: worldId,
    name: "Prime",
    is_prime: 1,
  },).execute();

  return "prime";
}

// ── Tests ───────────────────────────────────────────────────

describe("createWhatIfSimulator", () => {
  test("fork creates a non-prime timeline row", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const sim = createWhatIfSimulator({ db, worldId, timelineId: "prime", },);
      const forkId = await sim.fork("alt-branch",);

      const row = await db.selectFrom("world_timelines",).selectAll()
        .where("id", "=", forkId,).executeTakeFirstOrThrow();

      expect(row.world_id,).toBe(worldId,);
      expect(row.name,).toBe("alt-branch",);
      expect(Number(row.is_prime,),).toBe(0,);
      expect(forkId,).not.toBe("prime",);
    } finally {
      sqlite.close();
    }
  });

  test("fork does not mutate the prime timeline", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const primeId = await setupPrime(db, worldId,);
      await seedBackstory({ db, worldId, description: "Origin", occurredAt: "2020-01-01T00:00:00Z", },);

      const sim = createWhatIfSimulator({ db, worldId, timelineId: primeId, },);
      const forkId = await sim.fork("alt-branch",);

      const primeRows = await db.selectFrom("world_timeline_events",).selectAll()
        .where("timeline_id", "=", primeId,).execute();

      const forkRows = await db.selectFrom("world_timeline_events",).selectAll()
        .where("timeline_id", "=", forkId,).execute();

      expect(primeRows,).toHaveLength(1,);
      expect(primeRows[0]!.description,).toBe("Origin",);
      expect(forkRows,).toHaveLength(0,); // fork copies nothing; purely synthetic branch
      const prime = await db.selectFrom("world_timelines",).selectAll()
        .where("id", "=", primeId,).executeTakeFirstOrThrow();

      expect(Number(prime.is_prime,),).toBe(1,);
    } finally {
      sqlite.close();
    }
  });

  test("simulateFork returns N beats referencing the fork", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const primeId = await setupPrime(db, worldId,);
      await seedBackstory({ db, worldId, description: "The dragon awoke", occurredAt: "2020-01-01T00:00:00Z", },);

      const sim = createWhatIfSimulator({ db, worldId, timelineId: primeId, },);
      const forkId = await sim.fork("alt-branch",);
      const beats = await sim.simulateForkFor("the dragon never woke", forkId, 4,);

      expect(beats,).toHaveLength(4,);
      for (const beat of beats) {
        expect(beat.timelineId,).toBe(forkId,);
        expect(beat.description,).toContain("the dragon never woke",);
        expect(beat.id,).toBeTruthy();
      }

      // deterministic: same inputs, same descriptions
      const again = await sim.simulateForkFor("the dragon never woke", forkId, 4,);
      expect(again.map((b,) => b.description),).toEqual(beats.map((b,) => b.description),);
    } finally {
      sqlite.close();
    }
  });

  test("diffBranches classifies onlyInA / onlyInB / shared", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    await db.insertInto("world_timelines",).values({
      id: "tl-b",
      world_id: worldId,
      name: "Branch B",
      is_prime: 0,
    },).execute();

    try {
      // seedBackstory has no timelineId opt; rows default to timeline_id="prime".
      // An insert helper seeds tl-b rows directly.
      const seedOnB = async (description: string, occurredAt: string,) => {
        await db.insertInto("world_timeline_events",).values({
          world_id: worldId,
          event_type: "world_lore_update",
          description,
          data: null,
          occurred_at: occurredAt,
          timeline_id: "tl-b",
        },).execute();
      };

      // Shared event: same key (event_type, description, occurred_at) on both branches.
      await seedBackstory({ db, worldId, description: "Shared event", occurredAt: "2020-01-01T00:00:00Z", },);
      await seedOnB("Shared event", "2020-01-01T00:00:00Z",);
      // Branch-only events.
      await seedBackstory({ db, worldId, description: "Only in prime", occurredAt: "2020-02-01T00:00:00Z", },);
      await seedOnB("Only in B", "2020-03-01T00:00:00Z",);

      const sim = createWhatIfSimulator({ db, worldId, timelineId: "prime", },);
      const diff = await sim.diffBranches("prime", "tl-b",);

      expect(diff.shared.map((e,) => e.description),).toEqual(["Shared event",],);
      expect(diff.onlyInA.map((e,) => e.description),).toEqual(["Only in prime",],);
      expect(diff.onlyInB.map((e,) => e.description),).toEqual(["Only in B",],);
    } finally {
      sqlite.close();
    }
  });
});
