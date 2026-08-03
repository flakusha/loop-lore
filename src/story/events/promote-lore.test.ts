/**
 * Event → Lore Promotion tests.
 *
 * Promotes a validated world event into a structured `world_lore_entries` row with an
 * optional audience scope (docs/spec/lore.md §4). Covers:
 *   - content derivation (newLoreEntry / description fallback)
 *   - audience_scope JSON normalization + storage
 *   - audience-visibility after promotion (elf sees it, human does not)
 *   - empty content → no row
 *   - end-to-end: applyEvents on a WorldLoreUpdate event creates the structured row
 *     (and can be opted out via data.promoteToLore === false)
 */
import { describe, expect, test, } from "bun:test";
import { isLoreVisibleTo, parseLoreScope, } from "../../assistant/lore/audience";
import { WorldEventType, } from "../../db/enums-story";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { applyEvents, } from "./application";
import { promoteEventToLore, } from "./promote-lore";

async function setupWorld() {
  const env = await createTestDb();
  await insertUsers(env.db, "gm", "GM",);
  const user = await env.db.selectFrom("users",).select("id",).limit(1,).executeTakeFirstOrThrow();
  await insertWorlds(env.db, user.id, "Castle World",);
  const world = await env.db.selectFrom("worlds",).select("id",).limit(1,).executeTakeFirstOrThrow();
  return { ...env, worldId: world.id, };
}

describe("promoteEventToLore — event → world lore", () => {
  test("creates a structured world_lore_entries row from an event", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized.
    }
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await promoteEventToLore(db, worldId, {
        description: "A battle is won.",
        data: { newLoreEntry: "The western gate fell to the Dark Elf warband.", },
      },);

      expect(id,).toBeString();
      const rows = await db
        .selectFrom("world_lore_entries",)
        .select(["id", "world_id", "content", "audience_scope", "enabled",],)
        .where("id", "=", id!,)
        .execute();

      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.world_id,).toBe(worldId,);
      expect(rows[0]!.content,).toBe("The western gate fell to the Dark Elf warband.",);
      expect(rows[0]!.enabled,).toBe("enabled",);
      // No audience scope supplied → null (visible to everyone).
      expect(rows[0]!.audience_scope,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("stores a normalized audience_scope and gates visibility by race", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await promoteEventToLore(db, worldId, {
        description: "New fact.",
        data: {
          newLoreEntry: "The Sacred Relic is hidden beneath the castle.",
          audienceScope: { subject: { kind: "race", race: "dark elf", }, },
        },
      },);

      const rows = await db.selectFrom("world_lore_entries",).select(["audience_scope",],).execute();
      expect(rows,).toHaveLength(1,);

      const scope = parseLoreScope(rows[0]!.audience_scope,);
      expect(scope,).not.toBeNull();

      const visibleToElf = isLoreVisibleTo({ audienceScope: scope, }, {
        race: "dark elf",
        professions: [],
        locationId: null,
      },);
      const visibleToHuman = isLoreVisibleTo({ audienceScope: scope, }, {
        race: "human",
        professions: [],
        locationId: null,
      },);

      expect(visibleToElf,).toBeTrue();
      expect(visibleToHuman,).toBeFalse();
    } finally {
      sqlite.close();
    }
  });

  test("rejects malformed audience_scope, storing null", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await promoteEventToLore(db, worldId, {
        description: "New fact.",
        data: {
          newLoreEntry: "A strange omen appears in the sky.",
          audienceScope: { subject: { kind: "hyperspace", }, },
        },
      },);

      const rows = await db.selectFrom("world_lore_entries",).select("audience_scope",).execute();
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.audience_scope,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("returns null and writes nothing when there is no content", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await promoteEventToLore(db, worldId, {
        description: "",
        data: {},
      },);

      expect(id,).toBeNull();
      const rows = await db.selectFrom("world_lore_entries",).select("id",).execute();
      expect(rows,).toHaveLength(0,);
    } finally {
      sqlite.close();
    }
  });
});

describe("applyEvents — WorldLoreUpdate promotes to structured lore", () => {
  test("creates a world_lore_entries row and honors promoteToLore opt-out", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const countRows = () => db.selectFrom("world_lore_entries",).select("id",).execute();

      // Default: promoted.
      await applyEvents({
        db,
        worldId,
        events: [{
          type: WorldEventType.WorldLoreUpdate,
          timestamp: new Date().toISOString(),
          description: "Lore update",
          data: { newLoreEntry: "The old king died and his heir was crowned.", },
        },],
      },);
      expect(await countRows(),).toHaveLength(1,);

      // Opt-out: data.promoteToLore === false suppresses promotion.
      await applyEvents({
        db,
        worldId,
        events: [{
          type: WorldEventType.WorldLoreUpdate,
          timestamp: new Date().toISOString(),
          description: "Lore update",
          data: { newLoreEntry: "A private court secret.", promoteToLore: false, },
        },],
      },);
      expect(await countRows(),).toHaveLength(1,);
    } finally {
      sqlite.close();
    }
  });
});
