/**
 * Tests for routes/views/worlds-list.ts — dashboard card data + rendering
 * (TASK-world-dashboard previews).
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertLocations,
  insertLocationStates,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  formatRelativeAge,
  loadWorldListCards,
  renderWorldCard,
} from "./worlds-list";

describe("loadWorldListCards", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;
  let emptyWorldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: ownerId,
        username: `user-${ownerId}`,
        display_name: "Owner",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    worldId = uid();
    await insertWorlds(db, ownerId, "Preview World", {
      id: worldId,
      description: "A world with previews",
      updated_at: "2026-01-05T00:00:00.000Z",
    } as never,);

    const tavernId = await insertLocations(db, worldId, "Tavern",);
    const caveId = await insertLocations(db, worldId, "Cave",);
    await insertLocations(db, worldId, "Unused",);

    await insertLocationStates(db, tavernId, worldId, {
      time_of_day: "morning",
      weather: "clear",
      npcs_present: JSON.stringify(["actor-a", "actor-b", 42,],),
      updated_at: "2026-01-01T00:00:00.000Z",
    },);

    await insertLocationStates(db, caveId, worldId, {
      time_of_day: "night",
      weather: "storm",
      npcs_present: JSON.stringify(["actor-b", "actor-c",],),
      updated_at: "2026-01-02T00:00:00.000Z",
    },);

    emptyWorldId = uid();
    await insertWorlds(db, ownerId, "Empty World", { id: emptyWorldId, } as never,);
  },);

  test("aggregates location counts, distinct NPCs and freshest conditions", async () => {
    const worlds = await db.selectFrom("worlds",).selectAll().execute();
    const cards = await loadWorldListCards(db, worlds,);
    const preview = cards.find((c,) => c.id === worldId);

    expect(preview,).toBeDefined();
    expect(preview?.locationCount,).toBe(3,);
    // Distinct actor ids across both states (non-string entries ignored).
    expect(preview?.npcCount,).toBe(3,);
    // Freshest state (cave, 2026-01-02) wins.
    expect(preview?.timeOfDay,).toBe("night",);
    expect(preview?.weather,).toBe("storm",);
    expect(preview?.description,).toBe("A world with previews",);
  });

  test("a world without locations or states gets zeroed previews", async () => {
    const cards = await loadWorldListCards(db, [{
      id: emptyWorldId,
      name: "Empty World",
      description: null,
      updated_at: null,
    },],);

    expect(cards,).toHaveLength(1,);
    expect(cards[0]?.locationCount,).toBe(0,);
    expect(cards[0]?.npcCount,).toBe(0,);
    expect(cards[0]?.timeOfDay,).toBeNull();
    expect(cards[0]?.weather,).toBeNull();
  });

  test("empty input short-circuits to an empty list", async () => {
    expect(await loadWorldListCards(db, [],),).toEqual([],);
  });
});

describe("formatRelativeAge", () => {
  const NOW = Date.parse("2026-01-05T12:00:00.000Z",);

  test("formats just now / minutes / hours / days", () => {
    expect(formatRelativeAge("2026-01-05T11:59:40.000Z", NOW,),).toBe("just now",);
    expect(formatRelativeAge("2026-01-05T11:55:00.000Z", NOW,),).toBe("5m ago",);
    expect(formatRelativeAge("2026-01-05T09:00:00.000Z", NOW,),).toBe("3h ago",);
    expect(formatRelativeAge("2026-01-03T12:00:00.000Z", NOW,),).toBe("2d ago",);
  });

  test("falls back to the date beyond a month and to `never` for null/garbage", () => {
    expect(formatRelativeAge("2025-11-01T00:00:00.000Z", NOW,),).toBe("2025-11-01",);
    expect(formatRelativeAge(null, NOW,),).toBe("never",);
    expect(formatRelativeAge("not-a-date", NOW,),).toBe("never",);
  });
});

describe("renderWorldCard", () => {
  test("renders counts, conditions badges and escapes user content", () => {
    const html = renderWorldCard({
      id: "w1",
      name: "Evil <script>",
      description: "desc & <b>",
      updatedAt: "2026-01-05T11:55:00.000Z",
      locationCount: 7,
      npcCount: 2,
      timeOfDay: "night",
      weather: "storm",
    }, Date.parse("2026-01-05T12:00:00.000Z",),);

    expect(html,).toContain('data-testid="world-card-w1"',);
    expect(html,).toContain("📍 7 locations",);
    expect(html,).toContain("👤 2 NPCs",);
    expect(html,).toContain("5m ago",);
    expect(html,).toContain("night",);
    expect(html,).toContain("storm",);
    expect(html,).not.toContain("<script>",);
    expect(html,).toContain("&lt;script&gt;",);
    expect(html,).toContain("desc &amp; &lt;b&gt;",);
  });

  test("omits the conditions strip when no state data exists", () => {
    const html = renderWorldCard({
      id: "w2",
      name: "Bare",
      description: null,
      updatedAt: null,
      locationCount: 0,
      npcCount: 0,
      timeOfDay: null,
      weather: null,
    }, 0,);

    expect(html,).not.toContain("world-conditions",);
    expect(html,).toContain("never",);
  });
});
